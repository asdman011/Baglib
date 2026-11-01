"""Download the pinned quranlab/hadith revision as immutable local files.

Plain HTTPS over `requests`: no dataset script runs, no credential is read and no
downloaded file is executed. Reruns verify what exists and resume what does not.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import sys
import time

import requests

REPO = 'quranlab/hadith'
REVISION = '9e5d61d8cff3c3b95745e11f9d0fe2efccb6126d'
HERE = Path(__file__).resolve().parent
DEFAULT_DIR = HERE / 'data/sources/quranlab-hadith'
API = 'https://huggingface.co/api/datasets'
RESOLVE = 'https://huggingface.co/datasets'
CHUNK = 1 << 20
PARQUET_MAGIC = b'PAR1'
LFS_POINTER = b'version https://git-lfs'


def fetch_tree(session, revision, timeout):
    entries, url = [], f'{API}/{REPO}/tree/{revision}?recursive=true'
    while url:
        response = session.get(url, timeout=timeout)
        if response.status_code in {401, 403}:
            raise PermissionError(f'{REPO} now refuses anonymous access ({response.status_code}); not bypassing it')
        response.raise_for_status()
        entries += response.json()
        url = response.links.get('next', {}).get('url')
    return [entry for entry in entries if entry['type'] == 'file']


def safe_target(root, relative):
    path = PurePosixPath(relative)
    if path.is_absolute() or '..' in path.parts or not path.parts:
        raise ValueError(f'Unsafe repository path: {relative}')
    return root.joinpath(*path.parts)


def expected_digest(entry):
    return entry['lfs']['oid'] if entry.get('lfs') else None


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        while block := stream.read(CHUNK):
            value.update(block)
    return value.hexdigest()


def validate_payload(path, entry):
    """A wrong file must fail here, not later as a confusing parse error."""
    size = path.stat().st_size
    if size != entry['size']:
        raise ValueError(f"{entry['path']}: size {size}, expected {entry['size']}")
    with path.open('rb') as stream:
        head = stream.read(512)
        if entry['path'].endswith('.parquet'):
            stream.seek(-4, os.SEEK_END)
            tail = stream.read(4)
            if head[:4] != PARQUET_MAGIC or tail != PARQUET_MAGIC:
                raise ValueError(f"{entry['path']}: not a Parquet payload")
    if head.startswith(LFS_POINTER):
        raise ValueError(f"{entry['path']}: Git LFS pointer, not content")
    if head.lstrip()[:15].lower().startswith((b'<!doctype html', b'<html')):
        raise ValueError(f"{entry['path']}: HTML response, not content")
    actual = digest(path)
    wanted = expected_digest(entry)
    if wanted and actual != wanted:
        raise ValueError(f"{entry['path']}: sha256 {actual}, expected {wanted}")
    return actual


def transfer(session, entry, root, revision, timeout, retries):
    target = safe_target(root, entry['path'])
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        try:
            return entry['path'], validate_payload(target, entry), 'verified-existing'
        except ValueError:
            target.unlink()
    part = target.with_name(target.name + '.part')
    url = f"{RESOLVE}/{REPO}/resolve/{revision}/{entry['path']}"
    for attempt in range(retries):
        try:
            offset = part.stat().st_size if part.exists() else 0
            if offset > entry['size']:
                part.unlink()
                offset = 0
            headers = {'Range': f'bytes={offset}-'} if offset else {}
            with session.get(url, headers=headers, stream=True, timeout=timeout) as response:
                if response.status_code in {401, 403}:
                    raise PermissionError(f"{entry['path']}: access refused ({response.status_code})")
                if offset and response.status_code == 200:
                    offset = 0
                response.raise_for_status()
                with part.open('ab' if offset else 'wb') as stream:
                    for block in response.iter_content(CHUNK):
                        stream.write(block)
            value = validate_payload(part, entry)
            os.replace(part, target)
            return entry['path'], value, 'downloaded'
        except (requests.RequestException, ValueError) as error:
            if isinstance(error, ValueError) and part.exists():
                part.unlink()
            if attempt + 1 == retries:
                raise RuntimeError(f"{entry['path']}: {error}") from error
            time.sleep(2 ** attempt)


def run(args):
    root = args.output_dir.resolve() / args.revision
    root.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.trust_env = False
    session.headers['User-Agent'] = 'baglib-hadith-alignment'
    info = session.get(f'{API}/{REPO}/revision/{args.revision}', timeout=args.timeout)
    info.raise_for_status()
    metadata = info.json()
    if metadata.get('gated') or metadata.get('private') or metadata.get('disabled'):
        raise PermissionError(f'{REPO} access changed; not bypassing it')
    if metadata['sha'] != args.revision:
        raise ValueError(f"Revision resolved to {metadata['sha']}")
    entries = fetch_tree(session, args.revision, args.timeout)
    results, failures = {}, []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(transfer, session, entry, root, args.revision, args.timeout, args.retries): entry for entry in entries}
        for done, future in enumerate(as_completed(futures), 1):
            try:
                path, value, state = future.result()
                results[path] = {'sha256': value, 'state': state}
            except (RuntimeError, PermissionError, ValueError) as error:
                failures.append(str(error))
            if done % 25 == 0:
                print(f'{done}/{len(entries)} files', flush=True)
    if failures:
        raise RuntimeError('; '.join(failures[:10]))
    manifest = {'schema_version': 1, 'dataset': REPO, 'revision': args.revision, 'last_modified': metadata.get('lastModified'), 'gated': metadata.get('gated'), 'license_tag': (metadata.get('cardData') or {}).get('license'), 'license_name': (metadata.get('cardData') or {}).get('license_name'), 'file_count': len(entries), 'total_bytes': sum(entry['size'] for entry in entries),
                'files': [{'path': entry['path'], 'bytes': entry['size'], 'sha256': results[entry['path']]['sha256'], 'git_oid': entry.get('oid'), 'lfs': bool(entry.get('lfs'))} for entry in sorted(entries, key=lambda item: item['path'])]}
    # The timestamp lives outside the manifest so a rerun leaves its bytes unchanged.
    (root / 'download-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True), encoding='utf-8')
    states = [value['state'] for value in results.values()]
    (root / 'download-run.json').write_text(json.dumps({'finished_at': datetime.now(timezone.utc).isoformat(), 'downloaded': states.count('downloaded'), 'verified_existing': states.count('verified-existing')}, indent=2), encoding='utf-8')
    return {'files': len(entries), 'bytes': manifest['total_bytes'], 'downloaded': states.count('downloaded'), 'verified_existing': states.count('verified-existing'), 'root': str(root)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision', default=REVISION)
    parser.add_argument('--output-dir', type=Path, default=DEFAULT_DIR)
    parser.add_argument('--workers', type=int, default=4, choices=range(1, 9))
    parser.add_argument('--retries', type=int, default=5)
    parser.add_argument('--timeout', type=int, default=60)
    args = parser.parse_args()
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    try:
        print(json.dumps(run(args), indent=2))
    except (OSError, ValueError, RuntimeError, requests.RequestException) as error:
        parser.exit(1, f'Download failed: {error}\n')


if __name__ == '__main__':
    main()
