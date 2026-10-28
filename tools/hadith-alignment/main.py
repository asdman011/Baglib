"""Run all six collections: python tools/hadith-alignment/main.py."""
import argparse
from datetime import datetime, timezone
import importlib.metadata
import math
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile
from uuid import uuid4

from src.aligner import align
from src.exporter import audit_book, export_book, initialize_database, write_audit
from src.loaders import BOOKS, load_lk, load_ohd, resolve_sources

HERE = Path(__file__).resolve().parent
WORKSPACE = HERE.parent.parent


def fraction(value: str) -> float:
    result = float(value)
    if not math.isfinite(result) or not 0 <= result <= 1:
        raise argparse.ArgumentTypeError('Expected a finite fraction in [0, 1]')
    return result


def revision(path: Path) -> str | None:
    if not (path / '.git').exists():
        return None
    result = subprocess.run(['git', '-C', str(path), 'rev-parse', 'HEAD'], capture_output=True, text=True, check=False)
    return result.stdout.strip() if result.returncode == 0 else None


def run(args: argparse.Namespace) -> str:
    books = list(BOOKS) if args.books == ['all'] else args.books
    if not books or len(set(books)) != len(books) or any(b not in BOOKS for b in books):
        raise ValueError(f'Choose all or distinct collections from {list(BOOKS)}')
    # Preflight every requested collection; never silently skip a missing book.
    sources = {book: resolve_sources(args.lk_dir, args.ohd_dir, book) for book in books}
    output = args.output_dir.resolve()
    for source in (args.lk_dir.resolve(), args.ohd_dir.resolve()):
        if output == source or output.is_relative_to(source) or source.is_relative_to(output):
            raise ValueError('Output and input directories must be separate, non-nested paths')
    output.parent.mkdir(parents=True, exist_ok=True)
    # Build a complete new generation first. A failure keeps previous outputs intact.
    staging = Path(tempfile.mkdtemp(prefix='.hadith-build-', dir=output.parent))
    db = None
    try:
        db = initialize_database(staging / 'sunnah_lk_tafseel.db')
        report = {'generated_at': datetime.now(timezone.utc).isoformat(), 'parameters': {'min_score': args.min_score, 'window_pct': args.window_pct, 'minimum_half_window': 350, 'batch_size': 500}, 'versions': {'python': platform.python_version(), **{p: importlib.metadata.version(p) for p in ('numpy', 'scipy', 'scikit-learn')}}, 'source_revisions': {'lk': revision(args.lk_dir), 'ohd': revision(args.ohd_dir)}, 'books': []}
        for book, (lk_path, ohd_path) in sources.items():
            rows, lk_manifest = load_lk(lk_path)
            ohd, ohd_manifest = load_ohd(ohd_path)
            print(f'{book}: aligning {len(rows):,} LK rows against {len(ohd):,} OHD rows', flush=True)
            matches = align(rows, ohd, args.min_score, args.window_pct)
            export_book(staging, db, book, rows, matches)
            report['books'].append(audit_book(book, rows, ohd, matches, {'lk_files': lk_manifest, 'ohd_file': ohd_manifest}))
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('SQLite integrity check failed')
        db.close()
        db = None
        markdown = write_audit(staging, report)
        # Only replace a prior pipeline-owned output generation.
        if output.exists():
            expected = {'csv', 'sunnah_lk_tafseel.db', 'alignment_audit_report.json', 'alignment_audit_report.md'}
            if {p.name for p in output.iterdir()} != expected:
                raise ValueError(f'Refusing to replace non-pipeline output directory: {output}')
            backup = output.with_name(output.name + '.previous-' + uuid4().hex)
            output.rename(backup)
            try:
                staging.rename(output)
            except BaseException:
                backup.rename(output)
                raise
            # Keep previous generation for explicit user review; no recursive deletion.
        else:
            staging.rename(output)
        return markdown
    finally:
        if db is not None:
            db.close()
        if staging.exists():
            if staging.resolve().parent != output.parent.resolve() or not staging.name.startswith('.hadith-build-'):
                raise RuntimeError('Refusing cleanup outside the task staging directory')
            shutil.rmtree(staging)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lk-dir', type=Path, default=WORKSPACE / 'LK-Hadith-Corpus')
    parser.add_argument('--ohd-dir', type=Path, default=WORKSPACE / 'Open-Hadith-Data')
    parser.add_argument('--output-dir', type=Path, default=HERE / 'output')
    parser.add_argument('--books', nargs='+', default=['all'])
    parser.add_argument('--min-score', type=fraction, default=.45)
    parser.add_argument('--window-pct', type=fraction, default=.08)
    args = parser.parse_args()
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    try:
        print(run(args))
    except (ValueError, OSError) as error:
        parser.exit(1, f'Alignment failed: {error}\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
