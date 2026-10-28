import argparse
import csv
import json
from pathlib import Path
import sqlite3

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from master_main import run_master
from verify_master_outputs import verify_master
from src.grade_extractor import extract_standardized_hadith_grade
from src.isnad_parser import IsnadParser, name_key
from src.itqan_crosscheck import corroboration_candidates
from src.itqan_schema import MASTER_COLUMNS, book_url
from src.itqan_sources import iter_profiles
from src.loaders import LK_COLUMNS
from src.master_registry import MASTER_REGISTRY
from src.quran_bridge import QuranBridge, canonicalize_itqan_alias, lexical_key
from src.rijal_matcher import RijalMatcher, calibrate_chain, classify_narrator_grade
from src.shamela_registry import PAGE_COLUMNS, REGISTRY
from src.shamela_loader import ingest
from src.sharh_parser import parse_sharh


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')


@pytest.fixture
def upstream(tmp_path):
    root = tmp_path / 'itqan'
    write_json(root / 'src/isnad_father_map.json', {'هشام بن عروة': 'عروة بن الزبير', 'عمرو بن شعيب': 'شعيب بن محمد'})
    write_json(root / 'src/isnad_grandfather_map.json', {'شعيب بن محمد': 'عبد الله بن عمرو بن العاص'})
    for kind in ['mother', 'grandmother', 'uncle']:
        write_json(root / f'src/isnad_{kind}_map.json', {})
    write_json(root / 'src/isnad_kunya_map.json', {'أبي هريرة': {'real': 'عبد الرحمن بن صخر الدوسي'}, 'أبو هريرة': {'real': 'عبد الرحمن بن صخر الدوسي'}})
    write_json(root / 'src/root_alias_map.json', {'دين': 'دون', 'بيع': 'بوع', 'صلي': 'صلو', 'هدي': 'هدو', 'أمن': 'ومن', 'أحد': 'وحد'})
    (root / 'src/match_narrator_grades.py').write_text('MANUAL_ALIASES = {}\n', encoding='utf-8')
    names = ['هشام بن عروة', 'عروة بن الزبير', 'عمرو بن شعيب', 'شعيب بن محمد', 'عبد الله بن عمرو بن العاص', 'عبد الرحمن بن صخر الدوسي', 'سفيان بن سعيد الثوري', 'سفيان بن عيينة', 'حماد بن زيد', 'حماد بن سلمة', 'يحيى بن سعيد بن قيس الأنصاري', 'يحيى بن سعيد بن فروخ القطان']
    profiles = {str(i): {'id': i, 'full_name': name, 'grade_ar': 'ثقة', 'grade_en': 'reliable', 'kunya': '', 'death': '124', 'tabaqat': '', 'teachers': [], 'students': [], 'namings': [], 'classical_sources': {}, 'provenance': {}} for i, name in enumerate(names, 1)}
    write_json(root / 'app/data/rijal/profiles_reliable.json', profiles)
    write_json(root / 'app/data/rijal/manifest.json', {'total_profiles': len(profiles), 'files': [{'name': 'profiles_reliable.json', 'type': 'profiles', 'count': len(profiles)}]})
    roots = {'يوم': {'v': ['1:1']}, 'أمر': {'v': ['2:1']}, 'وقي': {'v': ['2:2']}, 'فتن': {'v': ['2:3']}, 'صلو': {'v': ['2:4']}, 'دين': {'v': ['1:4']}, 'بيع': {'v': ['2:275']}, 'أمن': {'v': ['2:3']}, 'وحد': {'v': ['112:1']}}
    write_json(root / 'quran/data/roots_index.json', roots)
    write_json(root / 'app/data/word_defs_v2.json', {'دين': {'r': 'دون'}, 'صلاة': {'r': 'صلو'}})
    write_json(root / 'app/data/wensinck.json', {'صلو': {'forms': ['يصلي']}})
    write_json(root / 'app/data/quran_hadith_bridge.json', {})
    write_json(root / 'app/data/hadith_connections.json', {})
    return root


def test_contextual_kinship_and_chained_grandfather(upstream):
    parser = IsnadParser(upstream)
    nodes = parser.parse('حدثنا هشام بن عروة عن أبيه')
    assert nodes[1]['resolved_name'] == 'عروة بن الزبير'
    nodes = parser.parse('حدثنا عمرو بن شعيب عن أبيه عن جده')
    assert [n['resolved_name'] for n in nodes] == ['عمرو بن شعيب', 'شعيب بن محمد', 'عبد الله بن عمرو بن العاص']
    assert [n['surface'] for n in nodes][1:] == ['أبيه', 'جده']


def test_kunya_peek_ahead_and_parallel_paths(upstream):
    parser = IsnadParser(upstream)
    assert parser.parse('عن أبي هريرة')[0]['resolved_name'] == 'عبد الرحمن بن صخر الدوسي'
    assert parser.parse('عن أبي عن هريرة')[0]['resolved_name'] == 'عبد الرحمن بن صخر الدوسي'
    nodes = parser.parse('حدثنا هشام بن عروة عن أبيه ح وحدثنا عمرو بن شعيب عن أبيه عن جده')
    assert {n['path'] for n in nodes} == {0, 1}
    assert [n['pos'] for n in nodes] == list(range(1, len(nodes)+1))


@pytest.mark.parametrize(('surface', 'previous', 'following', 'prefix'), [
    ('سفيان', 'الحميدي', 'عمرو بن دينار', 'سفيان بن عيينة'),
    ('سفيان', 'وكيع', 'منصور', 'سفيان بن سعيد'),
    ('حماد', 'مسدد', 'هشام بن عروة', 'حماد بن زيد'),
    ('حماد', 'عفان', 'ثابت', 'حماد بن سلمة'),
    ('يحيى بن سعيد', 'مالك', 'عمرة', 'يحيى بن سعيد بن قيس'),
    ('يحيى بن سعيد', 'مسدد', 'بندار', 'يحيى بن سعيد بن فروخ'),
])
def test_contextual_homonyms(upstream, surface, previous, following, prefix):
    matcher = RijalMatcher(upstream)
    result = matcher.resolve(surface, previous, following)
    assert name_key(result['resolved_name']).startswith(name_key(prefix))
    assert result['rijal_id'] is not None


def test_grade_specificity_and_parallel_calibration():
    assert classify_narrator_grade('صدوق يخطئ')[0] == 'Saduq Yahim'
    assert classify_narrator_grade('ضعيف جدا')[0] == "Da'if Jiddan"
    assert classify_narrator_grade('كذاب وليس بثقة')[1] == 0
    tier, score = calibrate_chain([{'path': 0, 'grade_tier': "Da'if"}, {'path': 0, 'grade_tier': 'Thiqah'}, {'path': 1, 'grade_tier': 'Saduq'}, {'path': 1, 'grade_tier': 'Thiqah'}])
    assert tier == 'Saduq' and score == .8


def test_ocr_grade_keeps_source_and_qualifiers():
    source = 'إجناده صحبح على شرط الشيخين'
    result = extract_standardized_hadith_grade(source)
    assert result['arabic'] == 'إسناده صحيح على شرط الشيخين'
    assert result['english'] == 'Sahih (Bukhari & Muslim standard)'
    assert result['source_text'] == source
    assert not extract_standardized_hadith_grade('ليس إسناده صحيح')


@pytest.mark.parametrize(('source', 'variant'), [('دين', 'دون'), ('بيع', 'بوع'), ('صلي', 'صلو'), ('هدي', 'هدو'), ('أمن', 'ومن'), ('أحد', 'وحد')])
def test_upstream_alias_convention(upstream, source, variant):
    aliases = json.loads((upstream / 'src/root_alias_map.json').read_text(encoding='utf-8'))
    assert canonicalize_itqan_alias(source, aliases) == variant


def test_quran_canonical_vocabulary_and_no_ta_marbuta_collapse(upstream):
    bridge = QuranBridge(upstream)
    assert lexical_key('مدرسة') != lexical_key('مدرسه')
    assert bridge.to_quran('دون') == 'دين'
    roots, ayahs, words, methods = bridge.extract('يوم أمر تقوى فتنة صلاة')
    assert roots == sorted(['يوم', 'أمر', 'وقي', 'فتن', 'صلو'])
    assert set(ayahs) == {'1:1', '2:1', '2:2', '2:3', '2:4'}


def test_hamza_alias_maps_to_actual_pack_spelling(upstream):
    path = upstream / 'quran/data/roots_index.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    data['امن'] = data.pop('أمن')
    write_json(path, data)
    bridge = QuranBridge(upstream)
    assert bridge.to_quran('ومن') == 'امن'


def test_crossbook_corroboration_uses_text_not_theme_score():
    text = 'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى فمن كانت هجرته إلى الله ورسوله'
    rows = [{'book_key': b, 'Hadith_number': '1', 'Arabic_Matn': t} for b, t in [('Bukhari', text), ('Muslim', text), ('AbuDaud', 'كلام مختلف تماما لا يتناول نفس الموضوع ولا يحمل لفظ الرواية')]]
    links = corroboration_candidates(rows)
    assert links[0][0]['book'] == 'Muslim' and links[0][0]['similarity'] > .99
    assert links[2] == []


def test_hf_auth_is_environment_only_without_implicit_store(tmp_path, monkeypatch):
    import huggingface_hub
    observed = []
    class NoNetwork:
        def __init__(self, token):
            observed.append(token)
        def dataset_info(self, *args, **kwargs):
            raise RuntimeError('controlled unavailable endpoint')
    monkeypatch.setattr(huggingface_hub, 'HfApi', NoNetwork)
    monkeypatch.delenv('HF_TOKEN', raising=False)
    with pytest.raises(RuntimeError, match='Cannot access HF metadata'):
        ingest(tmp_path / 'cache', {'551'})
    assert observed == [False]
    monkeypatch.setenv('HF_TOKEN', 'unit-test-credential')
    with pytest.raises(RuntimeError, match='Cannot access HF metadata'):
        ingest(tmp_path / 'cache2', {'551'})
    assert observed[-1] == 'unit-test-credential'


def test_zurqani_quoted_matn_and_separator_boundaries_do_not_merge_a_volume():
    def page(serial, text):
        return dict(zip(PAGE_COLUMNS, [serial, '7', 'شروح الحديث', 'شرح الزرقاني', '551', 'edition', 'publisher', serial, '1', text, 'None']))
    pages = [page('1', 'مقدمة قبل النص. وحدثني عن مالك عن نافع حديث أول ـــــــــــــ 1 - 1 - قوله: شرح أول'), page('2', 'تكملة الشرح الأول. وحدثني عن مالك عن زيد حديث ثان ـــــــــــــ 2 - باب جديد. 2 - 2 - قوله: شرح ثان')]
    units, diagnostics = parse_sharh(pages)
    assert len(units) == 2 and [u.number for u in units] == ['1', '2']
    assert 'تكملة الشرح الأول' in units[0].text
    assert 'حديث ثان' not in units[0].text
    assert 'شرح ثان' in units[1].text
    assert diagnostics['max_unit_chars'] < 200


def test_nine_book_end_to_end_schema_preservation_junctions_and_fts(tmp_path, upstream):
    lk, pages = tmp_path / 'lk', []
    text = 'حدثنا هشام بن عروة عن أبيه قال رسول الله إنما الأعمال بالنيات يوم أمر تقوى فتنة'
    source_ids = set()
    for book, pair in MASTER_REGISTRY.items():
        if pair.matn not in source_ids:
            pages.append(dict(zip(PAGE_COLUMNS, [pair.matn, '6', 'كتب السنة', REGISTRY[book].matn_title_key, pair.matn, 'edition', 'publisher', '1', '1', 'كتاب العلم\nباب العلم\n1 - '+text, 'إجناده صحبح على شرط الشيخين' if pair.mode == 'inline' else 'None'])))
            source_ids.add(pair.matn)
        if pair.mode != 'inline':
            sharh_text = ('وحدثني عن مالك '+text+' ـــــــــــــ 1 - 1 - قوله: بيان هذا الحديث') if pair.commentary == '551' else ('1 - قوله: ('+text+') بيان هذا الحديث')
            pages.append(dict(zip(PAGE_COLUMNS, [pair.commentary, '7', 'شروح الحديث', pair.title_key, pair.commentary, 'edition', 'publisher', '1', '1', sharh_text, 'None'])))
        aliases = REGISTRY[book].lk_aliases
        if aliases:
            path = lk / aliases[0] / 'Chapter1.csv'
            path.parent.mkdir(parents=True)
            record = dict.fromkeys(LK_COLUMNS, '')
            record.update(Chapter_Number='1', Section_Number='1', Hadith_number='1', Arabic_Hadith=text, Arabic_Isnad='حدثنا هشام بن عروة عن أبيه ', Arabic_Matn='قال رسول الله إنما الأعمال بالنيات يوم أمر تقوى فتنة', English_Hadith='Actions depend on intentions')
            with path.open('w', encoding='utf-8', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=LK_COLUMNS)
                writer.writeheader();writer.writerow(record)
        folder = upstream / 'app/data/sunni' / {'Bukhari':'bukhari','Muslim':'muslim','AbuDaud':'abudawud','Tirmidhi':'tirmidhi','Nesai':'nasai','IbnMajah':'ibnmajah','MuwattaMalik':'malik','MusnadAhmad':'ahmed','SunanDarimi':'darimi'}[book]
        write_json(folder / '1.json', [{'idInBook': 1, 'arabic': text, 'grade': 'Sahih'}])
    source = tmp_path / 'pages.parquet'
    pq.write_table(pa.Table.from_pylist(pages), source)
    args = argparse.Namespace(books=['all'], lk_dir=lk, itqan_dir=upstream, page_sources=[source], cache_dir=tmp_path / 'cache', output_dir=tmp_path / 'output', quran_roots=None, reuse_shamela=None, grade_policy='preserve')
    report = run_master(args)
    verified = verify_master(args.output_dir, lk)
    assert len(report['books']) == 9 and verified['records'] == 9
    assert verified['lk_cells_preserved'] == 96 and verified['lk_grade_cells_changed_by_policy'] == 0
    assert len(MASTER_COLUMNS) == 34
    with sqlite3.connect(args.output_dir / 'sunnah_kutub_tisah_itqan.sqlite') as db:
        assert db.execute('SELECT COUNT(*) FROM rijal_narrators').fetchone()[0] == 12
        assert db.execute('SELECT COUNT(*) FROM hadith_narrators WHERE rijal_id IS NOT NULL').fetchone()[0] >= 12
        assert db.execute('SELECT COUNT(*) FROM quran_hadith_root_bridge WHERE root_ar=?', ('وقي',)).fetchone()[0] == 9
        assert db.execute('SELECT rowid FROM hadiths_fts WHERE hadiths_fts MATCH ?', ('الاعمال',)).fetchone()
        assert db.execute('SELECT rowid FROM hadiths_fts WHERE hadiths_fts MATCH ?', ('Actions',)).fetchone()
    db.close()
    args.grade_policy = 'fill'
    args.output_dir = tmp_path / 'output-fill'
    run_master(args)
    filled = verify_master(args.output_dir, lk)
    assert filled['lk_grade_cells_changed_by_policy'] == 8
    with sqlite3.connect(args.output_dir / 'sunnah_kutub_tisah_itqan.sqlite') as db:
        assert db.execute("SELECT English_Grade FROM hadiths WHERE book_key='Bukhari'").fetchone()[0] == ''
        assert db.execute("SELECT English_Grade FROM hadiths WHERE book_key='AbuDaud'").fetchone()[0] == 'Sahih'
    db.close()
