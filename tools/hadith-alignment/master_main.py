"""Build the isolated 34-column Itqan/Shamela research corpus."""
import argparse
from datetime import datetime, timezone
import gc
import json
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
from uuid import uuid4

import pyarrow as pa
import pyarrow.parquet as pq

from main import HERE, WORKSPACE, revision
from src.isnad_parser import IsnadParser
from src.itqan_crosscheck import corroboration_candidates
from src.itqan_schema import MASTER_COLUMNS
from src.itqan_sources import source_manifest
from src.master_exporter import import_rijal, open_master_database, write_master_book
from src.master_pages import prepare_pages
from src.master_processor import process_master_book
from src.master_registry import CORRECTIONS, MASTER_REGISTRY
from src.quran_bridge import QuranBridge
from src.rijal_matcher import RijalMatcher
from src.shamela_loader import sha256


def write_provenance_audit(root, report):
    (root / 'provenance_audit.json').write_text(json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2), encoding='utf-8')
    lines = ['# Provenance and coverage — 34-column Itqan/Shamela corpus', '', 'This is a derived computational research index. Narrator matches, roots, calibration and text-based corroboration are candidates, not scholarly authentication, exegesis or hadith grades. Unresolved identities remain unresolved. Original source texts are not normalized in place.', '', f"Grade policy: **{report['grade_policy']}**. Profile rows imported: **{report['rijal_profiles']}**. Quran vocabulary: **{report['quran_root_count']}**, profile **hafs-kufi**.", '', '## Verified registry corrections', '']
    for c in CORRECTIONS:
        lines.append(f"- {c['field']}: {c['requested']} → {c['verified']}. {c['reason']}.")
    lines += ['', 'The registry has 18 roles and 16 distinct books; Ahmad/Darimi commentary roles use their category-6 edition notes.', '', '| Book | Records | Matn linked | Commentary present | Itqan text cross-check | Parsed nodes | Profile-linked nodes | Root-linked rows |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
    for book in report['books']:
        c = book['counts']
        lines.append(f"| {book['book']} | {book['records']} | {c.get('matn_aligned',0)} | {c.get('rows_with_commentary',0)} | {c.get('itqan_text_crosschecked',0)} | {c.get('chain_nodes',0)} | {c.get('resolved_narrator_nodes',0)} | {c.get('rows_with_roots',0)} |")
    lines += ['', '## Method and limitations', '', '- Original six-book LK cells are preserved under the preserve policy. Derived grade proposals and their text-verified Itqan identities are in per-row provenance; no grade is borrowed solely by matching a number from another edition.', '- Short anchored commentary windows can lose coverage when editions drift or headings change. No unrelated/global fallback is silently used.', '- Compound and split references, source numbering gaps and ambiguous page-note ownership are retained for review. Narrative recovery and scholarly alignment accuracy are not certified.', '- Chain calibration uses the requested computational tier weights, path minimums and maximum across parallel paths. Ungraded defaults are 0.50, not evidence of reliability. Unresolved nodes are explicit; a score is not a scholarly hadith ruling.', '- Teacher/student and generation cues are heuristic disambiguation evidence. Profile judgments are copied/classified from the source; ambiguity is never settled by choosing the best grade.', '- Root extraction reuses precomputed Itqan morphology and Wensinck forms with conservative fallback. No fresh CAMeL model is run. Canonical output roots belong to the selected read-only Quran vocabulary; upstream aliases are not used to rewrite Quran data.', '- Verse links indicate shared roots in the Hafs/Kufi profile. They are not Tafsir, proof-texting, theological equivalence or cross-profile Warsh links.', '- Cross-book corroboration candidates use bounded, recomputed Matn cosine similarity. Upstream thematic connection scores are not rescaled into probabilities or labeled verified Shawahid.', '- Full source hashes/revisions, registry checks, parser audits and per-row provenance are available in this generation. Deterministic ordering is used; generation timestamps are intentionally run-specific.', '', '## Verification', '', 'See verification_report.json after running verify_master_outputs.py. This report does not claim a successful verification that has not run.', '']
    diagnostics = root / 'parser-audits' / 'MuwattaMalik.json'
    if diagnostics.exists():
        zurqani = json.loads(diagnostics.read_text(encoding='utf-8')).get('commentary', {})
        if 'zurqani_separator_units' in zurqani:
            lines += ['## Zurqani structural review', '',
                      f"Observed separator units: **{zurqani['zurqani_separator_units']}**; dual-number anchors: **{zurqani['zurqani_dual_number_units']}**; maximum unit: **{zurqani['max_unit_chars']} characters / {zurqani['max_source_rows_per_unit']} source rows**.", '',
                      f"**{zurqani['prefix_boundary_needs_review']} quote-prefix boundaries require review**. Separators bound commentary candidates; they do not establish scholarly alignment accuracy. Volume-sized candidates above 250,000 characters are rejected.", '']
    if report.get('recovery'):
        lines += ['## Generation recovery', '',
                  'Muwatta was recomputed after repairing the Zurqani adapter. Eight completed book enrichments were retained, with cross-book candidates reused only after checking unchanged ordered references and Matn inputs. Full independent verification is recorded separately in verification_report.json; this is not a fresh uninterrupted nine-book real CLI run.', '']
    (root / 'PROVENANCE_AUDIT.md').write_text('\n'.join(lines), encoding='utf-8')


def run_master(args):
    books = list(MASTER_REGISTRY) if args.books == ['all'] else args.books
    if not books or len(set(books)) != len(books) or any(b not in MASTER_REGISTRY for b in books):
        raise ValueError('Choose all or distinct registered collection keys')
    output = args.output_dir.resolve()
    input_paths = [args.lk_dir.resolve(), args.itqan_dir.resolve(), args.cache_dir.resolve(), *[p.resolve() for p in args.page_sources]]
    if any(output == p or output.is_relative_to(p) or p.is_relative_to(output) for p in input_paths):
        raise ValueError('Output must not overlap any input/cache path')
    pages = prepare_pages(args.page_sources, args.cache_dir, books)
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.master-build-', dir=output.parent))
    db = None
    try:
        db = open_master_database(staging / 'sunnah_kutub_tisah_itqan.sqlite')
        print('Importing verified Rijal profile shards...', flush=True)
        profiles = import_rijal(db, args.itqan_dir)
        print(f'Rijal profiles: {profiles}', flush=True)
        matcher, parser = RijalMatcher(args.itqan_dir), IsnadParser(args.itqan_dir)
        bridge = QuranBridge(args.itqan_dir, args.quran_roots)
        roots = sorted(bridge.vocabulary)
        report = {'generated_at': datetime.now(timezone.utc).isoformat(), 'schema': MASTER_COLUMNS, 'grade_policy': args.grade_policy, 'registry_corrections': CORRECTIONS, 'page_cache': pages, 'itqan_revision': revision(args.itqan_dir), 'itqan_sources': source_manifest(args.itqan_dir), 'rijal_profiles': profiles, 'quran_root_count': len(roots), 'quran_roots': roots, 'quran_vocabulary_source': bridge.vocabulary_source, 'quran_vocabulary_sha256': sha256(args.quran_roots) if args.quran_roots and args.quran_roots.exists() else None, 'profile': 'hafs-kufi', 'root_alias_count': len(bridge.aliases), 'kinship_map_counts': {k: len(v) for k, v in parser.maps.items()}, 'kunya_map_count': len(parser.kunya), 'books': []}
        (staging / 'parser-audits').mkdir()
        (staging / 'provenance').mkdir()
        light_rows, offsets = [], {}
        for book in books:
            print(f'{book}: source alignment and Itqan enrichment', flush=True)
            rows, ledger, summary, diagnostics = process_master_book(book, args.cache_dir, args.lk_dir, args.itqan_dir, matcher, parser, bridge, grade_policy=args.grade_policy, reuse_dir=args.reuse_shamela)
            offsets[book] = len(light_rows)
            light_rows.extend({'book_key': book, 'Hadith_number': r['Hadith_number'], 'Arabic_Matn': r['Arabic_Matn']} for r in rows)
            pq.write_table(pa.Table.from_pylist(rows), staging / f'.{book}-stage.parquet', compression='zstd')
            with (staging / 'provenance' / f'{book}.jsonl').open('w', encoding='utf-8') as stream:
                for entry in ledger:
                    stream.write(json.dumps(entry, ensure_ascii=False, sort_keys=True) + '\n')
            (staging / 'parser-audits' / f'{book}.json').write_text(json.dumps(diagnostics, ensure_ascii=False), encoding='utf-8')
            report['books'].append(summary)
            print(f"{book}: {len(rows)} rows, {summary['counts'].get('resolved_narrator_nodes',0)} profile-linked nodes", flush=True)
            del rows, ledger, diagnostics
            gc.collect()
        matcher.resolve.cache_clear()
        bridge.word_root.cache_clear()
        del matcher, parser, bridge
        gc.collect()
        print('Computing bounded cross-book Matn candidates...', flush=True)
        links = corroboration_candidates(light_rows)
        report['corroboration_links'] = sum(len(v) for v in links)
        for book in books:
            rows = pq.read_table(staging / f'.{book}-stage.parquet').to_pylist()
            for i, row in enumerate(rows):
                row['Itqan_Corroborating_Hadiths_JSON'] = json.dumps(links[offsets[book]+i], ensure_ascii=False, sort_keys=True)
            with (staging / 'provenance' / f'{book}.jsonl').open(encoding='utf-8') as stream:
                ledger = [json.loads(line) for line in stream]
            write_master_book(staging, db, book, rows, ledger)
            (staging / f'.{book}-stage.parquet').unlink()
            del rows, ledger
            gc.collect()
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok' or db.execute('PRAGMA foreign_key_check').fetchall():
            raise RuntimeError('Database integrity/foreign key check failed')
        db.execute("INSERT INTO hadiths_fts(hadiths_fts) VALUES('integrity-check')")
        db.commit()
        db.close()
        db = None
        write_provenance_audit(staging, report)
        (staging / 'generation.json').write_text(json.dumps({'pipeline': 'baglib-itqan-master-v1', 'books': books}))
        if output.exists():
            marker = output / 'generation.json'
            if not marker.exists() or json.loads(marker.read_text()).get('pipeline') != 'baglib-itqan-master-v1':
                raise ValueError('Refusing to replace a non-master output directory')
            backup = output.with_name(output.name + '.previous-' + uuid4().hex)
            output.rename(backup)
            try:
                staging.rename(output)
            except BaseException:
                backup.rename(output)
                raise
        else:
            staging.rename(output)
        return report
    finally:
        RijalMatcher.resolve.cache_clear()
        QuranBridge.word_root.cache_clear()
        if db:
            db.close()
        if staging.exists():
            if staging.resolve().parent != output.parent.resolve() or not staging.name.startswith('.master-build-'):
                raise RuntimeError('Refusing unsafe staging cleanup')
            shutil.rmtree(staging)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--books', nargs='+', default=['all'])
    parser.add_argument('--lk-dir', type=Path, default=WORKSPACE / 'LK-Hadith-Corpus')
    parser.add_argument('--itqan-dir', type=Path, default=WORKSPACE / 'repos/Itqan')
    parser.add_argument('--page-sources', type=Path, nargs='+', default=[HERE / 'data/cache/shamela_18books.parquet', HERE / 'data/cache/master-discovery/shamela_partial.parquet'])
    parser.add_argument('--cache-dir', type=Path, default=HERE / 'data/cache')
    parser.add_argument('--output-dir', type=Path, default=HERE / 'data/output')
    parser.add_argument('--reuse-shamela', type=Path, default=HERE / 'output-shamela')
    parser.add_argument('--quran-roots', type=Path, default=WORKSPACE / '.baglib-data/qul-phase1/inspected/word-root.db')
    parser.add_argument('--grade-policy', choices=['preserve', 'fill'], default='preserve')
    args = parser.parse_args()
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    try:
        result = run_master(args)
        print(json.dumps({'books': len(result['books']), 'rows': sum(b['records'] for b in result['books']), 'rijal_profiles': result['rijal_profiles'], 'root_vocabulary': result['quran_root_count'], 'output': str(args.output_dir)}, indent=2))
    except (ValueError, OSError, RuntimeError, sqlite3.Error) as error:
        parser.exit(1, f'Master pipeline failed: {error}\n')


if __name__ == '__main__':
    main()
