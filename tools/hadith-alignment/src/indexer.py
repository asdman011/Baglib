"""28-column BOM CSV, Zstandard Parquet and normalized external-content FTS5."""
import csv
import json
from pathlib import Path
import re
import sqlite3

import pyarrow as pa
import pyarrow.parquet as pq

from .normalizer import normalize_arabic
from .shamela_registry import CORPUS_COLUMNS


def open_database(path: Path) -> sqlite3.Connection:
    db = sqlite3.connect(path)
    fields = ', '.join(f'"{c}" REAL NOT NULL CHECK("{c}" BETWEEN 0 AND 1)' if c == 'Tafseel_Match_Score' else f'"{c}" TEXT NOT NULL' for c in CORPUS_COLUMNS)
    db.execute(f'CREATE TABLE hadiths (id INTEGER PRIMARY KEY AUTOINCREMENT, Collection TEXT NOT NULL, {fields}, Normalized_Hadith TEXT NOT NULL, Normalized_Matn TEXT NOT NULL)')
    db.execute('CREATE INDEX hadith_reference ON hadiths(Collection,Chapter_Number,Hadith_number)')
    db.execute('CREATE INDEX hadith_score ON hadiths(Tafseel_Match_Score)')
    db.execute('CREATE INDEX hadith_matn_source ON hadiths(Shamela_Matn_Book_ID,Shamela_Matn_Vol_Page)')
    db.execute('CREATE INDEX hadith_sharh_source ON hadiths(Shamela_Sharh_Book_ID,Shamela_Sharh_Vol_Page)')
    db.execute("CREATE VIRTUAL TABLE hadiths_fts USING fts5(Collection,Chapter_Arabic,Section_Arabic,Normalized_Hadith,Normalized_Matn,Arabic_Tafseel,content='hadiths',content_rowid='id',tokenize='unicode61 remove_diacritics 2')")
    return db


def export_corpus_book(root: Path, db: sqlite3.Connection, book: str, records: list[dict], ledger: list[dict]) -> None:
    for folder in ('csv', 'parquet', 'provenance'):
        (root / folder).mkdir(exist_ok=True)
    schema = pa.schema([(c, pa.float64() if c == 'Tafseel_Match_Score' else pa.string()) for c in CORPUS_COLUMNS])
    if any(set(r) != set(CORPUS_COLUMNS) for r in records):
        raise ValueError('Incorrect 28-column output schema')
    with (root / 'csv' / f'{book}_Shamela.csv').open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=CORPUS_COLUMNS)
        writer.writeheader()
        writer.writerows(records)
    with pq.ParquetWriter(root / 'parquet' / f'{book}_Shamela.parquet', schema, compression='zstd') as writer:
        for start in range(0, len(records), 128):
            writer.write_table(pa.Table.from_pylist(records[start:start+128], schema=schema))
    with (root / 'provenance' / f'{book}.jsonl').open('w', encoding='utf-8') as stream:
        for entry in ledger:
            stream.write(json.dumps(entry, ensure_ascii=False) + '\n')
    for record in records:
        values = [record[c] for c in CORPUS_COLUMNS]
        norm_hadith, norm_matn = normalize_arabic(record['Arabic_Hadith']), normalize_arabic(record['Arabic_Matn'])
        cursor = db.execute(f'INSERT INTO hadiths(Collection,{",".join(CORPUS_COLUMNS)},Normalized_Hadith,Normalized_Matn) VALUES ({",".join("?" for _ in range(31))})', [book, *values, norm_hadith, norm_matn])
        # unicode61 does not fold Arabic tashkeel/hamza by itself. Index normalized
        # copies, while external-content retrieval returns the untouched source.
        db.execute('INSERT INTO hadiths_fts(rowid,Collection,Chapter_Arabic,Section_Arabic,Normalized_Hadith,Normalized_Matn,Arabic_Tafseel) VALUES (?,?,?,?,?,?,?)', [cursor.lastrowid, book, normalize_arabic(record['Chapter_Arabic']), normalize_arabic(record['Section_Arabic']), norm_hadith, norm_matn, normalize_arabic(record['Arabic_Tafseel'])])
    db.commit()


def search_database(path: Path, text: str, limit: int = 20) -> list[dict]:
    normalized = ' '.join(x for x in [normalize_arabic(text), ' '.join(re.findall(r'[A-Za-z]+', text.lower()))] if x)
    if not normalized:
        return []
    # Literal tokens, not user-supplied FTS operators. Read-only artifact access.
    query = ' AND '.join('"' + token.replace('"', '""') + '"' for token in normalized.split())
    db = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)
    try:
        db.row_factory = sqlite3.Row
        return [dict(r) for r in db.execute('SELECT h.id,h.Collection,h.Hadith_number,h.Arabic_Hadith,h.Arabic_Tafseel FROM hadiths_fts JOIN hadiths h ON h.id=hadiths_fts.rowid WHERE hadiths_fts MATCH ? ORDER BY rank LIMIT ?', (query, max(1, min(limit, 200))))]
    finally:
        db.close()
