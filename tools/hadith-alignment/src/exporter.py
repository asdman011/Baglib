"""Derived exports, source fingerprints and explicit alignment audit semantics."""
from collections import Counter
import csv
import json
import sqlite3
import statistics
from pathlib import Path

from .aligner import Match
from .loaders import APPENDED, LK_COLUMNS, OhdRow

METHODS = ('exact_window', 'tfidf_window', 'sub_narration_ffill', 'unmatched')


def values(row: dict[str, str], match: Match) -> list:
    return [row[k] for k in LK_COLUMNS] + [match.commentary, match.score, match.method, match.index]


def initialize_database(path: Path) -> sqlite3.Connection:
    db = sqlite3.connect(path)
    fields = ', '.join(f'"{c}" TEXT NOT NULL' for c in LK_COLUMNS)
    db.execute(f'CREATE TABLE hadiths (Collection TEXT NOT NULL, {fields}, Arabic_Tafseel TEXT, Tafseel_Match_Score REAL NOT NULL CHECK(Tafseel_Match_Score BETWEEN 0 AND 1), Tafseel_Match_Method TEXT NOT NULL, OHD_Row_Index INTEGER NOT NULL)')
    db.execute('CREATE INDEX hadith_reference ON hadiths(Collection, Chapter_Number, Hadith_number)')
    db.execute('CREATE INDEX hadith_match_score ON hadiths(Tafseel_Match_Score)')
    return db


def export_book(root: Path, db: sqlite3.Connection, book: str, rows: list[dict[str, str]], matches: list[Match]) -> None:
    if len(rows) != len(matches):
        raise ValueError('Alignment row count differs from source')
    path = root / 'csv' / f'{book}_LK_with_Tafseel.csv'
    path.parent.mkdir(exist_ok=True)
    with path.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow(LK_COLUMNS + APPENDED)
        writer.writerows(values(row, match) for row, match in zip(rows, matches))
    db.executemany(f'INSERT INTO hadiths VALUES ({",".join("?" for _ in range(21))})', ([book] + values(row, match) for row, match in zip(rows, matches)))
    db.commit()


def audit_book(book: str, rows: list[dict[str, str]], source: list[OhdRow], matches: list[Match], provenance: dict) -> dict:
    matched = [m for m in matches if m.commentary is not None]
    scores = [m.score for m in matched]
    counts = Counter(m.method for m in matches)
    samples = []
    for i, (row, match) in enumerate(zip(rows, matches)):
        if match.commentary is not None and .45 <= match.score < .55 and len(samples) < 5:
            samples.append({'lk_row_index': i, 'chapter': row['Chapter_Number'], 'hadith_number': row['Hadith_number'], 'score': match.score, 'method': match.method, 'ohd_row_index': match.index, 'ohd_id': source[match.index].source_id, 'lk_arabic': row['Arabic_Hadith'], 'ohd_arabic': source[match.index].text, 'commentary_excerpt': match.commentary[:300]})
    return {'collection': book, 'total_lk_rows': len(rows), 'total_ohd_rows': len(source), 'matched_count': len(matched), 'coverage_pct': 100 * len(matched) / len(rows), 'mean_score': statistics.mean(scores) if scores else None, 'median_score': statistics.median(scores) if scores else None, 'methods': {m: counts[m] for m in METHODS}, 'low_confidence_samples': samples, 'provenance': provenance}


def write_audit(root: Path, report: dict) -> str:
    (root / 'alignment_audit_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    lines = ['# Hadith commentary alignment audit', '', 'Automated candidate alignment, not scholarly verification. Scores are similarity measures, not probabilities. Exact normalized/substring matches score 1.0 by specification; ambiguous repeats and orthographic folding can still produce incorrect links. Inherited scores describe the donor, not a fresh similarity measurement.', '', 'Mean/median include matched rows only. Unmatched scores retain the best available candidate similarity (0 when none). Missing commentary is not counted as matched. Original text fields are preserved; matching normalization is deliberately lossy.', '', '| Collection | LK rows | OHD rows | Matched | Coverage | Mean | Median | Exact | TF-IDF | Inherited | Unmatched |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
    for b in report['books']:
        mean = f"{b['mean_score']:.4f}" if b['mean_score'] is not None else 'n/a'
        median = f"{b['median_score']:.4f}" if b['median_score'] is not None else 'n/a'
        lines.append(f"| {b['collection']} | {b['total_lk_rows']} | {b['total_ohd_rows']} | {b['matched_count']} | {b['coverage_pct']:.2f}% | {mean} | {median} | " + ' | '.join(str(b['methods'][m]) for m in METHODS) + ' |')
    lines += ['', '## Low-confidence samples (0.45 ≤ score < 0.55)', '', 'Full Arabic texts and commentary excerpts are in the JSON report. Row indexes are zero-based within the naturally sorted collection and the original OHD CSV, respectively.']
    for b in report['books']:
        lines += ['', f"### {b['collection']}"]
        for s in b['low_confidence_samples']:
            lines.append(f"- LK row {s['lk_row_index']}, chapter {s['chapter']}, hadith {s['hadith_number']} → OHD row {s['ohd_row_index']}: {s['score']:.4f} ({s['method']}).")
        if not b['low_confidence_samples']:
            lines.append('No matched rows in this score interval.')
    lines += ['', '## Reproducibility', '', 'The JSON records parameters, tool versions, Git revisions and SHA-256 fingerprints for every input CSV. No source scripts are executed. Outputs are separate research artifacts; they are not imported into Baglib automatically.', '']
    markdown = '\n'.join(lines)
    (root / 'alignment_audit_report.md').write_text(markdown, encoding='utf-8')
    return markdown
