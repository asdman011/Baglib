"""One-book-at-a-time construction, provenance and auditable match decisions."""
from collections import Counter
import json

from .loaders import load_lk, resolve_folder
from .normalizer import normalize_arabic, present
from .shamela_aligner import UnitMatch, align_units
from .shamela_loader import read_book
from .shamela_parser import Unit, base_rows, hadith_and_notes, location, order_pages, parse_units
from .shamela_registry import REGISTRY, SHAMELA_COLUMNS
from .sharh_parser import parse_sharh


def validate_book(pages: list[dict[str, str]], identity: str, category: str, title_key: str) -> dict:
    if not pages:
        raise ValueError(f'No pages for required book {identity}')
    if any(p['book_id'] != identity or p['category_id'] != category for p in pages):
        raise ValueError(f'Book/category mismatch for {identity}: expected category {category}')
    titles = sorted({p['book_title'] for p in pages})
    if any(normalize_arabic(title_key) not in normalize_arabic(title) for title in titles):
        raise ValueError(f'Book {identity} has unexpected titles {titles}; requires registry review')
    return {'book_id': identity, 'category_id': category, 'titles': titles, 'editions': sorted({p['edition'] for p in pages}), 'publishers': sorted({p['publisher'] for p in pages}), 'pages': len(pages), 'identity_check': 'id/category/title checked; scholarly correctness not certified'}


def provenance(unit: Unit | None) -> dict | None:
    if unit is None:
        return None
    return {'number': unit.number, 'anchor': unit.anchor, 'book_id': unit.start['book_id'], 'start': location(unit.start), 'spans': unit.spans, 'page_locations': [location(p) for p in unit.pages]}


def metadata(record: dict, prefix: str, unit: Unit | None) -> None:
    if unit:
        page = unit.start
        record[f'Shamela_{prefix}_Book_ID'] = page['book_id']
        record[f'Shamela_{prefix}_Title'] = page['book_title']
        record[f'Shamela_{prefix}_Edition_Publisher'] = ' | '.join(x for x in [page['edition'], page['publisher']] if present(x))
        record[f'Shamela_{prefix}_Vol_Page'] = location(page)


def process_book(book: str, cache, lk_dir, min_score: float, window_pct: float) -> tuple[list[dict], list[dict], dict, dict]:
    pair = REGISTRY[book]
    raw_matn = read_book(cache, pair.matn_id)
    raw_sharh = read_book(cache, pair.sharh_id)
    matn_identity = validate_book(raw_matn, pair.matn_id, '6', pair.matn_title_key)
    sharh_identity = validate_book(raw_sharh, pair.sharh_id, '7', pair.sharh_title_key)
    matn_pages, excluded = order_pages(raw_matn, pair.matn_id)
    sharh_pages, _ = order_pages(raw_sharh, pair.sharh_id)
    matn_units, matn_stats = parse_units(matn_pages)
    sharh_units, sharh_stats = parse_sharh(sharh_pages)
    if not matn_units:
        raise ValueError(f'{book}: no explicit numbered Matn units parsed; source adapter needs review')
    if not sharh_units:
        raise ValueError(f'{book}: no numbered or lemma Sharh units parsed; source adapter needs review')
    input_manifest = []
    construction = None
    if pair.lk_aliases:
        rows, input_manifest = load_lk(resolve_folder(lk_dir, pair.lk_aliases))
        matn_matches = align_units(rows, matn_units, min_score=min_score, window_pct=window_pct)
    else:
        rows, construction = base_rows(matn_units)
        matn_matches = [UnitMatch(i, 1, 'source_constructed') for i in range(len(rows))]
    # Verify the commentary numbers against the selected Matn edition, never the
    # LK numbering scheme directly. Missing Matn alignment disables number matching.
    verified_numbers = [matn_units[m.index].number if m.index >= 0 else '' for m in matn_matches]
    sharh_matches = align_units(rows, sharh_units, min_score=min_score, window_pct=window_pct, verified_numbers=verified_numbers, inherit=True)
    records, ledger, samples = [], [], []
    matn_count = sharh_count = tahqiq_only = 0
    for i, (row, matn_match, sharh_match) in enumerate(zip(rows, matn_matches, sharh_matches)):
        matn_unit = matn_units[matn_match.index] if matn_match.index >= 0 else None
        sharh_unit = sharh_units[sharh_match.index] if sharh_match.index >= 0 else None
        record = {**row, **dict.fromkeys(SHAMELA_COLUMNS, '')}
        metadata(record, 'Matn', matn_unit)
        metadata(record, 'Sharh', sharh_unit)
        record['Arabic_Tafseel'] = sharh_unit.text if sharh_unit else ''
        record['Shamela_Sharh_Footnote'] = sharh_unit.footnote if sharh_unit else ''
        record['Tafseel_Match_Score'] = sharh_match.score
        record['Tafseel_Match_Method'] = sharh_match.method
        tahqiq = hadith_and_notes(matn_unit)[1] if pair.tahqiq and matn_unit else ''
        if tahqiq.strip():
            # Boundary is explicit in the ledger; no invented attribution heading
            # is inserted into canonical source passages.
            record['Arabic_Tafseel'] += ('\n\n' if record['Arabic_Tafseel'] else '') + tahqiq
            if not sharh_unit:
                record['Tafseel_Match_Method'] = 'shamela_tahqiq_footnote'
                record['Tafseel_Match_Score'] = matn_match.score
                tahqiq_only += 1
        matn_count += matn_unit is not None
        sharh_count += sharh_unit is not None
        entry = {'lk_row_index': i if pair.lk_aliases else None, 'output_row_index': i, 'hadith_number': row['Hadith_number'], 'matn_match': vars(matn_match), 'sharh_match': vars(sharh_match), 'matn': provenance(matn_unit), 'sharh': provenance(sharh_unit), 'base_text_end': len(row['Arabic_Hadith']) if not pair.lk_aliases else None, 'tahqiq_appended': bool(tahqiq.strip()), 'tahqiq': tahqiq}
        ledger.append(entry)
        if .45 <= record['Tafseel_Match_Score'] < .55 and record['Arabic_Tafseel'] and len(samples) < 5:
            samples.append({'output_row_index': i, 'number': row['Hadith_number'], 'score': record['Tafseel_Match_Score'], 'matn': row['Arabic_Hadith'], 'sharh_excerpt': record['Arabic_Tafseel'][:800], 'sharh_location': record['Shamela_Sharh_Vol_Page']})
        records.append(record)
    counts = Counter(r['Tafseel_Match_Method'] for r in records)
    grade_count = sum(present(r['Arabic_Grade']) for r in records)
    total = len(rows)
    summary = {'collection': book, 'total_hadiths': total, 'matn_aligned': matn_count, 'matn_coverage_pct': 100 * matn_count / total if total else 0, 'sharh_aligned': sharh_count, 'sharh_coverage_pct': 100 * sharh_count / total if total else 0, 'commentary_or_tahqiq': sum(bool(r['Arabic_Tafseel']) for r in records), 'tahqiq_only': tahqiq_only, 'with_grade': grade_count, 'grade_coverage_pct': 100 * grade_count / total if total else 0, 'methods': dict(counts), 'matn_units': len(matn_units), 'sharh_units': len(sharh_units), 'excluded_index_pages': excluded, 'matn_identity': matn_identity, 'sharh_identity': sharh_identity, 'lk_inputs': input_manifest, 'construction': construction, 'low_confidence_samples': samples}
    details = {'matn': matn_stats, 'sharh': sharh_stats, 'note_policy': 'A whole-page footnote is attached only when exactly one parsed unit uses that page; ambiguous notes are retained here for review, not copied across all narrations.'}
    return records, ledger, summary, details


def write_report(root, report: dict) -> str:
    (root / 'corpus_9books_audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    lines = ['# Nine-book Shamela corpus audit', '', 'Identity/category/title checks and automated alignment are not scholarly certification. All parsing, segmentation, grades and links require edition-aware review. Coverage is not accuracy. Counts are parsed rows; repeated and compound references are retained. Original LK fields stay intact.', '', '| Collection | Parsed rows | Matn aligned | Sharh aligned | Grade present | Tahqiq only |', '| --- | ---: | ---: | ---: | ---: | ---: |']
    for b in report['books']:
        lines.append(f"| {b['collection']} | {b['total_hadiths']} | {b['matn_coverage_pct']:.2f}% | {b['sharh_coverage_pct']:.2f}% | {b['grade_coverage_pct']:.2f}% | {b['tahqiq_only']} |")
    for b in report['books']:
        lines += ['', f"## {b['collection']}", '', f"Matn {b['matn_identity']['book_id']}: {b['matn_units']} parsed units. Sharh {b['sharh_identity']['book_id']}: {b['sharh_units']} parsed units. Excluded index pages: {b['excluded_index_pages']}.", '', 'Methods: ' + ', '.join(f'{k}={v}' for k, v in sorted(b['methods'].items())), '', 'Low-confidence samples:']
        for s in b['low_confidence_samples']:
            lines.append(f"- Row {s['output_row_index']}, hadith {s['number']}: {s['score']:.4f}, {s['sharh_location']}.")
        if not b['low_confidence_samples']:
            lines.append('- None in [0.45, 0.55).')
    lines += ['', '## Provenance and review', '', 'The JSON report records source cache hashes/revision, per-book identities, parameters, corpus/grade counts and sample texts. Per-row JSONL records exact source page spans, both alignment decisions, inherited donors and appended tahqiq. Parser reports preserve ambiguous page footnotes instead of asserting a hadith-level attribution.', '', 'FTS indexes Arabic-normalized copies, while external-content retrieval returns original strings. This is an immutable research export: rebuild after changes; do not modify its content table independently. No application database migration or UI integration is performed.', '']
    lines += ['Al-Muntaqa links use page-row lemma fragments; full multi-page commentary boundaries remain unverified. Low Sharh coverage and tahqiq-only rows are reported separately. Source numbering gaps and ambiguous repeated references are not filled with invented text. See the source investigation documentation and any separately saved verification_report.json for the actual integrity and numbering checks. This export is not certified as exhaustive or scholarly-correct.', '']
    markdown = '\n'.join(lines)
    (root / 'corpus_9books_audit.md').write_text(markdown, encoding='utf-8')
    return markdown
