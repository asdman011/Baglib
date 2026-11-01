"""Comparison and source audit reports. Reads inputs and the merged database only."""
from collections import Counter, defaultdict
import csv
import json
from pathlib import Path
import re
import sqlite3

import pyarrow.parquet as pq

from .quranlab_build import REPORT_DIR, write_csv
from .quranlab_match import match_tokens
from .quranlab_source import COLLECTIONS, PARQUET, config_names, load_configs, load_manifest, read_rows, split_config

OHD_FOLDERS = {'ahmad': 'Musnad_Ahmad_Ibn-Hanbal', 'darimi': 'Sunan_Al-Darimi', 'malik': 'Maliks_Muwataa'}
LK_ARABIC_TO_FAMILY = {'صحيح': 'sahih', 'حسن': 'hasan', 'ضعيف': 'daif', 'حسن صحيح': 'hasan_sahih'}


def schema_audit(root):
    groups = defaultdict(list)
    empties = {}
    for config in config_names(root):
        file = pq.ParquetFile(Path(root) / config / PARQUET)
        groups[' | '.join(f'{field.name}:{field.type}' for field in file.schema_arrow)].append(config)
        rows = read_rows(root, config)
        nulls = Counter()
        for row in rows:
            for key, value in row.items():
                if value is None or value == '' or value == []:
                    nulls[key] += 1
        keys = [row.get('hadith_key') for row in rows if 'hadith_key' in row]
        numbers = [str(row['hadith_number']) for row in rows if row.get('hadith_number') is not None]
        empties[config] = {'rows': len(rows), 'null_or_empty': dict(sorted(nulls.items())), 'duplicate_keys': len(keys) - len(set(keys)), 'non_integer_numbers': sum(not value.isdigit() for value in numbers), 'suffix_examples': [value for value in numbers if not value.isdigit()][:5]}
    return {'schemas': [{'fields': key, 'configs': value, 'count': len(value)} for key, value in sorted(groups.items())], 'configs': empties}


def license_audit(root):
    configs = load_configs(root)
    classes = defaultdict(list)
    for name, row in sorted(configs.items()):
        classes[(row['license'], row['commercial_ok'])].append(name)
    return {'per_row_license_columns_in_parquet': [config for config in config_names(root) if {'license', 'attribution'} & set(pq.ParquetFile(Path(root) / config / PARQUET).schema_arrow.names)],
            'classes': [{'license': key[0], 'commercial_ok': key[1], 'configs': len(value), 'examples': value[:4]} for key, value in sorted(classes.items(), key=lambda item: -len(item[1]))]}


def ohd_ancestry(root, ohd_dir):
    """Exact text comparison, for the claim that Ahmad and Darimi come from Open-Hadith-Data."""
    report = {}
    for collection, folder in OHD_FOLDERS.items():
        base = Path(ohd_dir) / folder
        if not base.exists():
            report[collection] = {'state': 'OHD folder missing'}
            continue
        keys = set()
        for path in base.rglob('*.csv'):
            with path.open(encoding='utf-8-sig', newline='') as stream:
                for row in csv.reader(stream):
                    for value in row[1:3]:
                        tokens = ' '.join(match_tokens(value))
                        if len(tokens) > 40:
                            keys.add(tokens)
        rows = read_rows(root, f'{collection}-ar', ['text'])
        same = sum(' '.join(match_tokens(row['text'])) in keys for row in rows)
        report[collection] = {'source_rows': len(rows), 'normalized_text_found_in_ohd': same, 'share': round(same / len(rows), 4)}
    return report


def build_report(db_path, source_root, ohd_dir, output_dir):
    db = sqlite3.connect(f'file:{Path(db_path).resolve().as_posix()}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    rows = lambda sql, *args: [dict(row) for row in db.execute(sql, args)]
    manifest = load_manifest(source_root)
    configs = config_names(source_root)
    languages = sorted({split_config(name)[1] for name in configs if name not in ('index', 'collections')})
    index = read_rows(source_root, 'index', ['hadith_key', 'collection', 'has_grade'])
    ar_keys = sum(len(read_rows(source_root, name, ['hadith_key'])) for name in configs if name.endswith('-ar'))
    collections = {}
    for collection, book in COLLECTIONS.items():
        decisions = {row['decision']: row['n'] for row in rows('SELECT decision,COUNT(*) n FROM hadith_crosswalk WHERE collection=? GROUP BY 1', collection)}
        relations = {row['relation']: row['n'] for row in rows("SELECT relation,COUNT(*) n FROM hadith_crosswalk WHERE collection=? AND decision='verified_match' GROUP BY 1", collection)}
        verified = sum(relations.values())
        agree = db.execute("SELECT COUNT(*) FROM hadith_crosswalk WHERE collection=? AND decision='verified_match' AND number_agrees=1", (collection,)).fetchone()[0]
        corpus = db.execute('SELECT COUNT(*) FROM hadiths WHERE book_key=?', (book,)).fetchone()[0]
        linked = db.execute("SELECT COUNT(DISTINCT hadith_id) FROM hadith_crosswalk WHERE collection=? AND hadith_id IS NOT NULL", (collection,)).fetchone()[0]
        similarity = db.execute('SELECT COUNT(*),AVG(english_similarity),SUM(english_similarity<.35) FROM hadith_crosswalk WHERE collection=? AND english_similarity IS NOT NULL', (collection,)).fetchone()
        judgments = {row['grader_raw']: row['n'] for row in rows("SELECT grader_raw,COUNT(*) n FROM grading_judgments WHERE source_key LIKE ? AND hadith_id IS NOT NULL AND origin='quranlab_fawazahmed0' GROUP BY 1", f'{collection}:%')}
        collections[collection] = {'book': book, 'corpus_rows': corpus, 'corpus_rows_linked': linked, 'corpus_rows_unlinked': corpus - linked, 'decisions': decisions, 'verified_relations': relations, 'verified_number_agreement': round(agree / verified, 4) if verified else None, 'english_pairs': similarity[0], 'english_mean_similarity': round(similarity[1], 4) if similarity[1] else None, 'english_low_similarity_pairs': similarity[2] or 0, 'linked_judgments_by_grader': judgments}
    lk_agreement = {}
    pairs = db.execute("""SELECT h.book_key,q.grader_raw,b.grade_raw,q.family FROM grading_judgments q JOIN grading_judgments b ON b.hadith_id=q.hadith_id AND b.origin='base_lk_field' JOIN hadiths h ON h.id=q.hadith_id
      WHERE q.origin='quranlab_fawazahmed0' AND q.hadith_id IS NOT NULL AND q.scope='hadith'""").fetchall()
    grouped = defaultdict(list)
    for book, grader, raw, family in pairs:
        if raw in LK_ARABIC_TO_FAMILY and family in LK_ARABIC_TO_FAMILY.values():
            grouped[f'{book} / {grader}'].append(LK_ARABIC_TO_FAMILY[raw] == family)
    for name, values in sorted(grouped.items()):
        lk_agreement[name] = {'compared': len(values), 'same_label': sum(values), 'share': round(sum(values) / len(values), 4)}
    totals = {
        'verified_links': db.execute("SELECT COUNT(*) FROM hadith_crosswalk WHERE decision='verified_match'").fetchone()[0],
        'decisions': {row['decision']: row['n'] for row in rows('SELECT decision,COUNT(*) n FROM hadith_crosswalk GROUP BY 1')},
        'judgments': rows('SELECT origin,COUNT(*) total,SUM(hadith_id IS NOT NULL) linked,COUNT(DISTINCT hadith_id) rows_covered FROM grading_judgments GROUP BY 1'),
        'grader_localization': rows("SELECT grader_raw,grader_ar,grader_status,grader_role,COUNT(*) n FROM grading_judgments WHERE grader_raw IS NOT NULL GROUP BY 1,2,3,4"),
        'grade_localization': rows('SELECT origin,review_status,grade_ar_status,COUNT(*) n FROM grading_judgments GROUP BY 1,2,3'),
        'grade_terms': rows('SELECT review_status,COUNT(*) terms,SUM(occurrences) occurrences FROM grade_terms GROUP BY 1'),
        'disagreement': dict(db.execute('SELECT COUNT(*) rows_with_judgments,SUM(opposed) opposed,SUM(wording_differs) wording_differs FROM hadith_grading_summary').fetchone()),
        'hadeethenc': {row['decision']: row['n'] for row in rows("SELECT decision,COUNT(DISTINCT source_key) n FROM hadith_crosswalk WHERE collection='hadeethenc' GROUP BY 1")},
        'new_english_rows': db.execute('SELECT COUNT(*) FROM variant_translation_fts').fetchone()[0],
        'english_rows_by_book': rows('SELECT h.book_key,COUNT(*) n FROM variant_translation_fts v JOIN hadiths h ON h.id=v.rowid GROUP BY 1'),
        'stored_records': dict(db.execute('SELECT COUNT(*) total,SUM(text IS NOT NULL) with_text,COUNT(DISTINCT language) languages,COUNT(DISTINCT config) configs FROM quranlab_records').fetchone()),
    }
    report = {'dataset': manifest['dataset'], 'revision': manifest['revision'], 'files': manifest['file_count'], 'bytes': manifest['total_bytes'], 'configs': len(configs), 'languages': len(languages), 'language_codes': languages, 'index_rows': len(index), 'index_has_grade': sum(bool(row['has_grade']) for row in index), 'arabic_rows_all_configs': ar_keys, 'collections': collections, 'totals': totals, 'lk_grade_agreement_by_grader': lk_agreement, 'ohd_ancestry': ohd_ancestry(source_root, ohd_dir), 'schema_audit': schema_audit(source_root), 'license_audit': license_audit(source_root)}
    db.close()
    target = Path(output_dir) / REPORT_DIR
    target.mkdir(exist_ok=True)
    (target / 'comparison.json').write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True), encoding='utf-8')
    (target / 'COMPARISON.md').write_text(markdown(report), encoding='utf-8')
    return report


def markdown(report):
    lines = ['# QuranLab comparison with the BagLib Sunnah corpus', '', f"Dataset `{report['dataset']}` at `{report['revision']}`: {report['files']} files, {report['bytes']:,} bytes, {report['configs']} configs, {report['languages']} languages.", '', 'Scores measure text similarity. They are not probabilities or scholarly review.', '', '## Identity by collection', '', '| Collection | Corpus rows | Rows linked | Verified | Review | Conflict | Source only | Number agrees | English mean | Low English |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
    for name, item in report['collections'].items():
        decisions = item['decisions']
        lines.append(f"| {name} | {item['corpus_rows']} | {item['corpus_rows_linked']} | {decisions.get('verified_match', 0)} | {decisions.get('candidate_review', 0)} | {decisions.get('conflicting_identity', 0)} | {decisions.get('source_only', 0)} | {item['verified_number_agreement']} | {item['english_mean_similarity']} | {item['english_low_similarity_pairs']} |")
    lines += ['', '## Grading judgments', '', '| Origin | Total | Linked | Rows covered |', '| --- | ---: | ---: | ---: |']
    lines += [f"| {item['origin']} | {item['total']} | {item['linked']} | {item['rows_covered']} |" for item in report['totals']['judgments']]
    lines += ['', 'Each language config repeats the same `grades` array, so one judgment is stored once with the configs that repeat it.', '', '## LK label compared with each named grader', '', 'Agreement is a lineage hint only. It does not make a named scholar the source of an LK value.', '', '| Book / grader | Compared | Same label | Share |', '| --- | ---: | ---: | ---: |']
    lines += [f"| {name} | {item['compared']} | {item['same_label']} | {item['share']} |" for name, item in sorted(report['lk_grade_agreement_by_grader'].items())]
    lines += ['', '## Upstream ancestry', '', '```json', json.dumps(report['ohd_ancestry'], ensure_ascii=False, indent=2), '```', '', '## Terms by config', '']
    lines += [f"- {item['configs']} configs, commercial_ok={item['commercial_ok']}: {item['license']}" for item in report['license_audit']['classes']]
    return '\n'.join(lines) + '\n'
