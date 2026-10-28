import argparse
import csv
import json
import sqlite3

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from shamela_main import run_shamela
from verify_shamela_outputs import verify
from src.indexer import export_corpus_book, open_database, search_database
from src.isnad_matn_splitter import extract_grade, split_isnad_matn
from src.loaders import LK_COLUMNS
from src.shamela_aligner import UnitMatch, align_units, number_key
from src.shamela_loader import ingest
from src.shamela_parser import Unit, base_rows, integer, location, order_pages, parse_units, volume_key
from src.shamela_registry import CORPUS_COLUMNS, PAGE_COLUMNS, REGISTRY
from src.sharh_parser import lemmas, parse_sharh


def page(text, serial='1', book_id='1699', title='موطأ مالك', volume='1', number='1', note='', category='6'):
    return dict(zip(PAGE_COLUMNS, [serial, category, 'category', title, book_id, 'edition', 'publisher', number, volume, text, note]))


def row(text, number='1', chapter='1', section='1'):
    return {**dict.fromkeys(LK_COLUMNS, ''), 'Arabic_Hadith': text, 'Arabic_Matn': text, 'Hadith_number': number, 'Chapter_Number': chapter, 'Section_Number': section}


def unit(text, number='1'):
    p = page(text)
    return Unit(number, '1', 'كتاب العلم', '1', 'باب العلم', text, [p])


@pytest.mark.parametrize(('source', 'expected'), [('001', (1, 0)), ('5 أ', (5, 1)), ('5 ب', (5, 2)), ('مقدمة', (0, 0)), ('47 - 48', (47, 0))])
def test_volume(source, expected):
    assert volume_key(source) == expected


def test_page_order_and_ahmad_indices():
    assert integer('None') == 0
    pages = [page('x', '3', volume='46'), page('x', '2', volume='001', number='2'), page('x', '1', volume='1', number='1')]
    ordered, excluded = order_pages(pages, '25794')
    assert [p['serial_number'] for p in ordered] == ['1', '2']
    assert excluded == 1


def test_duplicate_serial_and_unknown_volume_rejected():
    with pytest.raises(ValueError, match='Duplicate'):
        order_pages([page('a'), page('b')], '1699')
    with pytest.raises(ValueError, match='Unrecognized'):
        volume_key('غير معروف')


def test_units_stitch_until_number_or_header_preserve_spans():
    pages = [page('كتاب العلم\nباب النية\n1 - حدثنا زيد قال رسول الله إنما الأعمال بالنيات', note='إسناده صحيح'), page('تكملة شرح الحديث\n2 - حدثنا راو ثان\nباب جديد\nنص قبل الحديث', serial='2', number='2')]
    units, stats = parse_units(pages)
    assert len(units) == 2
    assert 'بالنيات\nتكملة' in units[0].text
    assert units[0].footnote == 'إسناده صحيح'
    assert 'باب جديد' not in units[1].text
    assert 'نص قبل الحديث' not in units[1].text
    assert units[0].chapter == 'كتاب العلم'
    assert units[0].section == 'باب النية'
    assert len(units[0].pages) == 2
    for span in units[0].spans:
        p = next(p for p in pages if p['serial_number'] == span['serial_number'])
        assert p['text'][span['start']:span['end']].strip() in units[0].text
    assert stats['numbered_units'] == 2


def test_footnotes_not_duplicated_across_unrelated_hadiths():
    units, stats = parse_units([page('1 - حدثنا راو أول\n2 - حدثنا راو ثان', note='حديث صحيح')])
    assert all(not u.footnote for u in units)
    assert stats['ambiguous_footnote_pages'] == 1
    assert stats['unassigned_footnotes'][0]['foot_note'] == 'حديث صحيح'


def test_unnumbered_lemma_page_is_not_fabricated_hadith():
    pages = [page('قوله: (إنما الأعمال بالنيات) شرح لهذه الجملة')]
    assert parse_units(pages)[0] == []
    units, _ = parse_units(pages, commentary=True)
    assert units[0].number == '' and units[0].anchor == 'lemma_page'


def test_bracket_number_and_arabic_digits():
    units, _ = parse_units([page('[حديث رقم ١٢٣] حَدَّثَنَا زيد\n124 - حَدَّثَنَا بكر')])
    assert [u.number for u in units] == ['123', '124']
    assert 'حَدَّثَنَا' in units[0].text


def test_inline_anchors_format_controls_and_editorial_rulings():
    text = '\u200c \u200cبَابُ العلم 1 - حَدَّثَنَا زيد قال رسول الله إنما الأعمال بالنيات [تعليق المحقق] إسناده صحيح. 2 - حَدَّثَنَا عمر مثله'
    units, _ = parse_units([page(text, book_id='21795')])
    records, _ = base_rows(units)
    assert len(records) == 2
    assert 'تعليق المحقق' not in records[0]['Arabic_Hadith']
    assert records[0]['English_Grade'] == 'Sahih'
    assert records[0]['Section_Arabic'].startswith('بَابُ')


def test_ahmad_intro_lists_not_narrations():
    units, _ = parse_units([page('(1) عن الحافظ فلان قال كلاما (2) أن الإمام سمع الكتاب', book_id='25794'), page('1 - حَدَّثَنَا زيد عن عمر', serial='2', book_id='25794')])
    assert len(units) == 1 and units[0].start['serial_number'] == '2'


def test_constructed_matn_retains_reading_and_abbreviated_chain_variants():
    units, _ = parse_units([page('1 - حدثنا زيد 2 - قَرَأْتُ عَلَى يحيى 3 - [قَالَ عبد الله] 4 - وَبِهَذَا الإِسْنَادِ 5 - ح وحدثنا عمر 6 حدثنا بكر 7 (1) - حدثنا خالد', book_id='25794')])
    assert [u.number for u in units] == ['1', '2', '3', '4', '5', '6', '7']


def test_source_subreferences_and_combined_references_are_not_invented_integers():
    text = '1 - حدثنا زيد *8017 - حدثنا عمر 8571/ 1 - حدثنا بكر 11073/أ - حدثنا خالد 9936 و 9937 - حدثنا سعيد "16152 - حدثنا نافع'
    units, _ = parse_units([page(text, book_id='25794')])
    assert [u.number for u in units] == ['1', '8017', '8571/ 1', '11073/أ', '9936 و 9937', '16152']
    assert number_key('11073/ أ') == '11073/أ'
    assert number_key('9936 و 9937') == '9936و9937'


def test_muntaqa_prose_ordinals_do_not_stitch_a_volume():
    units, _ = parse_units([page('قوله: (العلم نافع) 1 - قال مالك في العتبية', book_id='6684'), page('قوله: (العمل خير) وهذا البيان', serial='2', book_id='6684')], commentary=True)
    assert len(units) == 2 and all(u.number == '' and len(u.pages) == 1 for u in units)


def test_fath_intro_number_cannot_steal_canonical_hadith_one():
    pages = [page('(1) عن راو حديث آخر في مقدمة المصنف', book_id='1673', volume='مقدمة'), page('1 - حدثنا عمر إنما الأعمال بالنيات وإنما لكل امرئ ما نوى قوله: (الأعمال) بيان الحديث', book_id='1673', serial='2')]
    units, stats = parse_sharh(pages)
    assert stats['excluded_introductory_rows'] == 1
    assert len(units) == 1 and units[0].start['serial_number'] == '2'


def test_vocalized_commentary_lemma():
    value = unit('قَوْلُهُ: (إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ) فيه بيان')
    assert lemmas(value) == ['إنما الأعمال بالنيات']


def test_splitter_preserves_every_character():
    text = 'حَدَّثَنَا زيد عَنْ عمر قال رسول الله صلى الله عليه وسلم: الأعمال بالنيات'
    chain, matn = split_isnad_matn(text)
    assert chain + matn == text
    assert 'رسول الله' in matn and chain
    assert split_isnad_matn('خبر مبهم بلا إسناد') == ('', 'خبر مبهم بلا إسناد')


@pytest.mark.parametrize(('note', 'english'), [('إسناده صحيح على شرط الشيخين. تكملة', 'Sahih'), ('حديث حسن لغيره', 'Hasan'), ('إسناده ضعيف جدا', "Da'if"), ('حديث موضوع', "Mawdu'"), ('رجاله صحيح غير أن الراوي منقطع', ''), ('حديث موقوف', '')])
def test_qualified_source_grade(note, english):
    arabic, translated = extract_grade(note)
    assert arabic and translated == english


def test_number_normalization():
    assert [number_key(x) for x in ['12.0', '١٢', '012b', 'nan']] == ['12', '12', '12b', '']


def test_number_match_requires_textual_support_and_verified_number():
    text = 'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى فمن كانت هجرته إلى الله ورسوله'
    units = [unit('قوله: (' + text + ') شرح الحديث', number='20')]
    assert align_units([row(text, '12')], units, verified_numbers=['20'])[0].method == 'hadith_num_exact'
    match = align_units([row('كلمات أخرى بعيدة عن هذا الخبر وسياقه تماما وليس له أي صلة بالرواية', '20')], units, min_score=1)[0]
    assert match.method == 'unmatched'
    assert align_units([row(text, '12')], units, verified_numbers=[''])[0].method == 'exact_window'


def test_sharh_inheritance_requires_followup_not_shared_bab():
    text = 'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى فمن كانت هجرته إلى الله ورسوله'
    rows = [row(text, '12a'), row('حدثنا فلان مثله', '12b'), row('رواية مختلفة جدا', '13'), row('حدثنا فلان مثله', '14', section='2')]
    matches = align_units(rows, [unit(text, '12')], min_score=.99, inherit=True)
    assert matches[1].method == 'sub_narration_ffill' and matches[1].donor == 0
    assert matches[2].method == matches[3].method == 'unmatched'


def test_local_ingestion_filters_and_cache_hash(tmp_path):
    source = tmp_path / 'source.parquet'
    pq.write_table(pa.Table.from_pylist([page('text'), page('other', '2', book_id='999')]), source)
    path, manifest = ingest(tmp_path / 'cache', {'1699'}, local=source)
    assert manifest['counts'] == {'1699': 1}
    assert pq.read_table(path).num_rows == 1
    assert ingest(tmp_path / 'cache', {'1699'}, local=source)[1] == manifest
    with pytest.raises(ValueError, match='missing'):
        ingest(tmp_path / 'other-cache', {'1699', '404'}, local=source)
    assert not (tmp_path / 'other-cache' / 'shamela_18books.parquet').exists()


def test_all_28_columns_zstd_and_normalized_fts(tmp_path):
    record = {c: '' for c in CORPUS_COLUMNS}
    record.update(row('إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ'))
    record.update(Arabic_Tafseel='رَحْمَةٌ وَهُدًى', Tafseel_Match_Score=.95, Tafseel_Match_Method='exact_window')
    dbpath = tmp_path / 'corpus.db'
    db = open_database(dbpath)
    export_corpus_book(tmp_path, db, 'Bukhari', [record], [{'source': 'synthetic fixture'}])
    assert db.execute('SELECT COUNT(*) FROM hadiths').fetchone()[0] == 1
    db.close()
    parquet = pq.ParquetFile(tmp_path / 'parquet' / 'Bukhari_Shamela.parquet')
    assert parquet.schema_arrow.names == CORPUS_COLUMNS
    assert parquet.metadata.row_group(0).column(0).compression == 'ZSTD'
    assert parquet.read().to_pylist() == [record]
    assert (tmp_path / 'csv' / 'Bukhari_Shamela.csv').read_bytes().startswith(b'\xef\xbb\xbf')
    assert search_database(dbpath, 'انما الاعمال')[0]['Arabic_Hadith'] == record['Arabic_Hadith']
    assert search_database(dbpath, 'رحمة وهدى')[0]['Arabic_Tafseel'] == record['Arabic_Tafseel']
    assert search_database(dbpath, 'Bukhari انما')[0]['Collection'] == 'Bukhari'


def test_three_constructed_books_schema_and_all_nine_synthetic_end_to_end(tmp_path):
    # Test doubles for structure only; no assertion of real-source parser accuracy.
    pages = []
    lk = tmp_path / 'lk'
    for book, pair in REGISTRY.items():
        title = pair.matn_title_key
        text = 'كتاب العلم\nباب النية\n1 - حدثنا زيد عن عمر قال رسول الله إنما الأعمال بالنيات ولكل امرئ ما نوى'
        pages.append(page(text, pair.matn_id, pair.matn_id, title, note='إسناده صحيح على شرط الشيخين' if pair.tahqiq else ''))
        pages.append(page('كتاب العلم\nباب النية\n1 - قوله: (حدثنا زيد عن عمر قال رسول الله إنما الأعمال بالنيات ولكل امرئ ما نوى) وهذا شرح الحديث', pair.sharh_id, pair.sharh_id, pair.sharh_title_key, category='7'))
        if pair.lk_aliases:
            folder = lk / pair.lk_aliases[0]
            folder.mkdir(parents=True)
            record = row(text.split('1 - ')[1], '1')
            with (folder / 'Chapter1.csv').open('w', encoding='utf-8', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=LK_COLUMNS)
                writer.writeheader()
                writer.writerow(record)
    source = tmp_path / 'pages.parquet'
    pq.write_table(pa.Table.from_pylist(pages), source)
    args = argparse.Namespace(books=['all'], lk_dir=lk, cache_dir=tmp_path / 'cache', shamela_parquet=source, refresh_cache=False, revision='main', output_dir=tmp_path / 'output', ingest_only=False, min_score=.45, window_pct=.08)
    markdown = run_shamela(args)
    assert 'MusnadAhmad' in markdown and 'SunanDarimi' in markdown
    audit = json.loads((args.output_dir / 'corpus_9books_audit.json').read_text(encoding='utf-8'))
    assert len(audit['books']) == 9
    assert len(list((args.output_dir / 'csv').glob('*.csv'))) == 9
    with sqlite3.connect(args.output_dir / 'sunnah_9books_shamela_corpus.db') as db:
        assert db.execute('SELECT COUNT(*) FROM hadiths').fetchone()[0] == 9
        assert db.execute("SELECT COUNT(*) FROM hadiths WHERE Collection='MusnadAhmad' AND English_Grade='Sahih'").fetchone()[0] == 1
    db.close()
    verified = verify(args.output_dir, args.cache_dir / 'shamela_18books.parquet', lk)
    assert verified['rows'] == 9 and verified['original_lk_fields_verified'] == 96
    # Refreshing preserves the previous output as a separately named generation.
    run_shamela(args)
    assert len(list(tmp_path.glob('output.previous-*'))) == 1
