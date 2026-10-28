"""Bounded, predicate-filtered Parquet ingestion with a revision-pinned cache."""
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
from uuid import uuid4

import pyarrow as pa
import pyarrow.dataset as ds
import pyarrow.fs as pafs
import pyarrow.parquet as pq

from .shamela_registry import DATASET, PAGE_COLUMNS


def sha256(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def ingest(cache: Path, ids: set[str], local: Path | None = None, refresh: bool = False, revision: str = 'main') -> tuple[Path, dict]:
    cache.mkdir(parents=True, exist_ok=True)
    path, manifest_path = cache / 'shamela_18books.parquet', cache / 'shamela_18books.manifest.json'
    if path.exists() and manifest_path.exists() and not refresh:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        same_source = manifest.get('local_source') == (str(local.resolve()) if local else None)
        same_revision = local is not None or revision == 'main' or manifest.get('revision') == revision
        if same_source and same_revision and ids <= set(manifest['requested_ids']) and sha256(path) == manifest['cache_sha256']:
            if local is None or manifest.get('local_source_sha256') == sha256(local):
                return path, manifest
    if local:
        files = [str(local.resolve())]
        filesystem = pafs.LocalFileSystem()
        source = {'local_source': str(local.resolve()), 'local_source_sha256': sha256(local), 'revision': None}
    else:
        from huggingface_hub import HfApi, HfFileSystem
        token = os.environ.get('HF_TOKEN')
        api = HfApi(token=token or False)
        try:
            info = api.dataset_info(DATASET, revision=revision)
            # Discover actual files; old fixed shard offsets are not trusted.
            names = sorted(p for p in api.list_repo_files(DATASET, repo_type='dataset', revision=info.sha) if p.startswith('data/') and p.endswith('.parquet'))
            if not names:
                raise ValueError('Dataset exposes no data/*.parquet shards')
            fs = HfFileSystem(token=token or False, block_size=128 * 1024)
            filesystem = pafs.PyFileSystem(pafs.FSSpecHandler(fs))
            files = [f'datasets/{DATASET}@{info.sha}/{name}' for name in names]
            source = {'local_source': None, 'dataset': DATASET, 'revision': info.sha, 'shards_discovered': len(files)}
        except Exception:
            raise RuntimeError('Cannot access HF metadata. Configure HF_TOKEN locally and accept dataset access conditions, or supply --shamela-parquet.') from None
    temp = cache / ('.shamela-' + uuid4().hex + '.parquet')
    writer = None
    counts = Counter()
    observed = {}
    try:
        for index, name in enumerate(files):
            print(f'Shamela shard {index + 1}/{len(files)}: predicate scan', flush=True)
            try:
                fragment = ds.dataset([name], filesystem=filesystem, format='parquet')
                if not set(PAGE_COLUMNS) <= set(fragment.schema.names):
                    raise ValueError('Dataset does not contain the expected 11 page fields')
                condition = ds.field('book_id').isin(sorted(ids)) & ds.field('category_id').isin(['6', '7'])
                scanner = fragment.scanner(columns=PAGE_COLUMNS, filter=condition, batch_size=256, batch_readahead=1, fragment_readahead=1, use_threads=False)
                for batch in scanner.to_batches():
                    if not batch.num_rows:
                        continue
                    table = pa.Table.from_batches([batch]).cast(pa.schema([(c, pa.string()) for c in PAGE_COLUMNS]))
                    if writer is None:
                        writer = pq.ParquetWriter(temp, table.schema, compression='zstd')
                    writer.write_table(table, row_group_size=256)
                    for record in table.select(['book_id', 'book_title', 'category_id', 'category', 'edition', 'publisher']).to_pylist():
                        identity = record['book_id']
                        counts[identity] += 1
                        data = observed.setdefault(identity, {k: set() for k in record if k != 'book_id'})
                        for key, value in record.items():
                            if key != 'book_id':
                                data[key].add(value or '')
            except (ValueError, pa.ArrowInvalid):
                raise
            except Exception:
                raise RuntimeError(f'Cannot read Shamela shard {index + 1}. Check gated access/network; no cache was published.') from None
        if writer:
            writer.close()
            writer = None
        missing = ids - counts.keys()
        if missing:
            # Preserve a diagnostic, never publish incomplete content as a complete cache.
            diagnostic = {**source, 'requested_ids': sorted(ids), 'missing_ids': sorted(missing), 'counts': dict(counts), 'observed_books': {i: {k: sorted(v) for k, v in row.items()} for i, row in observed.items()}}
            (cache / 'shamela_ingestion_incomplete.json').write_text(json.dumps(diagnostic, ensure_ascii=False, indent=2), encoding='utf-8')
            if temp.exists():
                temp.replace(cache / 'shamela_partial.parquet')
            raise ValueError(f'Primary book IDs missing from dataset: {sorted(missing)}; see shamela_ingestion_incomplete.json. No substitute edition is selected automatically.')
        manifest = {**source, 'requested_ids': sorted(ids), 'counts': dict(counts), 'cache_sha256': sha256(temp), 'observed_books': {i: {k: sorted(v) for k, v in row.items()} for i, row in observed.items()}}
        temp.replace(path)
        manifest_temp = cache / ('.manifest-' + uuid4().hex + '.json')
        manifest_temp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        manifest_temp.replace(manifest_path)
        return path, manifest
    finally:
        if writer:
            writer.close()
        temp.unlink(missing_ok=True)


def read_book(path: Path, identity: str) -> list[dict[str, str]]:
    # Only one selected book at a time enters Python memory.
    scanner = ds.dataset(str(path), format='parquet').scanner(filter=ds.field('book_id') == identity, columns=PAGE_COLUMNS, batch_size=256, use_threads=False)
    return [{k: v or '' for k, v in row.items()} for batch in scanner.to_batches() for row in batch.to_pylist()]
