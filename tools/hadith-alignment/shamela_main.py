"""Construct a nine-book research corpus from revision-pinned Shamela pages."""
import argparse
from datetime import datetime, timezone
import importlib.metadata
import json
from pathlib import Path
import shutil
import sys
import tempfile
from uuid import uuid4

from main import HERE, WORKSPACE, fraction
from src.indexer import export_corpus_book, open_database, search_database
from src.shamela_loader import ingest
from src.shamela_pipeline import process_book, write_report
from src.shamela_registry import REGISTRY, target_ids


def run_shamela(args) -> str:
    books = list(REGISTRY) if args.books == ['all'] else args.books
    if not books or len(set(books)) != len(books) or any(b not in REGISTRY for b in books):
        raise ValueError(f'Choose all or distinct collections from {list(REGISTRY)}')
    output = args.output_dir.resolve()
    inputs = [args.lk_dir.resolve(), args.cache_dir.resolve()]
    if args.shamela_parquet:
        inputs.append(args.shamela_parquet.resolve())
    if any(output == source or output.is_relative_to(source) or source.is_relative_to(output) for source in inputs):
        raise ValueError('Output and input/cache paths must be separate and non-nested')
    cache, manifest = ingest(args.cache_dir, target_ids(books), local=args.shamela_parquet, refresh=args.refresh_cache, revision=args.revision)
    if args.ingest_only:
        return json.dumps({'cache': str(cache), 'counts': manifest['counts'], 'revision': manifest['revision']}, indent=2)
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.shamela-build-', dir=output.parent))
    db = None
    try:
        db = open_database(staging / 'sunnah_9books_shamela_corpus.db')
        report = {'generated_at': datetime.now(timezone.utc).isoformat(), 'source': manifest, 'parameters': {'min_score': args.min_score, 'window_pct': args.window_pct, 'minimum_half_window': 350, 'fuzzy_batch_size': 128, 'tfidf': 'equal-weight normalized word/character 1–2 grams'}, 'versions': {p: importlib.metadata.version(p) for p in ['pyarrow', 'scikit-learn', 'numpy']}, 'books': []}
        (staging / 'parser-audits').mkdir()
        for book in books:
            print(f'{book}: parsing and aligning Matn/Sharh', flush=True)
            records, ledger, summary, details = process_book(book, cache, args.lk_dir, args.min_score, args.window_pct)
            export_corpus_book(staging, db, book, records, ledger)
            report['books'].append(summary)
            (staging / 'parser-audits' / f'{book}.json').write_text(json.dumps(details, ensure_ascii=False, indent=2), encoding='utf-8')
            print(f"{book}: {len(records)} rows; Matn {summary['matn_coverage_pct']:.2f}%, Sharh {summary['sharh_coverage_pct']:.2f}%", flush=True)
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('SQLite integrity failed')
        db.execute("INSERT INTO hadiths_fts(hadiths_fts) VALUES ('integrity-check')")
        db.commit()
        db.close()
        db = None
        markdown = write_report(staging, report)
        (staging / 'generation.json').write_text(json.dumps({'pipeline': 'baglib-shamela-v1', 'books': books}), encoding='utf-8')
        if output.exists():
            marker = output / 'generation.json'
            if not marker.is_file() or json.loads(marker.read_text())['pipeline'] != 'baglib-shamela-v1':
                raise ValueError('Output exists and is not a recognized Shamela generation')
            backup = output.with_name(output.name + '.previous-' + uuid4().hex)
            output.rename(backup)
            try:
                staging.rename(output)
            except BaseException:
                backup.rename(output)
                raise
        else:
            staging.rename(output)
        return markdown
    finally:
        if db:
            db.close()
        if staging.exists():
            if staging.resolve().parent != output.parent.resolve() or not staging.name.startswith('.shamela-build-'):
                raise RuntimeError('Refusing unsafe staging cleanup')
            shutil.rmtree(staging)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lk-dir', type=Path, default=WORKSPACE / 'LK-Hadith-Corpus')
    parser.add_argument('--shamela-parquet', type=Path, help='Local page Parquet; no network needed')
    parser.add_argument('--cache-dir', type=Path, default=HERE / 'data' / 'cache')
    parser.add_argument('--revision', default='main', help='HF revision, resolved and pinned to a commit')
    parser.add_argument('--refresh-cache', action='store_true')
    parser.add_argument('--ingest-only', action='store_true')
    parser.add_argument('--output-dir', type=Path, default=HERE / 'output-shamela')
    parser.add_argument('--books', nargs='+', default=['all'])
    parser.add_argument('--min-score', type=fraction, default=.45)
    parser.add_argument('--window-pct', type=fraction, default=.08)
    parser.add_argument('--search', help='Search an existing output database with normalized Arabic')
    args = parser.parse_args()
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    try:
        if args.search:
            print(json.dumps(search_database(args.output_dir / 'sunnah_9books_shamela_corpus.db', args.search), ensure_ascii=False, indent=2))
        else:
            print(run_shamela(args))
    except (ValueError, OSError, RuntimeError) as error:
        parser.exit(1, f'Shamela pipeline failed: {error}\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
