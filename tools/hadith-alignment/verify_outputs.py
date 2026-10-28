"""Independently check exported fields, provenance, SQL parity and match windows."""
import argparse
import csv
import json
import math
from pathlib import Path
import sqlite3

from src.loaders import APPENDED, LK_COLUMNS, load_lk, load_ohd, resolve_sources


def verify(output: Path, lk: Path, ohd: Path) -> dict:
    report = json.loads((output / 'alignment_audit_report.json').read_text(encoding='utf-8'))
    db = sqlite3.connect(f'{(output / "sunnah_lk_tafseel.db").resolve().as_uri()}?mode=ro', uri=True)
    total = 0
    try:
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert {r[1] for r in db.execute('PRAGMA index_list(hadiths)')} == {'hadith_reference', 'hadith_match_score'}
        for book in report['books']:
            name = book['collection']
            lk_path, ohd_path = resolve_sources(lk, ohd, name)
            original, _ = load_lk(lk_path)
            source, _ = load_ohd(ohd_path)
            with (output / 'csv' / f'{name}_LK_with_Tafseel.csv').open(encoding='utf-8-sig', newline='') as stream:
                reader = csv.DictReader(stream)
                assert reader.fieldnames == LK_COLUMNS + APPENDED
                exported = list(reader)
            sql = db.execute('SELECT * FROM hadiths WHERE Collection=? ORDER BY rowid', (name,)).fetchall()
            assert len(original) == len(exported) == len(sql) == book['total_lk_rows']
            matched = 0
            for i, (a, b, c) in enumerate(zip(original, exported, sql)):
                assert [a[k] for k in LK_COLUMNS] == [b[k] for k in LK_COLUMNS] == list(c[1:17]), (name, i, 'original field changed')
                score, index = float(b['Tafseel_Match_Score']), int(b['OHD_Row_Index'])
                method = b['Tafseel_Match_Method']
                assert math.isfinite(score) and 0 <= score <= 1
                assert list(c[17:]) == [b['Arabic_Tafseel'] or None, score, method, index]
                if method == 'unmatched':
                    assert index == -1 and b['Arabic_Tafseel'] == ''
                else:
                    matched += 1
                    assert 0 <= index < len(source)
                    assert b['Arabic_Tafseel'] == source[index].commentary
                    if method != 'sub_narration_ffill':
                        center = i * len(source) // len(original)
                        half = max(350, math.floor(report['parameters']['window_pct'] * len(source)))
                        assert max(0, center-half) <= index < min(len(source), center+half)
            assert matched == book['matched_count']
            total += len(original)
        assert db.execute('SELECT COUNT(*) FROM hadiths').fetchone()[0] == total
        return {'verified_rows': total, 'original_fields_verified': total * 16, 'collections': len(report['books']), 'sqlite_integrity': 'ok'}
    finally:
        db.close()


if __name__ == '__main__':
    here = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=here / 'output')
    parser.add_argument('--lk-dir', type=Path, default=here.parent.parent / 'LK-Hadith-Corpus')
    parser.add_argument('--ohd-dir', type=Path, default=here.parent.parent / 'Open-Hadith-Data')
    args = parser.parse_args()
    print(json.dumps(verify(args.output_dir, args.lk_dir, args.ohd_dir), indent=2))
