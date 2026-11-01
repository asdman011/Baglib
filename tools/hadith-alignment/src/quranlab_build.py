"""Build a new merged Sunnah research database. Inputs are read-only.

The base file is copied, then only additive tables and columns are written to the
copy. Existing rows, IDs, junctions and the FTS table are never rewritten.
"""
from collections import Counter, defaultdict
from dataclasses import asdict
import csv
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
from uuid import uuid4

from .itqan_schema import COMMENTARY_COLUMNS, FLOAT_COLUMNS, INTEGER_COLUMNS, ITQAN_COLUMNS, MASTER_COLUMNS
from .loaders import LK_COLUMNS, chapter_number, fingerprint, key as folder_key
from .master_registry import MASTER_REGISTRY
from .normalizer import normalize_arabic
from .quranlab_grading import GLOSSARY_VERSION, GradeParser, compare_judgments, judgment_id, load_glossary, load_graders
from .quranlab_match import CROSSWALK_VERSION, THRESHOLDS, CorpusIndex, attributed_books, corpus_row, match_collection, match_report, match_tokens, ordered
from .quranlab_source import COLLECTIONS, DATASET, REVISION, SOURCE_ONLY_COLLECTIONS, config_names, load_collection, load_configs, load_manifest, read_rows, split_config

MERGED_NAME = 'sunnah_merged_quranlab_v1.sqlite'
REPORT_DIR = 'quranlab-reports'
MERGE_SCHEMA_VERSION = 1
PROVENANCE_SCHEMA_VERSION = 1
SHAMELA_DATASET = 'mhaamh19/shamela_books_text_full'
SHAMELA_REVISION = 'ca46969f02a2e310d50f486472e47504f1d49b89'
LK_DATASET = 'ShathaTm/LK-Hadith-Corpus'
ITQAN_DATASET = 'R3GENESI5/Itqan'
STORED_LANGUAGES = ('ar', 'en')
UPSTREAM = {'fawazahmed0/hadith-api': ['fawazahmed0/hadith-api (commit not pinned by QuranLab)'], 'mhashim6/Open-Hadith-Data': ['mhashim6/Open-Hadith-Data', 'ceefour/hadith-islamware'], 'HadeethEnc.com (IslamHouse / Saudi Ministry of Islamic Affairs)': ['HadeethEnc.com']}
ASSESSED_PART = {'one_to_one': 'whole_record', 'source_extends_corpus': 'source_record_longer_than_row', 'corpus_extends_source': 'opening_report_of_row', 'corpus_contains_report': 'report_inside_row', 'report_in_attributed_collection': 'cited_report_not_chain_specific'}
LK_SOURCE_FOLDERS = {'Bukhari': 'Bukhari', 'Muslim': 'Muslim', 'AbuDaud': 'AbuDaud', 'Tirmidhi': 'Tirmizi', 'Nesai': 'Nesai', 'IbnMajah': 'IbnMaja'}
SUPPRESSED_BOOKS = {'Bukhari', 'Muslim'}
MISSING_GRADE = {'', 'nan', 'null', 'none'}
ADDED_COLUMNS = ('source_datasets_json', 'field_provenance_json', 'grading_judgments_json')
# Separate books after the last base row: base IDs and row offsets cannot move.
WHOLE_BOOKS = (('Nawawi40', 'nawawi'), ('Qudsi40', 'qudsi'), ('Dehlawi40', 'dehlawi'), ('HadeethEnc', 'hadeethenc'))
GROUPED_BOOKS = (('SourceOnly', 'source_only', 'source_only'), ('ReviewQueue', 'candidate_review', 'review'))

SCHEMA = """
CREATE TABLE merge_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE source_registry(source_id TEXT PRIMARY KEY,kind TEXT NOT NULL,dataset TEXT,revision TEXT,path TEXT,sha256 TEXT,bytes INTEGER,license TEXT,commercial_ok TEXT,attribution TEXT,source_url TEXT,note TEXT);
CREATE TABLE quranlab_records(source_key TEXT NOT NULL,language TEXT NOT NULL,config TEXT NOT NULL,collection TEXT NOT NULL,urn INTEGER,seq INTEGER,hadith_number TEXT,number_sort INTEGER,book_number INTEGER,in_book_number INTEGER,sunnah_url TEXT,is_muallaq INTEGER,text TEXT,text_sha256 TEXT NOT NULL,text_chars INTEGER NOT NULL,title TEXT,intro TEXT,attribution_text TEXT,explanation TEXT,PRIMARY KEY(source_key,language));
CREATE INDEX idx_ql_records_config ON quranlab_records(config);
CREATE TABLE hadith_crosswalk(crosswalk_id INTEGER PRIMARY KEY,source_key TEXT NOT NULL,collection TEXT NOT NULL,book_key TEXT,hadith_id INTEGER REFERENCES hadiths(id),decision TEXT NOT NULL CHECK(decision IN ('verified_match','candidate_review','source_only','conflicting_identity')),relation TEXT NOT NULL,method TEXT NOT NULL,full_score REAL,isnad_score REAL,matn_score REAL,runner_up REAL,number_agrees INTEGER,tail_tokens INTEGER,candidates_json TEXT NOT NULL,reason TEXT,english_similarity REAL,crosswalk_version TEXT NOT NULL,CHECK((decision='verified_match')=(hadith_id IS NOT NULL)));
CREATE INDEX idx_crosswalk_hadith ON hadith_crosswalk(hadith_id);
CREATE INDEX idx_crosswalk_source ON hadith_crosswalk(source_key);
CREATE TABLE grading_judgments(judgment_id TEXT PRIMARY KEY,hadith_id INTEGER REFERENCES hadiths(id),source_key TEXT,origin TEXT NOT NULL,dataset TEXT NOT NULL,revision TEXT,config TEXT,field_path TEXT,upstream_lineage_json TEXT NOT NULL,grader_raw TEXT,grader_ar TEXT,grader_role TEXT NOT NULL,grader_status TEXT NOT NULL,grade_raw TEXT NOT NULL,grade_raw_alt TEXT,grade_ar TEXT,grade_ar_status TEXT NOT NULL,scope TEXT NOT NULL,family TEXT NOT NULL,citations_json TEXT NOT NULL,assessed_part TEXT,wording_similarity REAL,review_status TEXT NOT NULL,display_policy TEXT NOT NULL,note TEXT,glossary_version TEXT NOT NULL);
CREATE INDEX idx_judgments_hadith ON grading_judgments(hadith_id);
CREATE INDEX idx_judgments_source ON grading_judgments(source_key);
CREATE TABLE hadith_grading_summary(hadith_id INTEGER PRIMARY KEY REFERENCES hadiths(id),judgment_count INTEGER NOT NULL,named_count INTEGER NOT NULL,wording_differs INTEGER NOT NULL,opposed INTEGER NOT NULL,unresolved_count INTEGER NOT NULL,display_policy TEXT NOT NULL);
CREATE TABLE source_book_rows(hadith_id INTEGER PRIMARY KEY REFERENCES hadiths(id),source_key TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('collection','source_only','review')),book_key TEXT NOT NULL,source_collection TEXT NOT NULL,reason TEXT,candidates_json TEXT NOT NULL);
CREATE TABLE grade_terms(grade_raw TEXT PRIMARY KEY,grade_ar TEXT,scope TEXT NOT NULL,family TEXT NOT NULL,review_status TEXT NOT NULL,occurrences INTEGER NOT NULL,note TEXT);
CREATE TABLE grader_mappings(grader_raw TEXT PRIMARY KEY,grader_ar TEXT,role TEXT NOT NULL,status TEXT NOT NULL,evidence_json TEXT NOT NULL,caution TEXT);
CREATE VIRTUAL TABLE variant_translation_fts USING fts5(text,tokenize='unicode61');
"""


def value_hash(value):
    return hashlib.sha256(str(value).encode('utf-8')).hexdigest()[:16]


def text_hash(value):
    return hashlib.sha256((value or '').encode('utf-8')).hexdigest()


def dumps(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def has_value(value):
    return value is not None and value != ''


def grade_present(value):
    return str(value or '').strip().casefold() not in MISSING_GRADE


def verify_inputs(root):
    manifest = load_manifest(root)
    for entry in manifest['files']:
        path = Path(root) / entry['path']
        if fingerprint(path)['sha256'] != entry['sha256']:
            raise ValueError(f"Downloaded file changed: {entry['path']}")
    return manifest


def lk_rows_for(lk_dir, book):
    """Yield every LK row with its file and row number, for cell-level lineage."""
    folder = next((path for path in Path(lk_dir).iterdir() if path.is_dir() and folder_key(path.name) == folder_key(LK_SOURCE_FOLDERS[book])), None)
    if folder is None:
        raise ValueError(f'{book}: LK folder missing')
    files = {}
    rows = []
    for path in sorted((item for item in folder.iterdir() if item.is_file() and item.suffix.casefold() == '.csv'), key=chapter_number):
        relative = f'{folder.name}/{path.name}'
        files[relative] = fingerprint(path)
        with path.open(encoding='utf-8-sig', newline='') as stream:
            reader = csv.reader(stream, strict=True)
            header = next(reader)
            names = {folder_key(column): column for column in LK_COLUMNS}
            columns = [names[folder_key(column)] for column in header]
            for number, row in enumerate(reader, 1):
                rows.append((relative, number, dict(zip(columns, row))))
    return rows, files


def load_ledger(path):
    entries = []
    if not path.exists():
        return entries
    with path.open(encoding='utf-8') as stream:
        for line in stream:
            entry = json.loads(line)
            entries.append({'number': entry.get('hadith_number'), 'matn': (entry.get('matn') or {}).get('start'), 'commentary': (entry.get('commentary') or {}).get('start'), 'mode': entry.get('commentary_mode'), 'derived': bool(entry.get('derived_grade')), 'match': (entry.get('matn_match') or {}).get('method')})
    return entries


def block(source, record, transformation, row, fields, **extra):
    hashes = {field: value_hash(row[field]) for field in fields if has_value(row[field])}
    return {'source': source, 'record': record, 'transformation': transformation, 'fields': hashes, **extra} if hashes else None


def unresolved_block(base_sha, identity, row, fields):
    """Ancestry could not be recovered: locate the value, never invent a source."""
    return block('base:db', f'hadiths.id={identity}', 'inherited_upstream_unresolved', row, fields, upstream='unresolved', base_sha256=base_sha)


def row_provenance(book, row, entry, lk_cell, base_sha, itqan_source, qul_source):
    pair = MASTER_REGISTRY[book]
    identity = row['id']
    groups, ledger_ref = [], None
    if entry and str(entry['number']) == str(row['Hadith_number']):
        ledger_ref = f"provenance/{book}.jsonl:{row['position'] + 1}"
    else:
        entry = None
    if lk_cell:
        groups.append(block(f'lk:{lk_cell[0]}', f'row:{lk_cell[1]}', 'verbatim', row, LK_COLUMNS))
    elif entry and entry['matn']:
        built = [column for column in LK_COLUMNS if column not in ('Arabic_Grade', 'English_Grade', 'Arabic_Comment')]
        groups.append(block(f'shamela:{pair.matn}', entry['matn'], 'shamela_span_reconstruction', row, built, ledger=ledger_ref))
        groups.append(block(f'shamela:{pair.matn}', entry['matn'], 'shamela_page_notes', row, ['Arabic_Comment'], ledger=ledger_ref))
        groups.append(block(f'shamela:{pair.matn}', entry['matn'], 'heuristic_grade_extraction', row, ['Arabic_Grade', 'English_Grade'], ledger=ledger_ref))
    else:
        groups.append(unresolved_block(base_sha, identity, row, LK_COLUMNS))
    shamela_fields = [column for column in COMMENTARY_COLUMNS if column not in ('Tafseel_Match_Score', 'Tafseel_Match_Method', 'Matn_Book_ID', 'Matn_Shamela_URL')]
    if entry and entry['commentary'] and has_value(row['Arabic_Tafseel']):
        groups.append(block(f'shamela:{pair.commentary}', entry['commentary'], 'shamela_span_reconstruction', row, shamela_fields, ledger=ledger_ref, mode=entry['mode']))
    else:
        groups.append(unresolved_block(base_sha, identity, row, shamela_fields))
    groups.append(block('registry:master', book, 'registry_constant', row, ['Matn_Book_ID', 'Matn_Shamela_URL']))
    groups.append(block('pipeline:master', book, 'computed_alignment_score', row, ['Tafseel_Match_Score', 'Tafseel_Match_Method'], ledger=ledger_ref))
    groups.append(block(itqan_source, book, 'computed_narrator_resolution', row, ['Itqan_Narrator_Chain_JSON', 'Itqan_Weakest_Narrator_Grade', 'Itqan_Chain_Calibration_Score'], ledger=ledger_ref))
    groups.append(block(qul_source, book, 'computed_lexical_root_links', row, ['Itqan_Quran_Root_Links_JSON', 'Itqan_Linked_Ayah_Keys_JSON'], ledger=ledger_ref))
    groups.append(block('pipeline:master', book, 'computed_matn_similarity', row, ['Itqan_Corroborating_Hadiths_JSON']))
    return [group for group in groups if group]


def judgment_payload(row):
    return {'judgment_id': row['judgment_id'], 'source': {'dataset': row['dataset'], 'revision': row['revision'], 'config': row['config'], 'record_key': row['source_key'], 'field_path': row['field_path']}, 'upstream_lineage': json.loads(row['upstream_lineage_json']), 'grade_raw': row['grade_raw'], 'grader_raw': row['grader_raw'], 'grade_ar': row['grade_ar'], 'grader_ar': row['grader_ar'], 'scope': row['scope'], 'review_status': row['review_status']}


JUDGMENT_COLUMNS = ('judgment_id', 'hadith_id', 'source_key', 'origin', 'dataset', 'revision', 'config', 'field_path', 'upstream_lineage_json', 'grader_raw', 'grader_ar', 'grader_role', 'grader_status', 'grade_raw', 'grade_raw_alt', 'grade_ar', 'grade_ar_status', 'scope', 'family', 'citations_json', 'assessed_part', 'wording_similarity', 'review_status', 'display_policy', 'note', 'glossary_version')


def grader_fields(raw, graders):
    mapping = graders.get(raw)
    if mapping is None:
        return {'grader_raw': raw, 'grader_ar': None, 'grader_role': 'unknown', 'grader_status': 'needs_review'}
    return {'grader_raw': raw, 'grader_ar': mapping.get('name_ar'), 'grader_role': mapping['role'], 'grader_status': mapping['status']}


def localized(parsed):
    if parsed.grade_ar is None:
        return 'unresolved'
    return 'source_arabic' if parsed.review_status == 'source_arabic' or (parsed.review_status == 'needs_review' and parsed.grade_raw and re.search(r'[\u0621-\u064A]', parsed.grade_raw)) else 'glossary'


def make_judgment(**fields):
    fields.setdefault('glossary_version', GLOSSARY_VERSION)
    fields['judgment_id'] = judgment_id(fields['origin'], fields['source_key'], fields['hadith_id'], fields['field_path'], fields['grader_raw'], fields['grade_raw'])
    return fields


def english_words(text):
    return re.findall(r"[a-z']+", (text or '').lower())


def english_similarity(left, right):
    if not left or not right:
        return None
    a, b = Counter(left), Counter(right)
    return round(2 * sum((a & b).values()) / (len(left) + len(right)), 4)


def load_all_grades(root):
    """Every language config repeats the array, so one judgment keeps all its copies."""
    grades, copies = {}, defaultdict(set)
    disagreements = 0
    for config in config_names(root):
        collection, language = split_config(config)
        if collection not in COLLECTIONS and collection not in ('nawawi', 'qudsi', 'dehlawi'):
            continue
        if collection in ('ahmad', 'darimi'):
            continue
        for row in read_rows(root, config, ['hadith_key', 'grades']):
            items = tuple((item['grader'], item['grade']) for item in row['grades'] or ())
            key = row['hadith_key']
            if not items:
                continue
            if key in grades and grades[key] != items:
                disagreements += 1
            grades.setdefault(key, items)
            copies[key].add(config)
    return grades, copies, disagreements


def insert_records(db, root, configs_meta, stats):
    """Arabic and English keep text. Other languages keep a locator and hash only."""
    language_rows = Counter()
    for config in config_names(root):
        if config in ('index', 'collections'):
            continue
        collection, language = split_config(config)
        keep = language in STORED_LANGUAGES
        rows = read_rows(root, config)
        batch = []
        for row in rows:
            text = row.get('text') or ''
            batch.append((row['hadith_key'], language, config, collection, row.get('urn'), row.get('seq'), row.get('hadith_number'), row.get('number_sort'), row.get('book_number'), row.get('in_book_number'), row.get('sunnah_url'), None if row.get('is_muallaq') is None else int(row['is_muallaq']), text if keep else None, text_hash(text), len(text), row.get('title') if keep else None, row.get('intro') if keep else None, row.get('attribution_text') if keep else None, row.get('explanation') if keep else None))
        db.executemany('INSERT INTO quranlab_records VALUES (' + ','.join('?' * 19) + ')', batch)
        language_rows[language] += len(rows)
    stats['language_rows'] = dict(sorted(language_rows.items()))


def insert_registry(db, root, manifest, configs_meta, cfg, base_sha, audit, lk_files):
    rows = [('base:db', 'base_database', 'BagLib sunnah_kutub_tisah_itqan', None, cfg['base'].name, base_sha, cfg['base'].stat().st_size, None, None, None, None, 'Immutable input to this merge')]
    for entry in manifest['files']:
        meta = configs_meta.get(entry['path'].split('/')[0], {}) if entry['path'].endswith('.parquet') else {}
        identity = f"ql:{entry['path'].split('/')[0]}" if entry['path'].endswith('.parquet') else f"ql-file:{entry['path']}"
        rows.append((identity, 'quranlab', DATASET, manifest['revision'], entry['path'], entry['sha256'], entry['bytes'], meta.get('license'), meta.get('commercial_ok'), meta.get('attribution'), meta.get('source_url'), meta.get('source')))
    for relative, info in sorted(lk_files.items()):
        rows.append((f'lk:{relative}', 'lk', LK_DATASET, 'c45fa64aa40bf1d4a34b9b35359640a583b02881', relative, info['sha256'], info['bytes'], 'no license file found in the archive', None, None, 'https://github.com/ShathaTm/LK-Hadith-Corpus', None))
    for book_id, info in sorted(audit['page_cache']['books'].items()):
        rows.append((f'shamela:{book_id}', 'shamela', SHAMELA_DATASET, SHAMELA_REVISION, f'shamela_book_{book_id}.parquet', info['sha256'], None, 'gated dataset; terms reviewed by the user at download', None, None, f'https://shamela.ws/book/{book_id}', '; '.join(info['roles'][0]['titles'])))
    rows.append(('itqan:repo', 'itqan', ITQAN_DATASET, audit['itqan_revision'], None, None, None, None, None, None, 'https://github.com/R3GENESI5/Itqan', f"{len(audit['itqan_sources'])} source files hashed in provenance_audit.json"))
    rows.append(('qul:word-root', 'quran_vocabulary', 'QUL word-root', None, None, audit.get('quran_vocabulary_sha256'), None, None, None, None, None, 'Lexical retrieval signal, not tafsir or authentication'))
    rows.append(('registry:master', 'pipeline', 'tools/hadith-alignment/src/master_registry.py', None, None, None, None, None, None, None, None, None))
    rows.append(('pipeline:quranlab', 'pipeline', 'tools/hadith-alignment/quranlab_merge.py', None, None, None, None, None, None, None, None, 'Placement of source records in their own books'))
    rows.append(('pipeline:master', 'pipeline', 'tools/hadith-alignment/master_main.py', None, None, None, None, None, None, None, None, 'Computed fields of the base generation'))
    db.executemany('INSERT INTO source_registry VALUES (' + ','.join('?' * 12) + ')', rows)


def add_source_book_row(db, identity, book, chapter, title, key, collection, kind, reason, candidates, judgments_by_hadith):
    records = {row['language']: row for row in db.execute("SELECT * FROM quranlab_records WHERE source_key=? AND language IN ('ar','en')", (key,))}
    arabic, english = records.get('ar'), records.get('en')
    main = arabic or english
    row = {column: None for column in MASTER_COLUMNS}
    number = main['hadith_number'] or key.rsplit(':', 1)[1]
    row.update({'id': identity, 'Chapter_Number': str(chapter), 'Chapter_Arabic': title['ar'], 'Chapter_English': title['en'], 'Section_Arabic': arabic['title'] if arabic and arabic['title'] else '', 'Section_English': english['title'] if english and english['title'] else '', 'Hadith_number': number, 'Arabic_Hadith': arabic['text'] if arabic else '', 'Arabic_Matn': arabic['text'] if arabic else '', 'English_Hadith': english['text'] if english else ''})
    columns = ['book_key', *MASTER_COLUMNS]
    db.execute(f'INSERT INTO hadiths(id,{",".join(chr(34) + column + chr(34) for column in columns)}) VALUES ({",".join("?" * (len(columns) + 1))})', [identity, book, *[row[column] for column in MASTER_COLUMNS]])
    db.execute('INSERT INTO hadiths_fts(rowid,book_key,Hadith_number,Chapter_Arabic,Section_Arabic,Arabic_Matn_Norm,Arabic_Tafseel_Norm,English_Hadith) VALUES (?,?,?,?,?,?,?,?)', (identity, book, number, normalize_arabic(title['ar']), normalize_arabic(row['Section_Arabic']), normalize_arabic(row['Arabic_Matn']), '', row['English_Hadith']))
    db.execute('INSERT INTO source_book_rows VALUES (?,?,?,?,?,?,?)', (identity, key, kind, book, collection, reason, candidates))
    groups = [block(f"ql:{main['config']}", key, 'verbatim', row, ['Hadith_number'])]
    if arabic:
        groups.append(block(f"ql:{arabic['config']}", key, 'verbatim', row, ['Arabic_Hadith', 'Arabic_Matn', 'Section_Arabic']))
    if english:
        groups.append(block(f"ql:{english['config']}", key, 'verbatim', row, ['English_Hadith', 'Section_English']))
    groups.append(block('ql:collections', collection, 'verbatim', row, ['Chapter_Arabic', 'Chapter_English']))
    groups.append(block('pipeline:quranlab', book, 'computed_book_placement', row, ['Chapter_Number']))
    provenance = {'schema_version': PROVENANCE_SCHEMA_VERSION, 'base': {'sha256': None, 'id': identity}, 'fields': [group for group in groups if group], 'missing': [column for column in MASTER_COLUMNS if not has_value(row[column])], 'added': []}
    db.execute('UPDATE hadiths SET source_datasets_json=?,field_provenance_json=? WHERE id=?', (dumps([DATASET]), dumps(provenance), identity))
    seen = set()
    for item in db.execute('SELECT * FROM grading_judgments WHERE source_key=? ORDER BY field_path,hadith_id IS NOT NULL', (key,)).fetchall():
        fields = dict(item)
        if (fields['field_path'], fields['grader_raw'], fields['grade_raw']) in seen:
            continue
        seen.add((fields['field_path'], fields['grader_raw'], fields['grade_raw']))
        fields = make_judgment(**{**fields, 'hadith_id': identity, 'assessed_part': 'whole_record', 'wording_similarity': 1., 'display_policy': 'hidden_placeholder' if fields['review_status'] == 'not_a_judgment' else 'details'})
        db.execute('INSERT INTO grading_judgments VALUES (' + ','.join('?' * len(JUDGMENT_COLUMNS)) + ')', [fields[column] for column in JUDGMENT_COLUMNS])
        judgments_by_hadith[identity].append(fields)


def add_source_books(db, root, judgments_by_hadith):
    """Each source record is its own row here; it never enriches another row."""
    names = {row['collection_id']: {'ar': row['name_ar'], 'en': row['name_en']} for row in read_rows(root, 'collections')}
    identity = db.execute('SELECT MAX(id) FROM hadiths').fetchone()[0]
    counts = Counter()
    for book, collection in WHOLE_BOOKS:
        keys = [row[0] for row in db.execute("SELECT source_key FROM quranlab_records WHERE collection=? AND language='ar'", (collection,))]
        for key in sorted(keys, key=lambda item: int(item.rsplit(':', 1)[1])):
            identity += 1
            add_source_book_row(db, identity, book, 1, names[collection], key, collection, 'collection', None, '[]', judgments_by_hadith)
            counts[book] += 1
    for book, decision, kind in GROUPED_BOOKS:
        for chapter, collection in enumerate(COLLECTIONS, 1):
            rows = db.execute('SELECT source_key,reason,candidates_json FROM hadith_crosswalk WHERE collection=? AND decision=? ORDER BY crosswalk_id', (collection, decision)).fetchall()
            for row in rows:
                identity += 1
                add_source_book_row(db, identity, book, chapter, names[collection], row['source_key'], collection, kind, row['reason'], row['candidates_json'], judgments_by_hadith)
                counts[book] += 1
    return dict(counts)


def run_merge(cfg, fail_after=None):
    output = Path(cfg['output_dir']).resolve()
    output.mkdir(parents=True, exist_ok=True)
    for stale in output.glob('.quranlab-build-*'):
        if stale.is_dir() and stale.parent == output:
            shutil.rmtree(stale)
    root = Path(cfg['source_root'])
    manifest = verify_inputs(root)
    base = Path(cfg['base'])
    base_sha = fingerprint(base)['sha256']
    audit = json.loads((Path(cfg['archive_output']) / 'provenance_audit.json').read_text(encoding='utf-8'))
    staging = output / f'.quranlab-build-{uuid4().hex}'
    staging.mkdir()
    db = None
    try:
        merged = staging / MERGED_NAME
        shutil.copyfile(base, merged)
        db = sqlite3.connect(merged)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA journal_mode=OFF')
        db.execute('PRAGMA synchronous=OFF')
        db.execute('PRAGMA foreign_keys=ON')
        db.executescript(SCHEMA)
        for column in ADDED_COLUMNS:
            db.execute(f'ALTER TABLE hadiths ADD COLUMN {column} TEXT')
        configs_meta = load_configs(root)
        stats = {'collections': {}, 'lk_cells_checked': 0, 'lk_cells_unchanged': 0, 'revision': manifest['revision'], 'base_sha256': base_sha}
        insert_records(db, root, configs_meta, stats)
        db.commit()
        grades, copies, stats['grade_arrays_differing_between_languages'] = load_all_grades(root)
        parser = GradeParser()
        graders = load_graders()
        term_counts = Counter()
        term_parsed = {}
        hadeethenc_ar = {row['hadith_key']: row for row in read_rows(root, 'hadeethenc-ar')}
        hadeethenc_en = {row['hadith_key']: row for row in read_rows(root, 'hadeethenc-en')}
        hadeethenc_links = defaultdict(list)
        hadeethenc_books = {key: attributed_books(row['attribution_text']) for key, row in hadeethenc_ar.items()}
        hadeethenc_tokens = {}
        for key, row in hadeethenc_ar.items():
            text, intro = row['text'] or '', row['intro'] or ''
            hadeethenc_tokens[key] = match_tokens(text[len(intro):] if intro and text.startswith(intro) else text)
        all_lk_files = {}
        review_rows, english_flags = [], []
        crosswalk_seq = 0
        judgments_by_hadith = defaultdict(list)
        translation_rows = defaultdict(list)
        collection_order = list(COLLECTIONS.items())
        for collection, book in collection_order:
            rows = [dict(row) for row in db.execute(f'SELECT id,{",".join(chr(34) + column + chr(34) for column in MASTER_COLUMNS)} FROM hadiths WHERE book_key=? ORDER BY id', (book,))]
            for position, row in enumerate(rows):
                row['position'] = position
            lk_lines = None
            if book in LK_SOURCE_FOLDERS:
                lk_lines, lk_files = lk_rows_for(cfg['lk_dir'], book)
                all_lk_files.update(lk_files)
                if len(lk_lines) != len(rows):
                    raise ValueError(f'{book}: LK row count differs from the base database')
            lk = book in LK_SOURCE_FOLDERS
            corpus = [corpus_row(row['id'], row['Hadith_number'], row['Arabic_Hadith'], row['Arabic_Isnad'], row['Arabic_Matn'], index, row['Arabic_Comment'] if lk and grade_present(row['Arabic_Comment']) else '') for index, row in enumerate(rows)]
            source = load_collection(root, collection, 'ar')
            decisions = match_collection(source, corpus)
            index = CorpusIndex(corpus)
            for key, books in hadeethenc_books.items():
                if book in books:
                    link = match_report(key, hadeethenc_tokens[key], book, index)
                    if link:
                        hadeethenc_links[key].append((book, link))
            del index, corpus
            by_id = {row['id']: row for row in rows}
            english = {record.key: record.text for record in load_collection(root, collection, 'en')} if (root / f'{collection}-en').exists() else {}
            spine = {record.key for record in source}
            counters = Counter()
            for record, decision in zip(source, decisions):
                crosswalk_seq += 1
                similarity = None
                row = by_id.get(decision.hadith_id)
                if row and record.key in english:
                    if grade_present(row['English_Hadith']):
                        similarity = english_similarity(english_words(english[record.key]), english_words(row['English_Hadith']))
                        if similarity is not None and similarity < .35 and decision.method.startswith('exact'):
                            english_flags.append({'hadith_id': row['id'], 'book': book, 'corpus_number': row['Hadith_number'], 'source_key': record.key, 'english_similarity': similarity, 'corpus_english': row['English_Hadith'][:160], 'quranlab_english': english[record.key][:160]})
                    else:
                        translation_rows[row['id']].append(english[record.key])
                db.execute('INSERT INTO hadith_crosswalk VALUES (' + ','.join('?' * 18) + ')', (crosswalk_seq, record.key, collection, book, decision.hadith_id, decision.decision, decision.relation, decision.method, round(decision.full, 4), round(decision.isnad, 4), round(decision.matn, 4), round(decision.runner_up, 4), int(decision.number_agrees), decision.tail_tokens, dumps(decision.candidates), decision.reason, similarity, CROSSWALK_VERSION))
                counters[decision.decision] += 1
                counters[f'relation:{decision.relation}'] += 1
                counters[f'method:{decision.method}'] += 1
                counters['verified_number_agrees'] += bool(decision.hadith_id and decision.number_agrees)
                if decision.decision != 'verified_match':
                    review_rows.append({'source_key': record.key, 'book': book, 'decision': decision.decision, 'relation': decision.relation, 'method': decision.method, 'full_score': round(decision.full, 4), 'candidates': dumps(decision.candidates), 'reason': decision.reason})
                for position, (grader, grade) in enumerate(grades.get(record.key, ())):
                    parsed = parser.parse(grade)
                    term_counts[grade] += 1
                    term_parsed[grade] = parsed
                    fields = make_judgment(hadith_id=decision.hadith_id, source_key=record.key, origin='quranlab_fawazahmed0', dataset=DATASET, revision=manifest['revision'], config=f'{collection}-ar', field_path=f'grades[{position}]', upstream_lineage_json=dumps({'upstream': UPSTREAM['fawazahmed0/hadith-api'], 'repeated_in_configs': sorted(copies[record.key])}), **grader_fields(grader, graders), grade_raw=grade, grade_raw_alt=None, grade_ar=parsed.grade_ar, grade_ar_status=localized(parsed), scope=parsed.scope, family=parsed.family, citations_json=dumps([json.loads(item) for item in parsed.references]), assessed_part=ASSESSED_PART.get(decision.relation) if decision.hadith_id else None, wording_similarity=round(decision.full, 4) if decision.hadith_id else None, review_status=parsed.review_status, display_policy='hidden_placeholder' if parsed.review_status == 'not_a_judgment' else 'details' if decision.hadith_id else 'staged', note=None)
                    db.execute('INSERT INTO grading_judgments VALUES (' + ','.join('?' * len(JUDGMENT_COLUMNS)) + ')', [fields[column] for column in JUDGMENT_COLUMNS])
                    if decision.hadith_id:
                        judgments_by_hadith[decision.hadith_id].append(fields)
            for key in sorted(set(english) - spine, key=lambda item: (len(item), item)):
                crosswalk_seq += 1
                db.execute('INSERT INTO hadith_crosswalk VALUES (' + ','.join('?' * 18) + ')', (crosswalk_seq, key, collection, book, None, 'source_only', 'none', 'none', None, None, None, None, 0, 0, '[]', 'translation-without-arabic-spine', None, CROSSWALK_VERSION))
                counters['source_only'] += 1
                review_rows.append({'source_key': key, 'book': book, 'decision': 'source_only', 'relation': 'none', 'method': 'none', 'full_score': '', 'candidates': '[]', 'reason': 'translation-without-arabic-spine'})
                for position, (grader, grade) in enumerate(grades.get(key, ())):
                    parsed = parser.parse(grade)
                    term_counts[grade] += 1
                    term_parsed[grade] = parsed
                    fields = make_judgment(hadith_id=None, source_key=key, origin='quranlab_fawazahmed0', dataset=DATASET, revision=manifest['revision'], config=f'{collection}-en', field_path=f'grades[{position}]', upstream_lineage_json=dumps({'upstream': UPSTREAM['fawazahmed0/hadith-api'], 'repeated_in_configs': sorted(copies[key])}), **grader_fields(grader, graders), grade_raw=grade, grade_raw_alt=None, grade_ar=parsed.grade_ar, grade_ar_status=localized(parsed), scope=parsed.scope, family=parsed.family, citations_json=dumps([json.loads(item) for item in parsed.references]), assessed_part=None, wording_similarity=None, review_status=parsed.review_status, display_policy='staged', note=None)
                    db.execute('INSERT INTO grading_judgments VALUES (' + ','.join('?' * len(JUDGMENT_COLUMNS)) + ')', [fields[column] for column in JUDGMENT_COLUMNS])
            ledger = load_ledger(Path(cfg['archive_output']) / 'provenance' / f'{book}.jsonl')
            for position, row in enumerate(rows):
                lk_cell = None
                if lk_lines:
                    relative, number, cells = lk_lines[position]
                    for column in LK_COLUMNS:
                        stats['lk_cells_checked'] += 1
                        if cells[column] != row[column]:
                            raise ValueError(f"{book} id {row['id']}: {column} differs from the LK source")
                        stats['lk_cells_unchanged'] += 1
                    lk_cell = (relative, number)
                groups = row_provenance(book, row, ledger[position] if position < len(ledger) else None, lk_cell, base_sha, 'itqan:repo', 'qul:word-root')
                if grade_present(row['Arabic_Grade']) or grade_present(row['English_Grade']):
                    raw = row['Arabic_Grade'] if grade_present(row['Arabic_Grade']) else row['English_Grade']
                    parsed = parser.parse(raw)
                    term_counts[raw] += 1
                    term_parsed[raw] = parsed
                    fields = make_judgment(hadith_id=row['id'], source_key=None, origin='base_lk_field' if lk else 'base_shamela_note', dataset=LK_DATASET if lk else SHAMELA_DATASET, revision=None if not lk else 'c45fa64aa40bf1d4a34b9b35359640a583b02881', config=None, field_path='Arabic_Grade' if grade_present(row['Arabic_Grade']) else 'English_Grade', upstream_lineage_json=dumps({'upstream': ['unresolved'], 'same_label_as_named_grader': sorted({item['grader_raw'] for item in judgments_by_hadith[row['id']] if item['grader_raw'] and item['scope'] == parsed.scope and item['family'] == parsed.family})}), grader_raw=None, grader_ar=None, grader_role='unattributed' if lk else 'edition_note', grader_status='unattributed', grade_raw=raw, grade_raw_alt=row['English_Grade'] if grade_present(row['English_Grade']) else None, grade_ar=parsed.grade_ar, grade_ar_status=localized(parsed), scope=parsed.scope, family=parsed.family, citations_json='[]', assessed_part='whole_record', wording_similarity=None, review_status=parsed.review_status, display_policy='suppressed_collection' if book in SUPPRESSED_BOOKS else 'details', note=None)
                    db.execute('INSERT INTO grading_judgments VALUES (' + ','.join('?' * len(JUDGMENT_COLUMNS)) + ')', [fields[column] for column in JUDGMENT_COLUMNS])
                    judgments_by_hadith[row['id']].append(fields)
                missing = [column for column in MASTER_COLUMNS if not has_value(row[column])]
                row_links = db.execute("SELECT c.source_key,c.collection,c.relation,c.method,c.full_score,r.language,r.config,r.urn,r.text_sha256 FROM hadith_crosswalk c JOIN quranlab_records r ON r.source_key=c.source_key AND r.language IN ('ar','en') WHERE c.hadith_id=? ORDER BY c.crosswalk_id,r.language", (row['id'],)).fetchall()
                added = [{'kind': 'alternate_arabic' if link['language'] == 'ar' else 'english_variant', 'source': f"ql:{link['config']}", 'record': link['source_key'], 'field': 'text', 'sha256': link['text_sha256'], 'transformation': 'verbatim', 'match': {'relation': link['relation'], 'method': link['method'], 'score': link['full_score'], 'crosswalk': CROSSWALK_VERSION}, 'review_state': 'unreviewed'} for link in row_links]
                datasets = sorted({LK_DATASET} if lk else {SHAMELA_DATASET}) + [SHAMELA_DATASET if lk else None, ITQAN_DATASET, 'QUL word-root'] + ([DATASET] if added else [])
                provenance = {'schema_version': PROVENANCE_SCHEMA_VERSION, 'base': {'sha256': base_sha, 'id': row['id']}, 'fields': groups, 'missing': missing, 'added': added}
                db.execute('UPDATE hadiths SET source_datasets_json=?,field_provenance_json=? WHERE id=?', (dumps(sorted({item for item in datasets if item})), dumps(provenance), row['id']))
            stats['collections'][collection] = {'book': book, 'source_arabic': len(source), 'source_english': len(english), 'corpus_rows': len(rows), 'corpus_rows_linked': len({decision.hadith_id for decision in decisions if decision.hadith_id}), 'counts': dict(sorted(counters.items()))}
            db.commit()
            del rows, source, decisions, by_id, english, ledger, lk_lines
        if fail_after == 'collections':
            raise RuntimeError('Injected failure after collections')
        for key, row in hadeethenc_ar.items():
            links = hadeethenc_links.get(key, [])
            verified = [link for _, link in links if link.hadith_id]
            parsed = parser.parse(row['grade'])
            term_counts[row['grade']] += 1
            term_parsed[row['grade']] = parsed
            translated = hadeethenc_en.get(key, {}).get('grade')
            graderentry = grader_fields(row['grader'], graders)
            if not links:
                crosswalk_seq += 1
                db.execute('INSERT INTO hadith_crosswalk VALUES (' + ','.join('?' * 18) + ')', (crosswalk_seq, key, 'hadeethenc', None, None, 'source_only', 'none', 'none', None, None, None, None, 0, 0, '[]', 'not found in the collections it names' if hadeethenc_books[key] else 'names no collection in this corpus', None, CROSSWALK_VERSION))
            for book, link in links:
                crosswalk_seq += 1
                db.execute('INSERT INTO hadith_crosswalk VALUES (' + ','.join('?' * 18) + ')', (crosswalk_seq, key, 'hadeethenc', book, link.hadith_id, link.decision, link.relation, link.method, round(link.full, 4), None, None, None, 0, 0, dumps(link.candidates), link.reason, None, CROSSWALK_VERSION))
                if link.decision != 'verified_match':
                    review_rows.append({'source_key': key, 'book': book, 'decision': link.decision, 'relation': link.relation, 'method': link.method, 'full_score': round(link.full, 4), 'candidates': dumps(link.candidates), 'reason': link.reason})
            lineage = dumps({'upstream': UPSTREAM['HadeethEnc.com (IslamHouse / Saudi Ministry of Islamic Affairs)'], 'grade_source': row['grade_source']})
            for target in verified or [None]:
                fields = make_judgment(hadith_id=target.hadith_id if target else None, source_key=key, origin='quranlab_hadeethenc', dataset=DATASET, revision=manifest['revision'], config='hadeethenc-ar', field_path='grade', upstream_lineage_json=lineage, **graderentry, grade_raw=row['grade'], grade_raw_alt=translated, grade_ar=parsed.grade_ar, grade_ar_status=localized(parsed), scope=parsed.scope, family=parsed.family, citations_json='[]', assessed_part=ASSESSED_PART['report_in_attributed_collection'] if target else None, wording_similarity=round(target.full, 4) if target else None, review_status=parsed.review_status, display_policy='details' if target else 'staged', note=row['attribution_text'])
                db.execute('INSERT INTO grading_judgments VALUES (' + ','.join('?' * len(JUDGMENT_COLUMNS)) + ')', [fields[column] for column in JUDGMENT_COLUMNS])
                if target:
                    judgments_by_hadith[target.hadith_id].append(fields)
                    current = json.loads(db.execute('SELECT field_provenance_json FROM hadiths WHERE id=?', (target.hadith_id,)).fetchone()[0])
                    for language, field in (('ar', 'text'), ('ar', 'explanation'), ('en', 'text'), ('en', 'explanation')):
                        data = (hadeethenc_ar if language == 'ar' else hadeethenc_en).get(key)
                        if data and data.get(field):
                            current['added'].append({'kind': 'report_text' if field == 'text' else 'explanation', 'source': f'ql:hadeethenc-{language}', 'record': key, 'field': field, 'sha256': text_hash(data[field]), 'transformation': 'verbatim', 'match': {'relation': target.relation, 'method': target.method, 'score': round(target.full, 4), 'crosswalk': CROSSWALK_VERSION}, 'review_state': 'unreviewed'})
                    datasets = sorted(set(json.loads(db.execute('SELECT source_datasets_json FROM hadiths WHERE id=?', (target.hadith_id,)).fetchone()[0])) | {DATASET})
                    db.execute('UPDATE hadiths SET field_provenance_json=?,source_datasets_json=? WHERE id=?', (dumps(current), dumps(datasets), target.hadith_id))
        for collection in ('nawawi', 'qudsi', 'dehlawi'):
            for record in load_collection(root, collection, 'ar'):
                crosswalk_seq += 1
                db.execute('INSERT INTO hadith_crosswalk VALUES (' + ','.join('?' * 18) + ')', (crosswalk_seq, record.key, collection, None, None, 'source_only', 'none', 'none', None, None, None, None, 0, 0, '[]', 'collection has no reader catalog entry', None, CROSSWALK_VERSION))
        stats['source_books'] = add_source_books(db, root, judgments_by_hadith)
        for hadith_id, items in judgments_by_hadith.items():
            named = [item for item in items if item['grader_raw']]
            shown = [item for item in items if item['display_policy'] == 'details']
            wording, opposed = compare_judgments(named)
            policy = 'details' if shown else 'suppressed_collection'
            db.execute('INSERT INTO hadith_grading_summary VALUES (?,?,?,?,?,?,?)', (hadith_id, len(shown), len(named), int(wording), int(opposed), sum(item['review_status'] == 'needs_review' for item in shown), policy))
            db.execute('UPDATE hadiths SET grading_judgments_json=? WHERE id=?', (dumps({'schema_version': 1, 'grading_judgments': [judgment_payload(item) for item in items]}), hadith_id))
        for hadith_id, texts in sorted(translation_rows.items()):
            db.execute('INSERT INTO variant_translation_fts(rowid,text) VALUES (?,?)', (hadith_id, '\n\n'.join(texts)))
        for grade, count in sorted(term_counts.items()):
            parsed = term_parsed[grade]
            db.execute('INSERT INTO grade_terms VALUES (?,?,?,?,?,?,?)', (grade, parsed.grade_ar, parsed.scope, parsed.family, parsed.review_status, count, parsed.note or None))
        for raw, mapping in sorted(graders.items()):
            db.execute('INSERT INTO grader_mappings VALUES (?,?,?,?,?,?)', (raw, mapping.get('name_ar'), mapping['role'], mapping['status'], dumps(mapping.get('evidence', [])), mapping.get('caution')))
        insert_registry(db, root, manifest, configs_meta, cfg, base_sha, audit, all_lk_files)
        metadata = {'schema_kind': 'baglib-sunnah-merged', 'merge_schema_version': MERGE_SCHEMA_VERSION, 'provenance_schema_version': PROVENANCE_SCHEMA_VERSION, 'crosswalk_version': CROSSWALK_VERSION, 'glossary_version': GLOSSARY_VERSION, 'quranlab_dataset': DATASET, 'quranlab_revision': manifest['revision'], 'base_sha256': base_sha, 'thresholds': dumps(asdict(THRESHOLDS))}
        db.executemany('INSERT INTO merge_metadata VALUES (?,?)', [(key, str(value)) for key, value in sorted(metadata.items())])
        db.commit()
        if fail_after == 'database':
            raise RuntimeError('Injected failure after database')
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok' or db.execute('PRAGMA foreign_key_check').fetchall():
            raise RuntimeError('Merged database failed its integrity or foreign key check')
        db.execute("INSERT INTO hadiths_fts(hadiths_fts) VALUES('integrity-check')")
        db.commit()
        db.close()
        db = None
        reports = staging / REPORT_DIR
        reports.mkdir()
        (reports / 'merge_stats.json').write_text(json.dumps(stats, ensure_ascii=False, indent=2, sort_keys=True), encoding='utf-8')
        write_csv(reports / 'review_queue.csv', review_rows, ['source_key', 'book', 'decision', 'relation', 'method', 'full_score', 'candidates', 'reason'])
        write_csv(reports / 'english_misalignment_candidates.csv', english_flags, ['hadith_id', 'book', 'corpus_number', 'source_key', 'english_similarity', 'corpus_english', 'quranlab_english'])
        target_reports = output / REPORT_DIR
        if target_reports.exists():
            shutil.rmtree(target_reports)
        reports.rename(target_reports)
        # Last step, so a reader only ever sees a complete database.
        os.replace(merged, output / MERGED_NAME)
        return stats
    finally:
        if db:
            db.close()
        if staging.exists():
            shutil.rmtree(staging)


def write_csv(path, rows, columns):
    with path.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
