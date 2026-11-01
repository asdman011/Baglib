"""Build the merged QuranLab Sunnah research database from verified local inputs."""
import argparse
import json
from pathlib import Path
import sqlite3
import sys

from src.quranlab_build import run_merge
from src.quranlab_source import REVISION, source_root

HERE = Path(__file__).resolve().parent
ARCHIVE = HERE.parents[3] / '_archive_datasets'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', type=Path, default=HERE / 'data/output/sunnah_kutub_tisah_itqan.sqlite')
    parser.add_argument('--source-dir', type=Path, default=HERE / 'data/sources/quranlab-hadith')
    parser.add_argument('--revision', default=REVISION)
    parser.add_argument('--lk-dir', type=Path, default=ARCHIVE / 'LK-Hadith-Corpus')
    parser.add_argument('--archive-output', type=Path, default=ARCHIVE / 'tools/hadith-alignment/data/output')
    parser.add_argument('--output-dir', type=Path, default=HERE / 'data/output')
    args = parser.parse_args()
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    try:
        stats = run_merge({'base': args.base, 'source_root': source_root(args.source_dir, args.revision), 'lk_dir': args.lk_dir, 'archive_output': args.archive_output, 'output_dir': args.output_dir})
        print(json.dumps({'lk_cells_unchanged': stats['lk_cells_unchanged'], 'collections': {name: value['counts'] for name, value in stats['collections'].items()}}, ensure_ascii=False, indent=2))
    except (ValueError, OSError, RuntimeError, sqlite3.Error) as error:
        parser.exit(1, f'Merge failed: {error}\n')


if __name__ == '__main__':
    main()
