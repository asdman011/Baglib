"""QuranLab download, matching, grading, provenance and merge tests."""
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
from types import SimpleNamespace

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

import quranlab_download as download
from src import quranlab_build as build
from src import quranlab_match as qm
from src.itqan_schema import MASTER_COLUMNS
from src.loaders import LK_COLUMNS
from src.master_exporter import open_master_database
from src.quranlab_grading import GradeParser, compare_judgments, load_graders
from src.quranlab_source import COLLECTIONS

CHAIN_A = 'حدثنا قتيبة حدثنا الليث عن نافع عن ابن عمر قال'
CHAIN_B = 'حدثنا مسدد حدثنا يحيى عن شعبة عن قتادة عن انس قال'
MATN = 'قال رسول الله البيعان بالخيار حتى يتفرقا او يكون بيع خيار وربما قال نافع او يقول احدهما للآخر اختر'
OTHER = 'نهى رسول الله عن بيع الثمار حتى يبدو صلاحها نهى البائع والمبتاع عن ذلك كله في كل حال'


def row(identity, number, chain, matn):
    return qm.corpus_row(identity, number, f'{chain} {matn}', chain, matn, identity)


def source(key, number, text):
    return SimpleNamespace(key=key, number=number, text=text)


def decide(records, corpus):
    return {item.source_key: item for item in qm.match_collection(records, corpus)}


def test_same_number_different_text_is_not_a_match():
    result = decide([source('c:1', '1', f'{CHAIN_B} {OTHER}')], [row(1, '1', CHAIN_A, MATN)])['c:1']
    assert result.hadith_id is None and result.decision in {'conflicting_identity', 'source_only'}


def test_same_text_different_number_matches_on_text():
    result = decide([source('c:900', '900', f'{CHAIN_A} {MATN}')], [row(1, '12.0', CHAIN_A, MATN)])['c:900']
    assert result.decision == 'verified_match' and result.hadith_id == 1 and result.number_agrees is False


def test_repeated_text_uses_number_only_to_separate_identical_rows():
    corpus = [row(1, '7', CHAIN_A, MATN), row(2, '8', CHAIN_A, MATN)]
    assert decide([source('c:8', '8', f'{CHAIN_A} {MATN}')], corpus)['c:8'].hadith_id == 2
    ambiguous = decide([source('c:9', '9', f'{CHAIN_A} {MATN}')], corpus)['c:9']
    assert ambiguous.decision == 'candidate_review' and ambiguous.relation == 'one_to_many' and ambiguous.hadith_id is None


def test_same_matn_on_another_chain_is_rejected():
    result = decide([source('c:1', '1', f'{CHAIN_B} {MATN}')], [row(1, '1', CHAIN_A, MATN)])['c:1']
    assert result.hadith_id is None


def test_each_chain_links_to_its_own_row():
    corpus = [row(1, '1', CHAIN_A, MATN), row(2, '2', CHAIN_B, MATN)]
    result = decide([source('c:1', '50', f'{CHAIN_B} {MATN}'), source('c:2', '51', f'{CHAIN_A} {MATN}')], corpus)
    assert result['c:1'].hadith_id == 2 and result['c:2'].hadith_id == 1


def test_short_partial_quotation_never_establishes_identity():
    result = decide([source('c:1', '1', 'البيعان بالخيار')], [row(1, '1', CHAIN_A, MATN)])['c:1']
    assert result.hadith_id is None


def test_source_with_a_trailing_chain_attaches_to_the_opening_row_only():
    corpus = [row(1, '1', CHAIN_A, MATN), row(2, '2', CHAIN_B, OTHER)]
    result = decide([source('c:1', '1', f'{CHAIN_A} {MATN} {CHAIN_B} {OTHER}')], corpus)['c:1']
    assert result.hadith_id == 1 and result.relation == 'source_extends_corpus' and result.tail_tokens > 0


def test_closing_remark_kept_in_a_separate_field_still_matches():
    corpus = [qm.corpus_row(1, '1', f'{CHAIN_A} {MATN}', CHAIN_A, MATN, 0, 'تابعه عمرو اخبرنا شعبة')]
    result = decide([source('c:1', '1', f'{CHAIN_A} {MATN} تابعه عمرو اخبرنا شعبة')], corpus)['c:1']
    assert result.method == 'exact_with_closing_remark' and result.hadith_id == 1


def test_two_reports_inside_one_corpus_row_are_marked_as_parts():
    corpus = [row(1, '1', CHAIN_A, f'{MATN} {CHAIN_B} {OTHER}')]
    result = decide([source('c:1', '1', f'{CHAIN_A} {MATN}'), source('c:2', '2', f'{CHAIN_B} {OTHER}')], corpus)
    assert result['c:1'].relation == 'corpus_extends_source' and result['c:2'].relation == 'corpus_contains_report'
    assert result['c:1'].hadith_id == result['c:2'].hadith_id == 1


def test_many_to_one_claims_become_a_conflict():
    text = f'{CHAIN_A} {MATN}'
    result = decide([source('c:1', '5', text), source('c:2', '6', text)], [row(1, '9', CHAIN_A, MATN)])
    assert all(item.hadith_id is None and item.relation == 'many_to_one' for item in result.values())


def test_number_is_kept_as_a_string_and_only_cleaned_for_comparison():
    assert qm.clean_number('402.0') == '402' and qm.clean_number('402.2') == '402.2' and qm.clean_number('007') == '007'


def test_taa_marbuta_is_not_folded_for_matching():
    assert qm.match_tokens('فاطمة') != qm.match_tokens('فاطمه')


def test_report_in_collection_refuses_rows_with_repeated_text():
    corpus = [row(1, '1', CHAIN_A, MATN), row(2, '2', CHAIN_B, MATN)]
    link = qm.match_report('h:1', qm.match_tokens(MATN), 'Bukhari', qm.CorpusIndex(corpus))
    assert link.decision == 'candidate_review' and link.hadith_id is None


def test_nasai_kubra_is_not_the_mujtaba():
    assert 'Nesai' not in qm.attributed_books('رواه النسائي في الكبرى')
    assert qm.attributed_books('متفق عليه') == ['Bukhari', 'Muslim']


@pytest.fixture(scope='module')
def parser():
    return GradeParser()


@pytest.mark.parametrize('raw,arabic,scope', [('Sahih', 'صحيح', 'hadith'), ('Hasan Sahih', 'حسن صحيح', 'hadith'), ('Very Daif', 'ضعيف جدًا', 'hadith'), ('Mawdu', 'موضوع', 'hadith'), ('Sahih Lighairihi', 'صحيح لغيره', 'hadith'), ('Hasan Lighairihi', 'حسن لغيره', 'hadith'), ('Isnaad Sahih', 'إسناده صحيح', 'isnad'), ('Isnaad Hasan', 'إسناده حسن', 'isnad'), ('Sahih - Agreed Upon', 'صحيح، متفق عليه', 'transmission_attribution')])
def test_reviewed_terms(parser, raw, arabic, scope):
    parsed = parser.parse(raw)
    assert (parsed.grade_ar, parsed.scope) == (arabic, scope) and parsed.review_status == 'glossary_reviewed'


def test_isnad_and_hadith_rulings_stay_separate(parser):
    assert parser.parse('Sahih').family == parser.parse('Isnaad Sahih').family
    assert parser.parse('Sahih').scope != parser.parse('Isnaad Sahih').scope


def test_citation_is_a_reference_not_a_ruling_by_the_collection(parser):
    parsed = parser.parse('Sahih Bukhari (815) Sahih Muslim (490)')
    assert parsed.scope == 'transmission_attribution' and parsed.grade_ar == 'صحيح البخاري (815) وصحيح مسلم (490)'
    assert [json.loads(item)['numbers'] for item in parsed.references] == [['815'], ['490']]


def test_arabic_comma_in_a_citation_is_not_arabic_wording(parser):
    parsed = parser.parse('Sahih Bukhari (5342، 5343) Sahih Muslim (938)')
    assert parsed.review_status == 'glossary_reviewed' and parsed.scope == 'transmission_attribution'


def test_isnad_ruling_with_a_citation_keeps_both(parser):
    parsed = parser.parse('Isnaad Sahih Sahih Muslim (1780)')
    assert parsed.scope == 'mixed_isnad_and_attribution' and parsed.grade_ar == 'إسناده صحيح، صحيح مسلم (1780)'


@pytest.mark.parametrize('raw', ['Shadh, Sahih', 'Sahih  Witness Sahih Muslim (99)', 'Sahih Muslim (12)After (13)', 'Sahih Bukhari (12)Mukhtasar) Sahih Muslim (13)', 'Authentic', 'Sound', 'Sahih - Isnaad Hasan Bukhari And Muslim'])
def test_unknown_or_qualified_english_gets_no_arabic(parser, raw):
    parsed = parser.parse(raw)
    assert parsed.grade_ar is None and parsed.review_status == 'needs_review' and parsed.grade_raw == raw


def test_qualified_arabic_stays_whole_and_unclassified(parser):
    raw = 'صحيح دون قوله: (ولم يستدر)'
    parsed = parser.parse(raw)
    assert parsed.grade_ar == raw and parsed.review_status == 'needs_review' and parsed.scope == 'unresolved'


def test_placeholder_and_empty_are_not_judgments(parser):
    assert parser.parse('-').review_status == 'not_a_judgment'
    assert parser.parse('').review_status == 'not_a_judgment'


def test_comparison_stays_inside_one_scope():
    item = lambda scope, family: {'scope': scope, 'family': family}
    assert compare_judgments([item('hadith', 'sahih'), item('isnad', 'daif')]) == (False, False)
    assert compare_judgments([item('hadith', 'sahih'), item('hadith', 'daif')]) == (True, True)
    assert compare_judgments([item('hadith', 'sahih'), item('hadith', 'hasan')]) == (True, False)
    assert compare_judgments([item('transmission_attribution', 'sahih'), item('hadith', 'daif')]) == (False, False)


def test_grader_mapping_rules():
    graders = load_graders()
    assert all(entry['evidence'] for entry in graders.values() if entry['status'] == 'verified')
    assert all(entry['name_ar'] is None for entry in graders.values() if entry['status'] == 'needs_review')
    board = graders['HadeethEnc (IslamHouse / Saudi MoIA) editorial board']
    assert board['role'] == 'institution' and board['status'] == 'not_a_person'


def write_table(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.Table.from_pylist(rows), path)


def fawaz(key, number, text, language, grades=()):
    return {'hadith_key': key, 'urn': int(key.split(':')[1]), 'seq': 1, 'collection': key.split(':')[0], 'language': language, 'hadith_number': number, 'number_sort': 1, 'book_number': 1, 'in_book_number': 1, 'sunnah_url': None, 'text': text, 'grades': [{'grader': grader, 'grade': grade} for grader, grade in grades], 'n_grades': len(grades), 'grade_summary': None, 'is_muallaq': False}


GRADES = [('Al-Albani', 'Sahih'), ('Zubair Ali Zai', 'Daif'), ('Unknown Reviewer', 'Isnaad Hasan'), ('Abu Ghuddah', '-')]
REPORT_TEXT = 'البيعان بالخيار حتى يتفرقا او يكون بيع خيار وربما قال نافع او يقول احدهما للآخر اختر'


def build_fixture(base_dir):
    base_dir = Path(base_dir)
    root = base_dir / 'quranlab'
    collections_data = {name: [fawaz(f'{name}:1', '1', f'{CHAIN_A} {MATN} {name}', 'ar')] for name in COLLECTIONS}
    collections_data['abudawud'] = [fawaz('abudawud:1', '300', f'{CHAIN_A} {MATN}', 'ar', GRADES), fawaz('abudawud:2', '99', f'{CHAIN_B} {OTHER}', 'ar', [('Al-Albani', 'Hasan')])]
    collections_data['malik'] = [fawaz('malik:1', '1', f'{CHAIN_B} {OTHER}', 'ar', [('Salim al-Hilali', 'Mauquf Sahih')])]
    for name, rows in collections_data.items():
        write_table(root / f'{name}-ar/train-00000-of-00001.parquet', rows)
    write_table(root / 'abudawud-en/train-00000-of-00001.parquet', [fawaz('abudawud:1', '300', 'The two parties may choose', 'en', GRADES)])
    write_table(root / 'abudawud-fr/train-00000-of-00001.parquet', [fawaz('abudawud:1', '300', 'Les deux parties', 'fr', GRADES)])
    write_table(root / 'malik-en/train-00000-of-00001.parquet', [fawaz('malik:1', '1', 'He forbade selling fruit', 'en', [('Salim al-Hilali', 'Mauquf Sahih')])])
    for name in ('nawawi', 'qudsi', 'dehlawi'):
        write_table(root / f'{name}-ar/train-00000-of-00001.parquet', [fawaz(f'{name}:1', '1', f'نص {name}', 'ar')])
    he = {'hadith_key': 'hadeethenc:1', 'hadeethenc_id': 1, 'collection': 'hadeethenc', 'title': 'عنوان', 'intro': '', 'grader': 'HadeethEnc (IslamHouse / Saudi MoIA) editorial board', 'grade_source': 'HadeethEnc.com', 'explanation': 'شرح موجز'}
    write_table(root / 'hadeethenc-ar/train-00000-of-00001.parquet', [{**he, 'language': 'ar', 'text': REPORT_TEXT, 'grade': 'صحيح', 'attribution_text': 'رواه أبو داود'}])
    write_table(root / 'hadeethenc-en/train-00000-of-00001.parquet', [{**he, 'language': 'en', 'text': 'Report', 'grade': 'Authentic', 'attribution_text': 'Narrated by Abu Daoud', 'title': 'Title', 'explanation': 'Short'}])
    write_table(root / 'index/train-00000-of-00001.parquet', [{'hadith_key': 'abudawud:1', 'collection': 'abudawud', 'has_grade': True}])
    write_table(root / 'collections/train-00000-of-00001.parquet', [{'collection_id': name, 'name_ar': f'كتاب {name}', 'name_en': name} for name in [*COLLECTIONS, 'nawawi', 'qudsi', 'dehlawi', 'hadeethenc']])
    (root / 'metadata').mkdir()
    (root / 'metadata/configs.csv').write_text('config_name,license,commercial_ok,attribution,source_url,source\nabudawud-en,reference-only,False,credit,https://example.test,fawazahmed0/hadith-api\n', encoding='utf-8')
    files = [{'path': path.relative_to(root).as_posix(), 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for path in sorted(root.rglob('*')) if path.is_file()]
    (root / 'download-manifest.json').write_text(json.dumps({'dataset': 'quranlab/hadith', 'revision': 'fixture', 'file_count': len(files), 'total_bytes': 1, 'files': files}), encoding='utf-8')
    archive = base_dir / 'archive'
    (archive / 'provenance').mkdir(parents=True)
    audit = {'page_cache': {'books': {'1': {'sha256': 'a' * 64, 'roles': [{'titles': ['كتاب']}]}}}, 'itqan_revision': 'r', 'itqan_sources': [], 'quran_vocabulary_sha256': 'b' * 64}
    (archive / 'provenance_audit.json').write_text(json.dumps(audit), encoding='utf-8')
    lk = base_dir / 'lk'
    base = base_dir / 'base.sqlite'
    db = open_master_database(base)
    def add(book, values):
        full = {column: '' for column in MASTER_COLUMNS}
        full.update({'Tafseel_Match_Score': 0., 'Itqan_Chain_Calibration_Score': .5, 'Matn_Book_ID': 1, 'Commentary_Book_ID': None, 'Itqan_Narrator_Chain_JSON': '[]', 'Itqan_Quran_Root_Links_JSON': '[]', 'Itqan_Linked_Ayah_Keys_JSON': '[]', 'Itqan_Corroborating_Hadiths_JSON': '[]', 'Chapter_Number': '1'})
        full.update(values)
        placeholders = ','.join('?' * (len(MASTER_COLUMNS) + 1))
        return db.execute(f'INSERT INTO hadiths(book_key,{",".join(MASTER_COLUMNS)}) VALUES ({placeholders})', [book] + [full[column] for column in MASTER_COLUMNS]).lastrowid
    folders = {'Bukhari': 'Bukhari', 'Muslim': 'Muslim', 'AbuDaud': 'AbuDaud', 'Tirmidhi': 'Tirmizi', 'Nesai': 'Nesai', 'IbnMajah': 'IbnMaja'}
    for name, book in COLLECTIONS.items():
        if book == 'AbuDaud':
            values = [{'Hadith_number': '7.0', 'Arabic_Hadith': f'{CHAIN_A} {MATN}', 'Arabic_Isnad': CHAIN_A, 'Arabic_Matn': MATN, 'English_Hadith': 'Unrelated English text entirely', 'Arabic_Grade': 'صحيح', 'English_Grade': 'Sahih - Authentic'}, {'Hadith_number': '2.0', 'Arabic_Hadith': 'نص اخر مختلف تماما', 'Arabic_Matn': 'نص اخر مختلف تماما', 'Arabic_Grade': 'nan', 'English_Grade': ' '}]
        elif book == 'MuwattaMalik':
            values = [{'Hadith_number': '40', 'Arabic_Hadith': f'{CHAIN_B} {OTHER}', 'Arabic_Isnad': CHAIN_B, 'Arabic_Matn': OTHER}]
        else:
            values = [{'Hadith_number': '1', 'Arabic_Hadith': f'{CHAIN_A} {MATN} {name}', 'Arabic_Isnad': CHAIN_A, 'Arabic_Matn': f'{MATN} {name}', 'Arabic_Grade': 'صحيح', 'English_Grade': 'Sahih-Authentic'}]
        for item in values:
            add(book, item)
        if book in folders:
            import csv
            folder = lk / folders[book]
            folder.mkdir(parents=True)
            with (folder / 'Chapter1.csv').open('w', encoding='utf-8', newline='') as stream:
                writer = csv.writer(stream)
                writer.writerow(LK_COLUMNS)
                for item in values:
                    full = {column: '' for column in LK_COLUMNS}
                    full.update({'Chapter_Number': '1'})
                    full.update(item)
                    writer.writerow([full[column] for column in LK_COLUMNS])
    db.execute('INSERT INTO rijal_narrators(rijal_id,primary_name_ar,primary_name_norm) VALUES (?,?,?)', ('1', 'س', 'س'))
    db.execute('INSERT INTO hadiths_fts(rowid,book_key,Hadith_number) VALUES (1,?,?)', ('Bukhari', '1'))
    db.commit()
    db.close()
    return {'base': base, 'source_root': root, 'lk_dir': lk, 'archive_output': archive, 'output_dir': base_dir / 'out'}


@pytest.fixture(scope='module')
def merged(tmp_path_factory):
    directory = tmp_path_factory.mktemp('merge')
    cfg = build_fixture(directory)
    build.run_merge(cfg)
    db = sqlite3.connect(cfg['output_dir'] / build.MERGED_NAME)
    db.row_factory = sqlite3.Row
    yield SimpleNamespace(cfg=cfg, db=db)
    db.close()


def judgments(merged, sql='1=1', *args):
    return merged.db.execute(f'SELECT * FROM grading_judgments WHERE {sql}', args).fetchall()


def test_merge_preserves_base_rows_and_input(merged):
    before = sqlite3.connect(merged.cfg['base'])
    columns = ','.join(f'"{column}"' for column in ['id', 'book_key', *MASTER_COLUMNS])
    old = before.execute(f'SELECT {columns} FROM hadiths ORDER BY id').fetchall()
    assert old == [tuple(row) for row in merged.db.execute(f'SELECT {columns} FROM hadiths WHERE id<=? ORDER BY id', (old[-1][0],))]
    assert before.execute('SELECT COUNT(*) FROM sqlite_master WHERE name=?', ('merge_metadata',)).fetchone()[0] == 0
    before.close()


def test_multiple_graders_and_conflict_are_kept(merged):
    row = merged.db.execute("SELECT hadith_id FROM hadith_crosswalk WHERE source_key='abudawud:1'").fetchone()
    found = {item['grader_raw']: item['grade_raw'] for item in judgments(merged, "hadith_id=? AND origin='quranlab_fawazahmed0'", row['hadith_id'])}
    assert found == dict(GRADES)
    summary = merged.db.execute('SELECT * FROM hadith_grading_summary WHERE hadith_id=?', row).fetchone()
    assert summary['opposed'] == 1


def test_repeated_language_copies_stay_one_judgment_with_lineage(merged):
    items = judgments(merged, "source_key='abudawud:1' AND grader_raw='Al-Albani'")
    assert len(items) == 1
    assert json.loads(items[0]['upstream_lineage_json'])['repeated_in_configs'] == ['abudawud-ar', 'abudawud-en', 'abudawud-fr']


def test_unknown_grader_gets_no_arabic_and_stays_flagged(merged):
    item = judgments(merged, "grader_raw='Unknown Reviewer'")[0]
    assert item['grader_ar'] is None and item['grader_status'] == 'needs_review'


def test_grader_without_evidence_is_not_localized(merged):
    item = judgments(merged, "grader_raw='Salim al-Hilali'")[0]
    assert item['grader_ar'] is None and item['grade_ar'] == 'موقوف صحيح'


def test_unmatched_record_stays_staged(merged):
    row = merged.db.execute("SELECT decision,hadith_id FROM hadith_crosswalk WHERE source_key='abudawud:2'").fetchone()
    assert row['hadith_id'] is None
    staged = judgments(merged, "source_key='abudawud:2' AND hadith_id IS NULL")
    assert staged and all(item['display_policy'] == 'staged' for item in staged)


def test_unmatched_record_becomes_its_own_book_row_and_keeps_its_grade(merged):
    row = merged.db.execute("SELECT b.hadith_id,b.kind,h.book_key,h.Chapter_Arabic FROM source_book_rows b JOIN hadiths h ON h.id=b.hadith_id WHERE b.source_key='abudawud:2'").fetchone()
    assert row['book_key'] == 'SourceOnly' and row['kind'] == 'source_only'
    assert [item['grade_raw'] for item in judgments(merged, 'hadith_id=?', row['hadith_id'])] == ['Hasan']
    assert merged.db.execute('SELECT COUNT(*) FROM hadith_crosswalk WHERE hadith_id=?', (row['hadith_id'],)).fetchone()[0] == 0


def test_whole_collections_are_separate_books_after_the_base_rows(merged):
    last = sqlite3.connect(merged.cfg['base']).execute('SELECT MAX(id) FROM hadiths').fetchone()[0]
    rows = merged.db.execute('SELECT book_key,MIN(hadith_id) first_id,COUNT(*) n FROM source_book_rows GROUP BY 1').fetchall()
    assert {'Nawawi40', 'Qudsi40', 'Dehlawi40', 'HadeethEnc', 'SourceOnly'} <= {row['book_key'] for row in rows}
    assert min(row['first_id'] for row in rows) == last + 1


def test_no_grade_is_created_for_bukhari_or_muslim(merged):
    rows = merged.db.execute("SELECT j.origin,j.display_policy FROM grading_judgments j JOIN hadiths h ON h.id=j.hadith_id WHERE h.book_key IN ('Bukhari','Muslim')").fetchall()
    assert rows and all(item['origin'] == 'base_lk_field' and item['display_policy'] == 'suppressed_collection' for item in rows)
    assert merged.db.execute("SELECT COUNT(*) FROM hadith_grading_summary s JOIN hadiths h ON h.id=s.hadith_id WHERE h.book_key IN ('Bukhari','Muslim') AND s.display_policy='details'").fetchone()[0] == 0


def test_missing_grade_stays_missing(merged):
    assert not judgments(merged, "hadith_id=(SELECT id FROM hadiths WHERE Hadith_number='2.0' AND book_key='AbuDaud')")


def test_base_grade_keeps_no_grader(merged):
    assert all(item['grader_raw'] is None for item in judgments(merged, "origin='base_lk_field'"))


def test_hadeethenc_is_an_institution_and_not_chain_specific(merged):
    item = judgments(merged, "origin='quranlab_hadeethenc' AND assessed_part='cited_report_not_chain_specific'")[0]
    assert item['grader_role'] == 'institution' and item['assessed_part'] == 'cited_report_not_chain_specific'
    assert item['grade_raw'] == 'صحيح' and item['grade_raw_alt'] == 'Authentic'


def test_english_fills_only_an_empty_row(merged):
    fts = merged.db.execute("SELECT v.rowid FROM variant_translation_fts v JOIN hadiths h ON h.id=v.rowid WHERE h.book_key='MuwattaMalik'").fetchall()
    assert len(fts) == 1
    assert merged.db.execute("SELECT COUNT(*) FROM variant_translation_fts v JOIN hadiths h ON h.id=v.rowid WHERE h.book_key='AbuDaud'").fetchone()[0] == 0


def test_other_languages_keep_a_hash_not_text(merged):
    record = merged.db.execute("SELECT text,text_sha256 FROM quranlab_records WHERE source_key='abudawud:1' AND language='fr'").fetchone()
    assert record['text'] is None and record['text_sha256'] == hashlib.sha256('Les deux parties'.encode('utf-8')).hexdigest()


def test_every_value_has_lineage_and_a_resolving_hash(merged):
    registry = {row[0] for row in merged.db.execute('SELECT source_id FROM source_registry')}
    for row in merged.db.execute('SELECT * FROM hadiths'):
        provenance = json.loads(row['field_provenance_json'])
        seen = {}
        for group in provenance['fields']:
            assert group['source'] in registry
            seen.update(group['fields'])
        for column in MASTER_COLUMNS:
            if row[column] in (None, ''):
                assert column in provenance['missing']
            else:
                assert seen[column] == build.value_hash(row[column])


def test_lost_ancestry_is_recorded_as_unresolved_not_invented(merged):
    groups = [group for row in merged.db.execute("SELECT field_provenance_json FROM hadiths WHERE book_key='MuwattaMalik'") for group in json.loads(row[0])['fields']]
    unresolved = [group for group in groups if group.get('upstream') == 'unresolved']
    assert unresolved and all(group['source'] == 'base:db' and group['transformation'] == 'inherited_upstream_unresolved' for group in unresolved)


def test_changed_lk_cell_stops_the_build(tmp_path):
    cfg = build_fixture(tmp_path)
    path = cfg['lk_dir'] / 'Bukhari/Chapter1.csv'
    path.write_text(path.read_text(encoding='utf-8').replace('Sahih-Authentic', 'Changed'), encoding='utf-8')
    with pytest.raises(ValueError, match='differs from the LK source'):
        build.run_merge(cfg)
    assert not list(cfg['output_dir'].glob('.quranlab-build-*'))


def test_changed_download_stops_the_build(tmp_path):
    cfg = build_fixture(tmp_path)
    with (cfg['source_root'] / 'metadata/configs.csv').open('a', encoding='utf-8') as stream:
        stream.write('x,x,x,x,x,x\n')
    with pytest.raises(ValueError, match='Downloaded file changed'):
        build.run_merge(cfg)


@pytest.mark.parametrize('stage', ['collections', 'database'])
def test_interrupted_build_keeps_the_previous_generation(tmp_path, stage):
    cfg = build_fixture(tmp_path)
    build.run_merge(cfg)
    target = cfg['output_dir'] / build.MERGED_NAME
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    with pytest.raises(RuntimeError, match='Injected failure'):
        build.run_merge(cfg, fail_after=stage)
    assert hashlib.sha256(target.read_bytes()).hexdigest() == digest
    assert not list(cfg['output_dir'].glob('.quranlab-build-*'))


def test_stale_staging_is_recovered(tmp_path):
    cfg = build_fixture(tmp_path)
    stale = cfg['output_dir'] / '.quranlab-build-stale'
    stale.mkdir(parents=True)
    (stale / 'partial').write_text('x')
    build.run_merge(cfg)
    assert not stale.exists() and (cfg['output_dir'] / build.MERGED_NAME).exists()


def test_rerun_is_byte_identical(tmp_path):
    cfg = build_fixture(tmp_path)
    build.run_merge(cfg)
    target = cfg['output_dir'] / build.MERGED_NAME
    first = hashlib.sha256(target.read_bytes()).hexdigest()
    build.run_merge(cfg)
    assert hashlib.sha256(target.read_bytes()).hexdigest() == first


def test_payload_validation_rejects_wrong_files(tmp_path):
    good = tmp_path / 'a.parquet'
    good.write_bytes(b'PAR1' + b'x' * 20 + b'PAR1')
    entry = {'path': 'a.parquet', 'size': good.stat().st_size, 'lfs': {'oid': hashlib.sha256(good.read_bytes()).hexdigest()}}
    assert download.validate_payload(good, entry) == entry['lfs']['oid']
    html = tmp_path / 'b.md'
    html.write_bytes(b'<!doctype html><html></html>')
    with pytest.raises(ValueError, match='HTML'):
        download.validate_payload(html, {'path': 'b.md', 'size': html.stat().st_size})
    pointer = tmp_path / 'c.md'
    pointer.write_bytes(b'version https://git-lfs.github.com/spec/v1\n')
    with pytest.raises(ValueError, match='pointer'):
        download.validate_payload(pointer, {'path': 'c.md', 'size': pointer.stat().st_size})
    with pytest.raises(ValueError, match='not a Parquet'):
        bad = tmp_path / 'd.parquet'
        bad.write_bytes(b'nothing here at all')
        download.validate_payload(bad, {'path': 'd.parquet', 'size': bad.stat().st_size})
    with pytest.raises(ValueError, match='size'):
        download.validate_payload(good, {'path': 'a.parquet', 'size': 1})


def test_repository_paths_cannot_leave_the_download_folder(tmp_path):
    for path in ('../x', '/etc/x', 'a/../../x'):
        with pytest.raises(ValueError):
            download.safe_target(tmp_path, path)
