"""Read-only, independent field/export/page-span verification for Shamela outputs."""
import argparse
import csv
import json
from pathlib import Path
import sqlite3

import pyarrow.parquet as pq

from src.indexer import search_database
from src.loaders import LK_COLUMNS, load_lk, resolve_folder
from src.normalizer import normalize_arabic
from src.shamela_loader import read_book, sha256
from src.shamela_registry import CORPUS_COLUMNS, REGISTRY


def reconstruct(source: dict | None, pages: dict[str, dict]) -> str:
    if source is None:
        return ''
    parts = []
    prior = None
    for span in source['spans']:
        serial = span['serial_number']
        page = pages[serial]
        assert page['book_id'] == source['book_id']
        assert 0 <= span['start'] <= span['end'] <= len(page['text'])
        if prior is not None and prior != serial and parts and not parts[-1].endswith('\n'):
            parts.append('\n')
        parts.append(page['text'][span['start']:span['end']])
        prior = serial
    return ''.join(parts)


def verify(output: Path, cache: Path, lk: Path) -> dict:
    audit = json.loads((output / 'corpus_9books_audit.json').read_text(encoding='utf-8'))
    assert sha256(cache) == audit['source']['cache_sha256']
    database = output / 'sunnah_9books_shamela_corpus.db'
    db = sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True)
    original_fields = count = matches = 0
    try:
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert len(db.execute('PRAGMA index_list(hadiths)').fetchall()) >= 4
        for summary in audit['books']:
            book = summary['collection']
            pair = REGISTRY[book]
            original = load_lk(resolve_folder(lk, pair.lk_aliases))[0] if pair.lk_aliases else None
            source_pages = {p['serial_number']: p for identity in [pair.matn_id, pair.sharh_id] for p in read_book(cache, identity)}
            with (output / 'csv' / f'{book}_Shamela.csv').open(encoding='utf-8-sig', newline='') as stream:
                reader = csv.DictReader(stream)
                assert reader.fieldnames == CORPUS_COLUMNS
                csv_rows = list(reader)
            parquet = pq.ParquetFile(output / 'parquet' / f'{book}_Shamela.parquet')
            assert parquet.schema_arrow.names == CORPUS_COLUMNS
            for j in range(parquet.metadata.num_row_groups):
                assert parquet.metadata.row_group(j).column(0).compression == 'ZSTD'
            records = parquet.read().to_pylist()
            parquet.close()
            with (output / 'provenance' / f'{book}.jsonl').open(encoding='utf-8') as stream:
                ledger = [json.loads(line) for line in stream]
            sql = db.execute(f'SELECT {",".join(CORPUS_COLUMNS)} FROM hadiths WHERE Collection=? ORDER BY id', (book,)).fetchall()
            assert len(records) == len(csv_rows) == len(ledger) == len(sql) == summary['total_hadiths']
            if original is not None:
                assert len(original) == len(records)
            for i, (record, csv_row, entry, stored) in enumerate(zip(records, csv_rows, ledger, sql)):
                assert list(stored) == [record[k] for k in CORPUS_COLUMNS]
                assert all(float(csv_row[k]) == record[k] if k == 'Tafseel_Match_Score' else csv_row[k] == record[k] for k in CORPUS_COLUMNS)
                if original is not None:
                    assert all(record[k] == original[i][k] for k in LK_COLUMNS), (book, i, 'original field mutated')
                    original_fields += 16
                else:
                    assert record['Arabic_Hadith'] == reconstruct(entry['matn'], source_pages)[:entry['base_text_end']]
                    assert record['Arabic_Isnad'] + record['Arabic_Matn'] == record['Arabic_Hadith']
                expected = reconstruct(entry['sharh'], source_pages)
                if entry['tahqiq_appended']:
                    expected += ('\n\n' if expected else '') + entry['tahqiq']
                assert expected == record['Arabic_Tafseel'], (book, i, 'commentary differs from recorded spans')
                for prefix, source in [('Matn', entry['matn']), ('Sharh', entry['sharh'])]:
                    if source:
                        assert record[f'Shamela_{prefix}_Book_ID'] == source['book_id']
                        assert record[f'Shamela_{prefix}_Vol_Page'] == source['start']
                    else:
                        assert not record[f'Shamela_{prefix}_Book_ID']
                assert 0 <= record['Tafseel_Match_Score'] <= 1
                matches += bool(record['Arabic_Tafseel'])
            count += len(records)
        assert db.execute('SELECT COUNT(*) FROM hadiths').fetchone()[0] == count
        # Representative unvocalized search; limit isn't required to return the
        # sampled row when thousands of narrations share the phrase.
        sample = db.execute('SELECT Arabic_Hadith FROM hadiths WHERE length(Arabic_Hadith)>50 LIMIT 1').fetchone()
        if sample:
            query = ' '.join(normalize_arabic(sample[0]).split()[:4])
            assert search_database(database, query), 'Normalized Arabic FTS query failed'
        return {'collections': len(audit['books']), 'rows': count, 'original_lk_fields_verified': original_fields, 'commentary_rows_verified': matches, 'sqlite_integrity': 'ok', 'csv_parquet_sql_parity': True, 'source_spans': 'verified', 'scholarly_alignment_accuracy': 'not measured'}
    finally:
        db.close()


if __name__ == '__main__':
    here = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=here / 'output-shamela')
    parser.add_argument('--cache', type=Path, default=here / 'data/cache/shamela_18books.parquet')
    parser.add_argument('--lk-dir', type=Path, default=here.parent.parent / 'LK-Hadith-Corpus')
    args = parser.parse_args()
    print(json.dumps(verify(args.output_dir, args.cache, args.lk_dir), indent=2))
