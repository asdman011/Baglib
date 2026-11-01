"""Independent verification of the merged database against its real inputs.

Does not import the merge builder: values are recomputed here from source files.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3
import sys

import pyarrow.parquet as pq

from src.itqan_schema import MASTER_COLUMNS

HERE = Path(__file__).resolve().parent
ARCHIVE = HERE.parents[3] / '_archive_datasets'
REVISION = '9e5d61d8cff3c3b95745e11f9d0fe2efccb6126d'
JUNCTIONS = {'rijal_narrators': 'rijal_id', 'hadith_narrators': 'hadith_id,chain_position', 'quran_hadith_root_bridge': 'root_ar,hadith_id'}
SUPPRESSED = ('Bukhari', 'Muslim')
ALLOWED_DECISIONS = {'verified_match', 'candidate_review', 'source_only', 'conflicting_identity'}


def sha256(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def short(value):
    return hashlib.sha256(str(value).encode('utf-8')).hexdigest()[:16]


def verify(merged, base, source_root, calibration):
    report = {}
    manifest = json.loads((source_root / 'download-manifest.json').read_text(encoding='utf-8'))
    assert manifest['revision'] == REVISION
    for entry in manifest['files']:
        assert sha256(source_root / entry['path']) == entry['sha256'], entry['path']
    report['input_files_hash_verified'] = len(manifest['files'])
    base_sha = sha256(base)
    db = sqlite3.connect(f'file:{merged.as_posix()}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    db.execute(f"ATTACH DATABASE 'file:{base.as_posix()}?mode=ro' AS base")
    one = lambda sql, *args: db.execute(sql, args).fetchone()[0]
    meta = dict(db.execute('SELECT key,value FROM merge_metadata').fetchall())
    assert meta['base_sha256'] == base_sha and meta['quranlab_revision'] == REVISION
    report['base_sha256_unchanged'] = base_sha
    assert one('PRAGMA integrity_check') == 'ok'
    assert db.execute('PRAGMA foreign_key_check').fetchall() == []
    db.execute("SELECT count(*) FROM hadiths_fts WHERE hadiths_fts MATCH 'الله'").fetchone()
    columns = ','.join(f'"{column}"' for column in ['id', 'book_key', *MASTER_COLUMNS])
    base_last = one('SELECT MAX(id) FROM base.hadiths')
    assert one(f'SELECT COUNT(*) FROM (SELECT {columns} FROM main.hadiths WHERE id<=? EXCEPT SELECT {columns} FROM base.hadiths)', base_last) == 0
    assert one(f'SELECT COUNT(*) FROM (SELECT {columns} FROM base.hadiths EXCEPT SELECT {columns} FROM main.hadiths)') == 0
    report['base_rows_identical'] = one('SELECT COUNT(*) FROM main.hadiths WHERE id<=?', base_last)
    book_rows = one('SELECT COUNT(*) FROM source_book_rows')
    assert one('SELECT COUNT(*) FROM main.hadiths WHERE id>?', base_last) == book_rows and one('SELECT MIN(hadith_id) FROM source_book_rows') == base_last + 1
    assert one('SELECT COUNT(*) FROM source_book_rows b LEFT JOIN quranlab_records r ON r.source_key=b.source_key WHERE r.source_key IS NULL') == 0
    assert one("SELECT COUNT(*) FROM hadith_crosswalk c JOIN source_book_rows b ON b.hadith_id=c.hadith_id") == 0, 'a source book row gained a crosswalk link'
    report['source_book_rows'] = dict(db.execute('SELECT book_key,COUNT(*) FROM source_book_rows GROUP BY 1').fetchall())
    for table in JUNCTIONS:
        columns_info = ','.join(row['name'] for row in db.execute(f'PRAGMA table_info({table})'))
        assert one(f'SELECT COUNT(*) FROM main.{table}') == one(f'SELECT COUNT(*) FROM base.{table}')
        assert one(f'SELECT COUNT(*) FROM (SELECT {columns_info} FROM main.{table} EXCEPT SELECT {columns_info} FROM base.{table})') == 0
        report[f'{table}_identical'] = one(f'SELECT COUNT(*) FROM main.{table}')
    assert one('SELECT COUNT(*) FROM main.hadiths_fts') == one('SELECT COUNT(*) FROM base.hadiths_fts') + book_rows
    assert one("SELECT COUNT(*) FROM hadith_crosswalk WHERE (decision='verified_match')<>(hadith_id IS NOT NULL)") == 0
    assert {row[0] for row in db.execute('SELECT DISTINCT decision FROM hadith_crosswalk')} <= ALLOWED_DECISIONS
    # A judgment reaches a row only through a verified link of the same record.
    assert one("""SELECT COUNT(*) FROM grading_judgments j WHERE j.origin LIKE 'quranlab%' AND j.hadith_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM hadith_crosswalk c WHERE c.source_key=j.source_key AND c.hadith_id=j.hadith_id AND c.decision='verified_match')
      AND NOT EXISTS (SELECT 1 FROM source_book_rows b WHERE b.source_key=j.source_key AND b.hadith_id=j.hadith_id)""") == 0
    assert one("SELECT COUNT(*) FROM grading_judgments WHERE hadith_id IS NULL AND display_policy<>'staged' AND display_policy<>'hidden_placeholder'") == 0
    # Number never identifies: every link carries a text score above the identity floor.
    assert one("SELECT COUNT(*) FROM hadith_crosswalk WHERE decision='verified_match' AND full_score<.5 AND relation NOT IN ('corpus_extends_source','corpus_contains_report','source_extends_corpus')") == 0
    assert one("SELECT COUNT(*) FROM grading_judgments WHERE origin='quranlab_fawazahmed0' AND source_key LIKE 'bukhari:%'") == 0
    assert one("SELECT COUNT(*) FROM grading_judgments WHERE origin='quranlab_fawazahmed0' AND source_key LIKE 'muslim:%'") == 0
    placeholders = ','.join('?' * len(SUPPRESSED))
    assert one(f"SELECT COUNT(*) FROM grading_judgments j JOIN hadiths h ON h.id=j.hadith_id WHERE h.book_key IN ({placeholders}) AND j.origin='base_lk_field' AND j.display_policy<>'suppressed_collection'", *SUPPRESSED) == 0
    assert one("SELECT COUNT(*) FROM grading_judgments WHERE origin LIKE 'base%' AND grader_raw IS NOT NULL") == 0, 'unattributed base grade gained a grader'
    assert one("SELECT COUNT(*) FROM grading_judgments WHERE grade_ar_status='glossary' AND grade_ar IS NULL") == 0
    assert one("SELECT COUNT(*) FROM grading_judgments j LEFT JOIN grader_mappings g ON g.grader_raw=j.grader_raw WHERE j.grader_raw IS NOT NULL AND g.grader_raw IS NULL") == 0
    assert one("SELECT COUNT(*) FROM grading_judgments j JOIN grader_mappings g ON g.grader_raw=j.grader_raw WHERE j.grader_ar IS NOT NULL AND g.status='needs_review'") == 0, 'unverified grader shown in Arabic'
    assert one("SELECT COUNT(*) FROM grader_mappings WHERE status='verified' AND evidence_json='[]'") == 0
    # Upstream repeats: one judgment per record, grader, grade and array position.
    assert one('SELECT COUNT(*) FROM (SELECT source_key,hadith_id,grader_raw,grade_raw,field_path,COUNT(*) n FROM grading_judgments GROUP BY 1,2,3,4,5 HAVING n>1)') == 0
    judgments_checked = 0
    for config in sorted({row[0] for row in db.execute("SELECT DISTINCT config FROM grading_judgments WHERE origin='quranlab_fawazahmed0'")}):
        stored = {(row['source_key'], row['field_path']): (row['grader_raw'], row['grade_raw']) for row in db.execute("SELECT source_key,field_path,grader_raw,grade_raw FROM grading_judgments WHERE origin='quranlab_fawazahmed0' AND config=?", (config,))}
        records = pq.read_table(source_root / config / 'train-00000-of-00001.parquet', columns=['hadith_key', 'grades']).to_pylist()
        for record in records:
            for position, grade in enumerate(record['grades'] or ()):
                key = (record['hadith_key'], f'grades[{position}]')
                if key in stored:
                    assert stored[key] == (grade['grader'], grade['grade']), key
                    judgments_checked += 1
    report['judgments_resolved_to_parquet'] = judgments_checked
    assert judgments_checked == one("SELECT COUNT(*) FROM (SELECT DISTINCT source_key,field_path FROM grading_judgments WHERE origin='quranlab_fawazahmed0')")
    text_checked = 0
    for config in [row[0] for row in db.execute('SELECT DISTINCT config FROM quranlab_records ORDER BY 1')]:
        stored = {row['source_key']: row for row in db.execute('SELECT source_key,text,text_sha256 FROM quranlab_records WHERE config=?', (config,))}
        for record in pq.read_table(source_root / config / 'train-00000-of-00001.parquet', columns=['hadith_key', 'text']).to_pylist():
            value = record['text'] or ''
            row = stored[record['hadith_key']]
            assert row['text_sha256'] == hashlib.sha256(value.encode('utf-8')).hexdigest()
            assert row['text'] is None or row['text'] == value
            text_checked += 1
    report['source_texts_hash_verified'] = text_checked
    registry = {row[0] for row in db.execute('SELECT source_id FROM source_registry')}
    stored_hashes = {}
    for row in db.execute("SELECT source_key,language,text_sha256,explanation FROM quranlab_records WHERE language IN ('ar','en')"):
        stored_hashes[(row['source_key'], row['language'], 'text')] = row['text_sha256']
        if row['explanation']:
            stored_hashes[(row['source_key'], row['language'], 'explanation')] = hashlib.sha256(row['explanation'].encode('utf-8')).hexdigest()
    values = covered = unresolved_fields = rows_checked = added = 0
    for row in db.execute(f'SELECT id,{",".join(chr(34) + column + chr(34) for column in MASTER_COLUMNS)},field_provenance_json,source_datasets_json FROM main.hadiths'):
        provenance = json.loads(row['field_provenance_json'])
        assert provenance['schema_version'] == 1 and provenance['base']['id'] == row['id'] and provenance['base']['sha256'] == (base_sha if row['id'] <= base_last else None)
        assert json.loads(row['source_datasets_json'])
        seen = {}
        for group in provenance['fields']:
            assert group['source'] in registry, group['source']
            assert group.get('upstream') != 'unresolved' or group['source'] == 'base:db'
            for field, digest in group['fields'].items():
                assert field not in seen, field
                seen[field] = digest
                unresolved_fields += group.get('upstream') == 'unresolved'
        for column in MASTER_COLUMNS:
            value = row[column]
            if value is None or value == '':
                assert column in provenance['missing'], (row['id'], column)
            else:
                values += 1
                assert seen.get(column) == short(value), (row['id'], column)
                covered += 1
        for entry in provenance['added']:
            assert entry['source'] in registry
            assert stored_hashes[(entry['record'], entry['source'].rsplit('-', 1)[1], entry['field'])] == entry['sha256'], entry
            added += 1
        rows_checked += 1
    report.update({'provenance_rows': rows_checked, 'provenance_values_checked': values, 'provenance_values_covered': covered, 'provenance_values_unresolved_upstream': unresolved_fields, 'provenance_added_entries': added})
    assert values == covered
    added_hash = one("SELECT COUNT(*) FROM hadith_crosswalk c JOIN quranlab_records r ON r.source_key=c.source_key AND r.language IN ('ar','en') WHERE c.decision='verified_match' AND c.collection<>'hadeethenc'")
    report['added_links_expected'] = added_hash
    calibration_checked = 0
    for item in json.loads(Path(calibration).read_text(encoding='utf-8'))['positives']:
        assert db.execute("SELECT 1 FROM hadith_crosswalk WHERE source_key=? AND hadith_id=? AND decision='verified_match'", (item['source_key'], item['hadith_id'])).fetchone(), item
        calibration_checked += 1
    for item in json.loads(Path(calibration).read_text(encoding='utf-8'))['hard_negatives']:
        assert not db.execute('SELECT 1 FROM hadith_crosswalk WHERE source_key=? AND hadith_id=?', (item['source_key'], item['hadith_id'])).fetchone(), item
        calibration_checked += 1
    report['calibration_pairs_checked'] = calibration_checked
    report['scholarly_accuracy'] = 'not certified'
    db.close()
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=HERE / 'data/output')
    parser.add_argument('--source-dir', type=Path, default=HERE / 'data/sources/quranlab-hadith')
    parser.add_argument('--ohd-dir', type=Path, default=ARCHIVE / 'Open-Hadith-Data')
    args = parser.parse_args()
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    output = args.output_dir.resolve()
    result = verify(output / 'sunnah_merged_quranlab_v1.sqlite', output / 'sunnah_kutub_tisah_itqan.sqlite', args.source_dir.resolve() / REVISION, HERE / 'reference/quranlab_match_calibration.json')
    (output / 'quranlab-reports').mkdir(exist_ok=True)
    (output / 'quranlab-reports' / 'verification_report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    from src.quranlab_report import build_report
    build_report(output / 'sunnah_merged_quranlab_v1.sqlite', args.source_dir.resolve() / REVISION, args.ohd_dir, output)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
