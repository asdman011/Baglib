import argparse
import csv
import json
from pathlib import Path
import sqlite3

import pytest

from main import run
from src.aligner import Match, align, forward_fill, window
from src.exporter import audit_book, export_book, initialize_database
from src.loaders import APPENDED, LK_COLUMNS, OhdRow, chapter_number, load_lk, load_ohd, resolve_sources
from src.normalizer import matching_text, normalize_arabic


def row(text='', number='1', chapter='1', matn=''):
    return {**dict.fromkeys(LK_COLUMNS, ''), 'Arabic_Hadith': text, 'Hadith_number': number, 'Chapter_Number': chapter, 'Arabic_Matn': matn}


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8-sig', newline='') as stream:
        csv.writer(stream).writerows(rows)


@pytest.mark.parametrize(('source', 'expected'), [
    ('إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ', 'انما الاعمال بالنيات'),
    ('آ ٱ ى ة ؤ ئ ــ', 'ا ا ي ه ء ء'),
    ('[١٢] مدرسة، 123 Latin!\nرحمة', 'مدرسه رحمه'),
    ('\u0617\u061a\u064b\u065f\u0670\u06d6\u06ed', ''),
    (None, ''), ('nan', ''), ('', ''),
])
def test_normalizer(source, expected):
    assert normalize_arabic(source) == expected
    assert normalize_arabic(expected) == expected


def test_fallback():
    record = row(' nan ', matn='المتن')
    record['Arabic_Isnad'] = 'السند'
    assert matching_text(record) == 'السند المتن'
    assert record['Arabic_Hadith'] == ' nan '


def test_natural_sort_and_header_mapping(tmp_path):
    for number in (10, 2, 1):
        record = row(f'نص {number}', f'{number}a')
        header = list(reversed(LK_COLUMNS))
        write_csv(tmp_path / f'Chapter{number}.csv', [[f' {h.lower()} ' for h in header], [record[h] for h in header]])
    records, manifest = load_lk(tmp_path)
    assert [r['Hadith_number'] for r in records] == ['1a', '2a', '10a']
    assert len(manifest) == 3
    assert [chapter_number(Path(p)) for p in ['Chapter1.csv', 'Chapter2.csv', 'Chapter10.csv']] == [1, 2, 10]


@pytest.mark.parametrize('width', [2, 3, 5])
def test_ohd_last_two_columns(tmp_path, width):
    path = tmp_path / 'input.csv'
    write_csv(path, [['id'] * (width - 2) + ['حديث،\nنص', 'شرح "أصلي"']])
    records, info = load_ohd(path)
    assert records[0].text == 'حديث،\nنص'
    assert records[0].commentary == 'شرح "أصلي"'
    assert info['columns'] == width


def test_bad_csv_fails_without_skipping(tmp_path):
    write_csv(tmp_path / 'Chapter1.csv', [LK_COLUMNS, ['broken']])
    with pytest.raises(ValueError, match='expected 16'):
        load_lk(tmp_path)
    path = tmp_path / 'ohd.csv'
    write_csv(path, [['نص', 'شرح'], ['id', 'نص', 'شرح']])
    with pytest.raises(ValueError, match='inconsistent'):
        load_ohd(path)


def test_folder_aliases_and_case(tmp_path):
    lk, ohd = tmp_path / 'lk', tmp_path / 'ohd'
    (lk / 'Tirmizi').mkdir(parents=True)
    path = ohd / 'sunan-al-tirmidhi' / 'SUNAN_AL_TIRMIDHI_AHADITH_MUSHAKKALA_MUFASSALA.UTF8.CSV'
    write_csv(path, [['نص', 'شرح']])
    assert resolve_sources(lk, ohd, 'Tirmidhi') == (lk / 'Tirmizi', path)


def test_exact_and_substring():
    text = 'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى فمن كانت هجرته إلى الله ورسوله'
    records = [row(text), row('نص مختلف', matn=text)]
    matches = align(records, [OhdRow('سند ' + text, 'شرح', '1'), OhdRow(text, 'شرح آخر', '2')])
    assert [m.method for m in matches] == ['exact_window', 'exact_window']
    assert matches[0].index == 1  # Full equality takes precedence over substring.
    assert all(m.score == 1 for m in matches)


def test_short_matn_is_not_exact_substring():
    match = align([row('مختلف تماما', matn='قصير')], [OhdRow('سند قصير', 'شرح', '1')])[0]
    assert match.method == 'unmatched'


def test_empty_keys_and_missing_commentary_never_exact():
    matches = align([row('123'), row('نص صحيح')], [OhdRow('', 'شرح', '1'), OhdRow('نص صحيح', 'nan', '2')])
    assert all(m.index == -1 and m.commentary is None for m in matches)


def test_tfidf_and_threshold():
    records = [row('حدثنا زيد عن عمر قال العلم نور والعمل خير')]
    source = [OhdRow('حدثنا زيد عن عمر قال العلم نور والعمل عظيم', 'شرح', '1')]
    match = align(records, source)[0]
    assert match.method == 'tfidf_window' and .45 <= match.score < 1
    assert align(records, source, min_score=1)[0].method == 'unmatched'


def test_individual_window_not_batch_union():
    records = [row('كلمات فريده نادره', number=str(i)) for i in range(1000)]
    source = [OhdRow('عباره اخري مختلفه', 'شرح', str(i)) for i in range(1000)]
    source[800] = OhdRow('كلمات فريده نادره زياده', 'بعيد', '800')
    matches = align(records, source, min_score=.3, batch_size=500)
    assert matches[0].method == 'unmatched'  # 800 is in the batch union, not row 0's window.
    assert matches[600].index == 800
    for i, match in enumerate(matches):
        if match.index >= 0:
            lo, hi, _ = window(i, 1000, 1000, .08)
            assert lo <= match.index < hi


def test_exact_repeats_use_position_and_never_outside_window():
    records = [row('فريد', number=str(i)) for i in range(1000)]
    source = [OhdRow('اخر', 'شرح', str(i)) for i in range(1000)]
    source[10] = OhdRow('فريد', 'مبكر', '10')
    source[990] = OhdRow('فريد', 'متأخر', '990')
    matches = align(records, source)
    assert matches[0].index == 10
    assert matches[-1].index == 990
    assert matches[500].method == 'unmatched'


def test_ffill_only_prior_same_chapter_and_base():
    records = [row(number='12a'), row(number='12b'), row(number='13b'), row(number='12c', chapter='2'), row(number=''), row(number='12d')]
    matches = [Match('شرح', .7, 'tfidf_window', 8)] + [Match() for _ in range(5)]
    forward_fill(records, matches)
    assert matches[1] == Match('شرح', .7, 'sub_narration_ffill', 8)
    assert all(matches[i].index == -1 for i in [2, 3, 4])
    assert matches[5].index == 8


def test_ffill_preserves_direct_matches_and_no_backfill():
    matches = [Match(), Match('أ', .9, 'tfidf_window', 1), Match('ب', 1, 'exact_window', 2)]
    forward_fill([row(number=n) for n in ['12a', '12b', '12c']], matches)
    assert matches[0].index == -1
    assert matches[2].method == 'exact_window'


def test_empty_vocabulary():
    assert align([row('ب')], [OhdRow('ت', 'شرح', '')])[0].method == 'unmatched'


@pytest.mark.parametrize(('minimum', 'pct'), [(float('nan'), .08), (.45, float('inf')), (-.1, .08), (.45, 2)])
def test_invalid_parameters(minimum, pct):
    with pytest.raises(ValueError):
        align([], [], minimum, pct)


def test_export_preserves_all_fields_and_indexes(tmp_path):
    record = {k: f'عَرَبِي English, "{k}"\nnext' for k in LK_COLUMNS}
    record['Hadith_number'] = '12a'
    matches = [Match('شَرْح\n"نص"', .5, 'tfidf_window', 0)]
    db = initialize_database(tmp_path / 'out.db')
    export_book(tmp_path, db, 'Muslim', [record], matches)
    path = tmp_path / 'csv' / 'Muslim_LK_with_Tafseel.csv'
    assert path.read_bytes().startswith(b'\xef\xbb\xbf')
    with path.open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        assert reader.fieldnames == LK_COLUMNS + APPENDED
        exported = next(reader)
    assert {k: exported[k] for k in LK_COLUMNS} == record
    stored = db.execute('SELECT * FROM hadiths').fetchone()
    assert list(stored[1:17]) == [record[k] for k in LK_COLUMNS]
    assert len(db.execute("PRAGMA index_list(hadiths)").fetchall()) == 2
    db.close()


def test_cli_generation_and_failure_preserve_previous(tmp_path):
    lk, ohd, output = tmp_path / 'lk', tmp_path / 'ohd', tmp_path / 'out'
    record = row('إنما الأعمال بالنيات', '12a')
    chapter = lk / 'Bukhari' / 'Chapter1.csv'
    write_csv(chapter, [LK_COLUMNS, [record[k] for k in LK_COLUMNS]])
    write_csv(ohd / 'Sahih_Al-Bukhari' / 'b_mushakkala_mufassala.utf8.csv', [['1', 'إنما الأعمال بالنيات', 'شرح']])
    args = argparse.Namespace(lk_dir=lk, ohd_dir=ohd, output_dir=output, books=['Bukhari'], min_score=.45, window_pct=.08)
    assert '100.00%' in run(args)
    report = json.loads((output / 'alignment_audit_report.json').read_text(encoding='utf-8'))
    assert report['books'][0]['matched_count'] == 1
    original = (output / 'sunnah_lk_tafseel.db').read_bytes()
    write_csv(chapter, [LK_COLUMNS, ['bad']])
    with pytest.raises(ValueError):
        run(args)
    assert (output / 'sunnah_lk_tafseel.db').read_bytes() == original
    assert not list(tmp_path.glob('.hadith-build-*'))
