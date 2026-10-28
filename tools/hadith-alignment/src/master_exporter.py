"""Isolated five-table derived corpus; canonical application stores are never opened."""
import csv
import json
import sqlite3

import pyarrow as pa
import pyarrow.parquet as pq

from .isnad_parser import name_key
from .itqan_schema import FLOAT_COLUMNS, INTEGER_COLUMNS, MASTER_COLUMNS
from .itqan_sources import iter_profiles
from .normalizer import normalize_arabic
from .quran_bridge import SYMBOLS
from .rijal_matcher import classify_narrator_grade, death_year


def open_master_database(path):
    db = sqlite3.connect(path)
    db.execute('PRAGMA foreign_keys=ON')
    columns = ','.join(f'"{c}" ' + ('REAL' if c in FLOAT_COLUMNS else 'INTEGER' if c in INTEGER_COLUMNS else 'TEXT') for c in MASTER_COLUMNS)
    db.execute(f'CREATE TABLE hadiths(id INTEGER PRIMARY KEY AUTOINCREMENT,book_key TEXT NOT NULL,{columns})')
    db.execute('CREATE INDEX idx_hadiths_book_num ON hadiths(book_key,Hadith_number)')
    db.execute('CREATE INDEX idx_hadiths_grade ON hadiths(book_key,English_Grade)')
    db.execute('CREATE INDEX idx_hadiths_matn_book_id ON hadiths(Matn_Book_ID)')
    db.execute('CREATE INDEX idx_hadiths_comm_book_id ON hadiths(Commentary_Book_ID)')
    db.execute('CREATE TABLE rijal_narrators(rijal_id TEXT PRIMARY KEY,primary_name_ar TEXT NOT NULL,primary_name_norm TEXT NOT NULL,kunya_ar TEXT,nasab_ar TEXT,laqab_nisba_ar TEXT,english_name TEXT,tabaqah TEXT,death_year_ah INTEGER,jarh_tadil_raw_ar TEXT,jarh_tadil_tier TEXT,reliability_score REAL,sources_json TEXT,teachers_json TEXT,students_json TEXT)')
    db.execute('CREATE INDEX idx_rijal_name_norm ON rijal_narrators(primary_name_norm)')
    db.execute('CREATE INDEX idx_rijal_kunya ON rijal_narrators(kunya_ar)')
    db.execute('CREATE INDEX idx_rijal_tier ON rijal_narrators(jarh_tadil_tier)')
    db.execute('CREATE TABLE hadith_narrators(hadith_id INTEGER NOT NULL REFERENCES hadiths(id),chain_position INTEGER NOT NULL,surface_mention_ar TEXT NOT NULL,resolved_name_ar TEXT NOT NULL,rijal_id TEXT REFERENCES rijal_narrators(rijal_id),resolution_method TEXT NOT NULL,PRIMARY KEY(hadith_id,chain_position))')
    db.execute('CREATE INDEX idx_hadith_narrators_rijal ON hadith_narrators(rijal_id)')
    db.execute('CREATE TABLE quran_hadith_root_bridge(root_ar TEXT NOT NULL,hadith_id INTEGER NOT NULL REFERENCES hadiths(id),matched_words_json TEXT,wensinck_ref TEXT,PRIMARY KEY(root_ar,hadith_id))')
    db.execute('CREATE INDEX idx_bridge_hadith ON quran_hadith_root_bridge(hadith_id)')
    db.execute("CREATE VIRTUAL TABLE hadiths_fts USING fts5(book_key UNINDEXED,Hadith_number UNINDEXED,Chapter_Arabic,Section_Arabic,Arabic_Matn_Norm,Arabic_Tafseel_Norm,English_Hadith,tokenize='unicode61')")
    return db


def import_rijal(db, source):
    count = 0
    for identity, p in iter_profiles(source):
        tier, weight = classify_narrator_grade(p.get('grade_ar', ''), p.get('grade_en', ''))
        values = [identity, p['full_name'], name_key(p['full_name']), p.get('kunya', ''), p.get('nasab', ''), p.get('laqab', ''), '', p.get('tabaqat', ''), death_year(p.get('death', '')), p.get('grade_ar', ''), tier, weight, json.dumps({'classical_sources': p.get('classical_sources', {}), 'provenance': p.get('provenance', {}), 'name_variants': p.get('namings', []), 'source_death_text': p.get('death', ''), 'source_grade_en': p.get('grade_en', '')}, ensure_ascii=False), json.dumps(p.get('teachers', [])), json.dumps(p.get('students', []))]
        db.execute('INSERT INTO rijal_narrators VALUES (' + ','.join('?' for _ in values) + ')', values)
        count += 1
    db.commit()
    return count


def write_master_book(root, db, book, rows, provenance):
    schema = pa.schema([(c, pa.float64() if c in FLOAT_COLUMNS else pa.int64() if c in INTEGER_COLUMNS else pa.string()) for c in MASTER_COLUMNS])
    for record in rows:
        if set(record) != set(MASTER_COLUMNS):
            raise ValueError('Master schema must contain exactly 34 export columns')
    with (root / f'{book}_aligned_34col.csv').open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=MASTER_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    with pq.ParquetWriter(root / f'{book}_aligned_34col.parquet', schema, compression='zstd') as writer:
        for start in range(0, len(rows), 128):
            writer.write_table(pa.Table.from_pylist(rows[start:start+128], schema=schema))
    (root / 'provenance').mkdir(exist_ok=True)
    with (root / 'provenance' / f'{book}.jsonl').open('w', encoding='utf-8') as stream:
        for entry in provenance:
            stream.write(json.dumps(entry, ensure_ascii=False, sort_keys=True) + '\n')
    for row, entry in zip(rows, provenance):
        values = [book] + [row[c] for c in MASTER_COLUMNS]
        cursor = db.execute(f'INSERT INTO hadiths(book_key,{",".join(MASTER_COLUMNS)}) VALUES ({",".join("?" for _ in values)})', values)
        identity = cursor.lastrowid
        nodes = json.loads(row['Itqan_Narrator_Chain_JSON'])
        for node in nodes:
            db.execute('INSERT INTO hadith_narrators VALUES (?,?,?,?,?,?)', [identity, node['pos'], node['surface'], node['resolved_name'], node.get('rijal_id'), node['method']])
        for root_ar, words in entry['root_words'].items():
            db.execute('INSERT INTO quran_hadith_root_bridge VALUES (?,?,?,?)', [root_ar, identity, json.dumps(words, ensure_ascii=False), f'Wensinck:{SYMBOLS[book]}:root:{root_ar}'])
        db.execute('INSERT INTO hadiths_fts(rowid,book_key,Hadith_number,Chapter_Arabic,Section_Arabic,Arabic_Matn_Norm,Arabic_Tafseel_Norm,English_Hadith) VALUES (?,?,?,?,?,?,?,?)', [identity, book, row['Hadith_number'], normalize_arabic(row['Chapter_Arabic']), normalize_arabic(row['Section_Arabic']), normalize_arabic(row['Arabic_Matn']), normalize_arabic(row['Arabic_Tafseel']), row['English_Hadith']])
    db.commit()
