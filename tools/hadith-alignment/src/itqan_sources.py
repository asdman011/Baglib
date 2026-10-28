"""Read upstream data without importing or executing upstream builders."""
import ast
import json
from pathlib import Path

from .shamela_loader import sha256


def load_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def load_map(root: Path, name: str) -> dict:
    return {k: v for k, v in load_json(root / 'src' / f'{name}.json').items() if not k.startswith('_')}


def manual_aliases(root: Path) -> dict:
    # Extract literal assignments only. No upstream module-level I/O is executed.
    values = {}
    tree = ast.parse((root / 'src/match_narrator_grades.py').read_text(encoding='utf-8'))
    for node in tree.body:
        if not isinstance(node, ast.Assign) or len(node.targets) != 1 or not isinstance(node.targets[0], ast.Name):
            continue
        name = node.targets[0].id
        try:
            if isinstance(node.value, ast.Dict):
                result = {}
                for k, v in zip(node.value.keys, node.value.values):
                    result[ast.literal_eval(k)] = values[v.id] if isinstance(v, ast.Name) else ast.literal_eval(v)
                values[name] = result
            else:
                values[name] = ast.literal_eval(node.value)
        except (ValueError, KeyError, TypeError):
            continue
    return values.get('MANUAL_ALIASES', {})


def source_manifest(root: Path) -> list[dict]:
    paths = list((root / 'src').glob('isnad_*_map.json')) + [root / 'src/root_alias_map.json', root / 'src/match_narrator_grades.py']
    paths += list((root / 'src').glob('grades_*.json'))
    paths += list((root / 'app/data/rijal').glob('profiles_*.json'))
    paths += [root / 'app/data' / n for n in ['word_defs_v2.json', 'wensinck.json', 'hadith_connections.json', 'quran_hadith_bridge.json']]
    paths += [root / 'quran/data/roots_index.json', root / 'app/data/rijal/manifest.json']
    for book in ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah', 'malik', 'ahmed', 'darimi']:
        paths += list((root / 'app/data/sunni' / book).glob('*.json'))
    return [{'path': str(p.resolve()), 'sha256': sha256(p), 'bytes': p.stat().st_size} for p in sorted(set(paths)) if p.exists()]


def iter_profiles(root: Path):
    folder = root / 'app/data/rijal'
    manifest = load_json(folder / 'manifest.json')
    total = 0
    seen = set()
    for entry in manifest['files']:
        if entry.get('type') != 'profiles':
            continue
        path = folder / entry['name']
        if path.resolve().parent != folder.resolve():
            raise ValueError('Unsafe profile manifest path')
        profiles = load_json(path)
        if len(profiles) != entry['count']:
            raise ValueError(f'Profile count mismatch: {path}')
        for identity, profile in profiles.items():
            if identity in seen:
                raise ValueError('Duplicate Rijal profile identity')
            seen.add(identity)
            total += 1
            yield str(identity), profile
    if total != manifest['total_profiles']:
        raise ValueError('Rijal total differs from source manifest')
