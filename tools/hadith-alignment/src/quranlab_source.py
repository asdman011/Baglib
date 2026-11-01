"""Read the pinned quranlab/hadith Parquet files. Files stay immutable inputs."""
import csv
from dataclasses import dataclass
import json
from pathlib import Path

import pyarrow.parquet as pq

REVISION = '9e5d61d8cff3c3b95745e11f9d0fe2efccb6126d'
DATASET = 'quranlab/hadith'
PARQUET = 'train-00000-of-00001.parquet'
# QuranLab id -> BagLib `book_key`. Explicit: aliases are never guessed.
COLLECTIONS = {'bukhari': 'Bukhari', 'muslim': 'Muslim', 'abudawud': 'AbuDaud', 'tirmidhi': 'Tirmidhi', 'nasai': 'Nesai', 'ibnmajah': 'IbnMajah', 'malik': 'MuwattaMalik', 'ahmad': 'MusnadAhmad', 'darimi': 'SunanDarimi'}
SOURCE_ONLY_COLLECTIONS = ('nawawi', 'qudsi', 'dehlawi', 'hadeethenc')


@dataclass(frozen=True)
class QuranLabRecord:
    key: str
    collection: str
    number: str
    language: str
    config: str
    text: str
    urn: int | None = None
    seq: int | None = None
    book_number: int | None = None
    in_book_number: int | None = None
    sunnah_url: str | None = None
    grades: tuple = ()


def source_root(base, revision=REVISION):
    return Path(base) / revision


def load_manifest(root):
    manifest = json.loads((Path(root) / 'download-manifest.json').read_text(encoding='utf-8'))
    if manifest['dataset'] != DATASET:
        raise ValueError('Manifest describes another dataset')
    return manifest


def load_configs(root):
    with (Path(root) / 'metadata/configs.csv').open(encoding='utf-8', newline='') as stream:
        return {row['config_name']: row for row in csv.DictReader(stream)}


def config_names(root):
    return sorted(path.parent.name for path in Path(root).glob(f'*/{PARQUET}'))


def split_config(name):
    collection, _, language = name.rpartition('-')
    return collection, language


def read_rows(root, config, columns=None):
    return pq.read_table(Path(root) / config / PARQUET, columns=columns).to_pylist()


def load_collection(root, collection, language):
    config = f'{collection}-{language}'
    records = []
    for row in read_rows(root, config):
        grades = tuple((grade['grader'], grade['grade']) for grade in row.get('grades') or ())
        records.append(QuranLabRecord(row['hadith_key'], collection, row['hadith_number'], language, config, row['text'] or '', row.get('urn'), row.get('seq'), row.get('book_number'), row.get('in_book_number'), row.get('sunnah_url'), grades))
    return records


def load_hadeethenc(root, language):
    return read_rows(root, f'hadeethenc-{language}')
