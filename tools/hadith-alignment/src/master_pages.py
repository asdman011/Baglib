"""Reuse verified source extracts; sorted, hashed per-book page caches."""
import json
from pathlib import Path
from uuid import uuid4

import pyarrow as pa
import pyarrow.parquet as pq

from .master_registry import MASTER_REGISTRY
from .shamela_loader import read_book, sha256
from .shamela_parser import integer, volume_key
from .shamela_pipeline import validate_book
from .shamela_registry import PAGE_COLUMNS, REGISTRY


def prepare_pages(sources: list[Path], directory: Path, books: list[str]) -> dict:
    directory.mkdir(parents=True, exist_ok=True)
    manifest = {'source_files': [{'path': str(p.resolve()), 'sha256': sha256(p)} for p in sources], 'books': {}}
    identities = {identity for book in books for identity in (MASTER_REGISTRY[book].matn, MASTER_REGISTRY[book].commentary)}
    for identity in sorted(identities):
        page_map = {}
        for source in sources:
            for page in read_book(source, identity):
                serial = page['serial_number']
                if serial in page_map and page_map[serial] != page:
                    raise ValueError(f'Conflicting source rows for book {identity}, serial {serial}')
                page_map[serial] = page
        if not page_map:
            raise ValueError(f'Required verified book {identity} is missing; extract it with HF_TOKEN before building')
        pages = sorted(page_map.values(), key=lambda p: (volume_key(p['volume_number']), integer(p['page_number']), integer(p['serial_number'])))
        roles = []
        for book in books:
            pair = MASTER_REGISTRY[book]
            if pair.matn == identity:
                roles.append(validate_book(pages, identity, '6', REGISTRY[book].matn_title_key))
            if pair.commentary == identity:
                roles.append(validate_book(pages, identity, '6' if pair.mode == 'inline' else '7', pair.title_key))
        path = directory / f'shamela_book_{identity}.parquet'
        temp = directory / ('.book-' + uuid4().hex + '.parquet')
        pq.write_table(pa.Table.from_pylist(pages, schema=pa.schema([(c, pa.string()) for c in PAGE_COLUMNS])), temp, compression='zstd', row_group_size=256)
        temp.replace(path)
        manifest['books'][identity] = {'path': str(path.resolve()), 'sha256': sha256(path), 'rows': len(pages), 'roles': roles}
    (directory / 'master_pages.manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    return manifest
