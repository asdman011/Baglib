"""Fetch only the verified master registry. HF_TOKEN is environment-only."""
import argparse
from pathlib import Path

from src.master_registry import MASTER_REGISTRY
from src.shamela_loader import ingest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path, default=Path(__file__).resolve().parent / 'data/cache/primary-download')
    parser.add_argument('--revision', default='main')
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    identities = {identity for pair in MASTER_REGISTRY.values() for identity in (pair.matn, pair.commentary)}
    try:
        path, manifest = ingest(args.cache_dir, identities, refresh=args.refresh, revision=args.revision)
        print(f"Selected {sum(manifest['counts'].values())} rows / {len(identities)} books: {path}")
    except (ValueError, RuntimeError, OSError) as error:
        parser.exit(1, f'Cannot fetch primary pages: {error}\n')


if __name__ == '__main__':
    main()
