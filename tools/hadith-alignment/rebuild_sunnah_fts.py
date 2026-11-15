"""Rebuild the Sunnah search index (hadiths_fts) with the isnad included (KEY-359).

Adds Arabic_Isnad_Norm to hadiths_fts so that slash search matches narrator
chains and isnad-matn combinations directly in the SQLite FTS5 index without
requiring a 3-second in-memory warmup or high memory footprint.
"""
import argparse
import os
from pathlib import Path
import sqlite3
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
from src.normalizer import normalize_arabic  # noqa: E402

FTS_SCHEMA = """
CREATE VIRTUAL TABLE hadiths_fts USING fts5(
    book_key UNINDEXED,
    Hadith_number UNINDEXED,
    Chapter_Arabic,
    Section_Arabic,
    Arabic_Matn_Norm,
    Arabic_Isnad_Norm,
    Arabic_Tafseel_Norm,
    English_Hadith,
    tokenize='unicode61'
)
"""

INSERT_FTS = """
INSERT INTO hadiths_fts(
    rowid,
    book_key,
    Hadith_number,
    Chapter_Arabic,
    Section_Arabic,
    Arabic_Matn_Norm,
    Arabic_Isnad_Norm,
    Arabic_Tafseel_Norm,
    English_Hadith
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
"""


def rebuild_fts(db_path: Path, vacuum: bool = False) -> dict:
    if not db_path.exists():
        raise FileNotFoundError(f"Database file not found: {db_path}")

    size_before = os.path.getsize(db_path)
    t0 = time.perf_counter()

    con = sqlite3.connect(db_path)
    cur = con.cursor()

    # Verify hadiths table exists
    has_hadiths = cur.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='hadiths'").fetchone()[0]
    if not has_hadiths:
        con.close()
        raise ValueError(f"No 'hadiths' table found in {db_path}")

    # Check existing hadiths_fts columns
    existing_cols = [r[1] for r in cur.execute("PRAGMA table_info(hadiths_fts)").fetchall()]
    print(f"Current hadiths_fts columns: {existing_cols}")

    total_hadiths = cur.execute("SELECT COUNT(*) FROM hadiths").fetchone()[0]
    print(f"Total hadiths to index: {total_hadiths}")

    # Drop existing virtual table
    print("Dropping existing hadiths_fts...")
    cur.execute("DROP TABLE IF EXISTS hadiths_fts")

    # Create new virtual table with Arabic_Isnad_Norm
    print("Creating new hadiths_fts with Arabic_Isnad_Norm...")
    cur.execute(FTS_SCHEMA)

    # Stream hadiths and populate FTS5
    print("Populating hadiths_fts from hadiths table...")
    select_sql = """
    SELECT
        id,
        book_key,
        Hadith_number,
        Chapter_Arabic,
        Section_Arabic,
        Arabic_Matn,
        Arabic_Isnad,
        Arabic_Tafseel,
        English_Hadith
    FROM hadiths
    ORDER BY id
    """

    read_cur = con.cursor()
    write_cur = con.cursor()

    batch = []
    count = 0
    t_read_start = time.perf_counter()

    for row in read_cur.execute(select_sql):
        (hadith_id, book_key, hadith_number, ch_ar, sec_ar,
         matn_ar, isnad_ar, tafseel_ar, eng_hadith) = row

        ch_norm = normalize_arabic(ch_ar)
        sec_norm = normalize_arabic(sec_ar)
        matn_norm = normalize_arabic(matn_ar)
        isnad_norm = normalize_arabic(isnad_ar)
        tafseel_norm = normalize_arabic(tafseel_ar)

        batch.append((
            hadith_id,
            book_key or '',
            str(hadith_number or ''),
            ch_norm,
            sec_norm,
            matn_norm,
            isnad_norm,
            tafseel_norm,
            eng_hadith or ''
        ))

        if len(batch) >= 5000:
            write_cur.executemany(INSERT_FTS, batch)
            count += len(batch)
            batch.clear()

    if batch:
        write_cur.executemany(INSERT_FTS, batch)
        count += len(batch)
        batch.clear()

    con.commit()
    t_pop = time.perf_counter() - t_read_start
    print(f"Inserted {count} rows in {t_pop:.2f}s")

    # Optimize index
    print("Optimizing FTS5 index...")
    t_opt_start = time.perf_counter()
    write_cur.execute("INSERT INTO hadiths_fts(hadiths_fts) VALUES('optimize')")
    con.commit()
    t_opt = time.perf_counter() - t_opt_start
    print(f"Optimized in {t_opt:.2f}s")

    # Integrity check
    print("Running FTS5 integrity-check...")
    write_cur.execute("INSERT INTO hadiths_fts(hadiths_fts) VALUES('integrity-check')")
    con.commit()

    if vacuum:
        print("Running VACUUM...")
        t_vac = time.perf_counter()
        con.execute("VACUUM")
        print(f"VACUUM completed in {time.perf_counter() - t_vac:.2f}s")

    con.close()

    size_after = os.path.getsize(db_path)
    total_time = time.perf_counter() - t0

    result = {
        'total_hadiths': total_hadiths,
        'indexed_count': count,
        'duration_seconds': round(total_time, 2),
        'size_before_bytes': size_before,
        'size_after_bytes': size_after,
        'size_diff_bytes': size_after - size_before,
        'size_diff_mb': round((size_after - size_before) / (1024 * 1024), 2),
    }
    return result


def verify_fts(db_path: Path):
    print(f"\nVerifying FTS index in {db_path}...")
    con = sqlite3.connect(db_path)
    cur = con.cursor()

    # 1. Check schema
    cols = [r[1] for r in cur.execute("PRAGMA table_info(hadiths_fts)").fetchall()]
    assert 'Arabic_Isnad_Norm' in cols, f"Arabic_Isnad_Norm missing from {cols}"
    print(f"PASS: Schema contains Arabic_Isnad_Norm. Columns: {cols}")

    # 2. Check row counts
    hadiths_cnt = cur.execute("SELECT COUNT(*) FROM hadiths").fetchone()[0]
    fts_cnt = cur.execute("SELECT COUNT(*) FROM hadiths_fts").fetchone()[0]
    assert hadiths_cnt == fts_cnt, f"Mismatch count: hadiths={hadiths_cnt}, fts={fts_cnt}"
    print(f"PASS: Row count match ({hadiths_cnt})")

    # 3. Test query 1: الحميدي الأعمال بالنيات (narrator in isnad, matn in matn)
    q1 = '"الحميدي" AND "الاعمال" AND "بالنيات"'
    r1 = cur.execute("SELECT rowid FROM hadiths_fts WHERE hadiths_fts MATCH ? LIMIT 5", (q1,)).fetchall()
    assert len(r1) > 0, "Query 1 failed: no hits for الحميدي الأعمال بالنيات"
    assert 1 in [r[0] for r in r1], "Query 1 should include Bukhari 1 (rowid 1)"
    print(f"PASS: Query 1 (الحميدي الأعمال بالنيات) found {len(r1)} matches, including Bukhari 1")

    # 4. Test query 2: قتيبة الليث بلالا (narrators in isnad, word in matn)
    q2 = '"قتيبه" AND "الليث" AND "بلالا"'
    r2 = cur.execute("SELECT rowid FROM hadiths_fts WHERE hadiths_fts MATCH ? LIMIT 5", (q2,)).fetchall()
    assert len(r2) > 0, "Query 2 failed: no hits for قتيبة الليث بلالا"
    assert 1590 in [r[0] for r in r2], "Query 2 should include Bukhari 1596 (rowid 1590)"
    print(f"PASS: Query 2 (قتيبة الليث بلالا) found {len(r2)} matches, including Bukhari 1596 (id 1590)")

    # 5. Integrity check
    cur.execute("INSERT INTO hadiths_fts(hadiths_fts) VALUES('integrity-check')")
    print("PASS: FTS5 integrity-check succeeded")

    con.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, default=Path('tools/hadith-alignment/data/output/sunnah_merged_quranlab_v1.sqlite'))
    parser.add_argument('--verify-only', action='store_true', help='Only verify the database index without rebuilding')
    parser.add_argument('--vacuum', action='store_true', help='Run VACUUM after rebuilding')
    args = parser.parse_args()

    if args.verify_only:
        verify_fts(args.db)
        return

    print(f"Starting FTS rebuild on {args.db}...")
    res = rebuild_fts(args.db, vacuum=args.vacuum)
    print("\nRebuild Summary:")
    for k, v in res.items():
        print(f"  {k}: {v}")

    verify_fts(args.db)


if __name__ == '__main__':
    main()
