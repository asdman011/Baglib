"""Independent master export, relationship and source-integrity verification."""
import argparse
import csv
import json
from pathlib import Path
import re
import sqlite3

import pyarrow.parquet as pq

from src.itqan_schema import FLOAT_COLUMNS, INTEGER_COLUMNS, MASTER_COLUMNS, book_url
from src.loaders import LK_COLUMNS, load_lk, resolve_folder
from src.master_registry import MASTER_REGISTRY
from src.normalizer import normalize_arabic, present
from src.shamela_loader import read_book, sha256
from src.shamela_registry import REGISTRY
from verify_shamela_outputs import reconstruct


def verify_master(output, lk_dir):
    report = json.loads((output / 'provenance_audit.json').read_text(encoding='utf-8'))
    db = sqlite3.connect((output / 'sunnah_kutub_tisah_itqan.sqlite').resolve().as_uri() + '?mode=ro', uri=True)
    total = cells = preserved = changed = commentary_count = nodes_count = roots_count = 0
    try:
        for source in report['itqan_sources']:
            assert sha256(Path(source['path'])) == source['sha256'], 'Itqan input changed since generation'
        if report.get('quran_vocabulary_sha256'):
            assert sha256(Path(report['quran_vocabulary_source'])) == report['quran_vocabulary_sha256']
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert db.execute('PRAGMA foreign_key_check').fetchall() == []
        profiles = db.execute('SELECT COUNT(*) FROM rijal_narrators').fetchone()[0]
        assert profiles == report['rijal_profiles']
        allowed_roots = set(report['quran_roots'])
        for summary in report['books']:
            book = summary['book']
            pair = MASTER_REGISTRY[book]
            with (output / f'{book}_aligned_34col.csv').open(encoding='utf-8-sig', newline='') as stream:
                reader = csv.DictReader(stream)
                assert reader.fieldnames == MASTER_COLUMNS
                csv_rows = list(reader)
            assert (output / f'{book}_aligned_34col.csv').read_bytes().startswith(b'\xef\xbb\xbf')
            parquet = pq.ParquetFile(output / f'{book}_aligned_34col.parquet')
            assert parquet.schema_arrow.names == MASTER_COLUMNS
            for index in range(parquet.metadata.num_row_groups):
                assert parquet.metadata.row_group(index).column(0).compression == 'ZSTD'
            rows = parquet.read().to_pylist()
            parquet.close()
            sql = db.execute(f'SELECT id,{",".join(MASTER_COLUMNS)} FROM hadiths WHERE book_key=? ORDER BY id', (book,)).fetchall()
            with (output / 'provenance' / f'{book}.jsonl').open(encoding='utf-8') as stream:
                evidence = [json.loads(line) for line in stream]
            assert len(rows) == len(csv_rows) == len(sql) == len(evidence) == summary['records']
            aliases = REGISTRY[book].lk_aliases
            original = load_lk(resolve_folder(lk_dir, aliases))[0] if aliases else None
            pages = {}
            for identity in {pair.matn, pair.commentary}:
                metadata = report['page_cache']['books'][identity]
                path = Path(metadata['path'])
                assert sha256(path) == metadata['sha256']
                pages.update({p['serial_number']: p for p in read_book(path, identity)})
            for i, (row, csv_row, stored, entry) in enumerate(zip(rows, csv_rows, sql, evidence)):
                assert list(stored[1:]) == [row[c] for c in MASTER_COLUMNS]
                for column in MASTER_COLUMNS:
                    value = row[column]
                    if column in FLOAT_COLUMNS:
                        assert 0 <= value <= 1 and float(csv_row[column]) == value
                    elif column in INTEGER_COLUMNS:
                        assert csv_row[column] == (str(value) if value is not None else '')
                    else:
                        assert csv_row[column] == value
                if original is not None:
                    for column in LK_COLUMNS:
                        cells += 1
                        if row[column] == original[i][column]:
                            preserved += 1
                        else:
                            assert report['grade_policy'] == 'fill' and column in {'English_Grade', 'Arabic_Grade'} and not present(original[i][column])
                            assert entry['derived_grade'] and entry['itqan_crosscheck'].get('source_id')
                            changed += 1
                else:
                    body = reconstruct(entry['matn'], pages)
                    marker = re.search(r'\[\s*تعليق المحقق\s*\]', body)
                    assert row['Arabic_Hadith'] == (body[:marker.start()] if marker else body)
                    assert row['Arabic_Isnad'] + row['Arabic_Matn'] == row['Arabic_Hadith']
                assert row['Matn_Book_ID'] == int(pair.matn) and row['Matn_Shamela_URL'] == book_url(pair.matn)
                if row['Arabic_Tafseel']:
                    commentary_count += 1
                    assert row['Commentary_Book_ID'] == int(pair.commentary)
                    assert row['Commentary_Shamela_URL'] == book_url(pair.commentary)
                    if pair.mode == 'inline':
                        source = reconstruct(entry['matn'], pages)
                        marker = re.search(r'\[\s*تعليق المحقق\s*\]', source)
                        inline = source[marker.start():] if marker else ''
                        source_notes = {pages[s['serial_number']]['foot_note'] for s in entry['matn']['spans']}
                        assert all(note in source_notes for note in entry['inline_footnotes'])
                        expected = '\n\n'.join(s for s in [inline, '\n'.join(entry['inline_footnotes'])] if present(s))
                    else:
                        expected = reconstruct(entry['commentary'], pages)
                    assert expected == row['Arabic_Tafseel']
                    first = entry['commentary']['start']
                    assert row['Source_Row_Reference'] == f'Shamela:{pair.commentary}:' + first
                else:
                    assert row['Commentary_Book_ID'] is None and row['Tafseel_Match_Method'] == 'unmatched'
                nodes = json.loads(row['Itqan_Narrator_Chain_JSON'])
                junction = db.execute('SELECT chain_position,surface_mention_ar,resolved_name_ar,rijal_id,resolution_method FROM hadith_narrators WHERE hadith_id=? ORDER BY chain_position', (stored[0],)).fetchall()
                assert junction == [(n['pos'], n['surface'], n['resolved_name'], n.get('rijal_id'), n['method']) for n in nodes]
                nodes_count += len(nodes)
                roots = json.loads(row['Itqan_Quran_Root_Links_JSON'])
                assert roots == sorted(set(roots)) and set(roots) <= allowed_roots
                relational_roots = [r[0] for r in db.execute('SELECT root_ar FROM quran_hadith_root_bridge WHERE hadith_id=? ORDER BY root_ar', (stored[0],))]
                assert relational_roots == roots
                roots_count += len(roots)
                for ayah in json.loads(row['Itqan_Linked_Ayah_Keys_JSON']):
                    assert re.fullmatch(r'\d+:\d+', ayah)
                for link in json.loads(row['Itqan_Corroborating_Hadiths_JSON']):
                    assert link['book'] != book and .85 <= link['similarity'] <= 1
                    assert db.execute('SELECT 1 FROM hadiths WHERE book_key=? AND Hadith_number=? LIMIT 1', (link['book'], link['hadith_number'])).fetchone()
            total += len(rows)
        assert db.execute('SELECT COUNT(*) FROM hadiths').fetchone()[0] == total
        assert db.execute('SELECT COUNT(*) FROM hadiths_fts').fetchone()[0] == total
        sample = db.execute('SELECT Arabic_Matn FROM hadiths WHERE length(Arabic_Matn)>50 LIMIT 1').fetchone()
        if sample:
            tokens = normalize_arabic(sample[0]).split()[:3]
            query = ' AND '.join('"'+t+'"' for t in tokens)
            assert db.execute('SELECT rowid FROM hadiths_fts WHERE hadiths_fts MATCH ? LIMIT 1', (query,)).fetchone()
        return {'books': len(report['books']), 'records': total, 'rijal_profiles': profiles, 'lk_cells_checked': cells, 'lk_cells_preserved': preserved, 'lk_grade_cells_changed_by_policy': changed, 'commentary_rows_source_verified': commentary_count, 'chain_junction_rows_verified': nodes_count, 'root_bridge_rows_verified': roots_count, 'csv_parquet_sql_parity': True, 'foreign_keys': 'ok', 'sqlite_integrity': 'ok', 'scholarly_accuracy': 'not certified'}
    finally:
        db.close()


if __name__ == '__main__':
    here = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=here / 'data/output')
    parser.add_argument('--lk-dir', type=Path, default=here.parent.parent / 'LK-Hadith-Corpus')
    args = parser.parse_args()
    result = verify_master(args.output_dir, args.lk_dir)
    (args.output_dir / 'verification_report.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))
