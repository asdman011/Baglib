"""Build one book's base/commentary/enrichment with per-row evidence."""
from collections import Counter
import json
from pathlib import Path

from .anchored_aligner import align_anchored
from .grade_extractor import extract_standardized_hadith_grade
from .isnad_matn_splitter import split_isnad_matn
from .itqan_crosscheck import ItqanCrosscheck, ITQAN_KEYS
from .itqan_schema import MASTER_COLUMNS, book_url
from .itqan_sources import load_json
from .loaders import load_lk, resolve_folder
from .master_registry import MASTER_REGISTRY
from .normalizer import present
from .rijal_matcher import calibrate_chain
from .shamela_aligner import UnitMatch, align_units
from .shamela_loader import read_book
from .shamela_parser import base_rows, hadith_and_notes, parse_units
from .shamela_pipeline import provenance
from .shamela_registry import REGISTRY
from .sharh_parser import parse_sharh


def reuse_matn(rows, units, book, directory):
    if not directory or not (directory / 'provenance' / f'{book}.jsonl').exists():
        return None
    entries = [json.loads(line) for line in (directory / 'provenance' / f'{book}.jsonl').read_text(encoding='utf-8').splitlines()]
    if len(entries) != len(rows):
        return None
    matches = []
    for row, entry in zip(rows, entries):
        if entry['hadith_number'] != row['Hadith_number']:
            return None
        data = entry['matn_match']
        index = data['index']
        if index >= 0 and (index >= len(units) or units[index].spans != entry['matn']['spans']):
            return None
        matches.append(UnitMatch(index, data['score'], data['method'], data.get('donor', -1)))
    return matches


def process_master_book(book, cache_dir, lk_dir, itqan_dir, matcher, parser, bridge, *, grade_policy='preserve', reuse_dir=None):
    pair = MASTER_REGISTRY[book]
    matn_pages = read_book(cache_dir / f'shamela_book_{pair.matn}.parquet', pair.matn)
    # Ahmad index-volume exclusion remains source-specific; supplied data has 1–45.
    if pair.matn == '25794':
        from .shamela_parser import volume_key
        matn_pages = [p for p in matn_pages if volume_key(p['volume_number'])[0] <= 45]
    units, matn_parser = parse_units(matn_pages)
    aliases = REGISTRY[book].lk_aliases
    if aliases:
        rows, lk_manifest = load_lk(resolve_folder(lk_dir, aliases))
        matches = reuse_matn(rows, units, book, reuse_dir)
        reused = matches is not None
        if matches is None:
            matches = align_units(rows, units)
    else:
        rows, _ = base_rows(units)
        lk_manifest, reused = [], False
        matches = [UnitMatch(i, 1., 'source_constructed') for i in range(len(rows))]
    if not rows or not units:
        raise ValueError(f'{book}: no base records parsed')
    if pair.mode == 'inline':
        sharh_units, sharh_parser, links = [], {}, []
    else:
        pages = read_book(cache_dir / f'shamela_book_{pair.commentary}.parquet', pair.commentary)
        sharh_units, sharh_parser = parse_sharh(pages)
        if not sharh_units:
            raise ValueError(f'{book}: no commentary units parsed')
        if any(len(unit.text) > 250000 for unit in sharh_units):
            raise ValueError(f'{book}: volume-sized commentary candidate exceeds 250,000 characters; review the source adapter before export')
        numbers = [units[m.index].number if m.index >= 0 else '' for m in matches]
        links = align_anchored(rows, sharh_units, numbers)
    crosscheck = ItqanCrosscheck(itqan_dir, book)
    grade_path = itqan_dir / 'src' / f'grades_{ITQAN_KEYS[book]}.json'
    grade_table = load_json(grade_path) if grade_path.exists() else {}
    records, ledger = [], []
    counters = Counter()
    methods, root_methods = Counter(), Counter()
    for i, (source, matn_match) in enumerate(zip(rows, matches)):
        row = dict(source)
        matn_unit = units[matn_match.index] if matn_match.index >= 0 else None
        commentary_unit = None
        if pair.mode == 'inline':
            text = hadith_and_notes(matn_unit)[1] if matn_unit else ''
            link = UnitMatch(matn_match.index, 1., 'shamela_inline_footnote') if present(text) else UnitMatch()
            commentary_unit = matn_unit if link.index >= 0 else None
        else:
            link = links[i]
            commentary_unit = sharh_units[link.index] if link.index >= 0 else None
            text = commentary_unit.text if commentary_unit else ''
        derived_grade = extract_standardized_hadith_grade(source['Arabic_Comment'])
        itqan_record, itqan_evidence = crosscheck.match(source)
        if itqan_record:
            counters['itqan_text_crosschecked'] += 1
            source_number = str(itqan_record.get('idInBook', ''))
            raw_grade = grade_table.get(source_number, itqan_record.get('grade', ''))
            if isinstance(raw_grade, str) and raw_grade:
                candidate = extract_standardized_hadith_grade(raw_grade, bare_label=True)
                if candidate:
                    derived_grade = {**candidate, 'source': str(grade_path) if source_number in grade_table else itqan_record['_path'], 'itqan_id': itqan_record['_key']}
        changes = []
        if derived_grade:
            for field, key in [('English_Grade', 'english'), ('Arabic_Grade', 'arabic')]:
                may_fill = not aliases or (grade_policy == 'fill' and book in {'AbuDaud', 'Tirmidhi', 'Nesai', 'IbnMajah'})
                if may_fill and not present(row[field]):
                    row[field] = derived_grade[key]
                    changes.append(field)
                elif not present(row[field]):
                    counters['preserved_empty_grade_with_derived_candidate'] += 1
        if not aliases:
            normalized_grade = extract_standardized_hadith_grade(source['Arabic_Comment'])
            if normalized_grade:
                row['English_Grade'], row['Arabic_Grade'] = normalized_grade['english'], normalized_grade['arabic']
        chain_text = source['Arabic_Isnad'] if present(source['Arabic_Isnad']) else split_isnad_matn(source['Arabic_Hadith'])[0]
        nodes = parser.parse(chain_text, matcher.resolve)
        tier, calibration = calibrate_chain(nodes)
        roots, ayahs, root_words, r_methods = bridge.extract(source['Arabic_Matn'])
        root_methods.update(r_methods)
        counters['chain_nodes'] += len(nodes)
        counters['resolved_narrator_nodes'] += sum(n.get('rijal_id') is not None for n in nodes)
        counters['rows_with_chain'] += bool(nodes)
        counters['rows_with_roots'] += bool(roots)
        counters['rows_with_commentary'] += bool(text)
        counters['matn_aligned'] += matn_unit is not None
        methods[link.method] += 1
        page = commentary_unit.start if commentary_unit else None
        row.update(Arabic_Tafseel=text, Matn_Book_ID=int(pair.matn), Matn_Shamela_URL=book_url(pair.matn), Commentary_Book_ID=int(pair.commentary) if page else None, Commentary_Book_Title=page['book_title'] if page else '', Commentary_Author=pair.author if page else '', Commentary_Shamela_URL=book_url(pair.commentary) if page else '', Shamela_Volume=page['volume_number'] if page else '', Shamela_Page=page['page_number'] if page else '', Tafseel_Match_Score=float(link.score) if page else 0., Tafseel_Match_Method=link.method if page else 'unmatched', Source_Row_Reference=f"Shamela:{pair.commentary}:v{page['volume_number']}:p{page['page_number']}:s{page['serial_number']}" if page else '', Itqan_Narrator_Chain_JSON=json.dumps(nodes, ensure_ascii=False, sort_keys=True), Itqan_Weakest_Narrator_Grade=tier, Itqan_Chain_Calibration_Score=calibration, Itqan_Quran_Root_Links_JSON=json.dumps(roots, ensure_ascii=False), Itqan_Linked_Ayah_Keys_JSON=json.dumps(ayahs), Itqan_Corroborating_Hadiths_JSON='[]')
        records.append(row)
        ledger.append({'output_row_index': i, 'hadith_number': source['Hadith_number'], 'matn_match': vars(matn_match), 'commentary_match': vars(link), 'matn': provenance(matn_unit), 'commentary': provenance(commentary_unit), 'commentary_mode': pair.mode, 'inline_note_source': text if pair.mode == 'inline' else '', 'inline_footnotes': matn_unit.footnotes if pair.mode == 'inline' and matn_unit else [], 'itqan_crosscheck': itqan_evidence, 'derived_grade': derived_grade, 'grade_fields_changed': changes, 'grade_policy': grade_policy, 'root_words': root_words, 'root_methods': r_methods, 'quran_profile': 'hafs-kufi', 'calibration_is_computational_not_authenticity': True})
    summary = {'book': book, 'records': len(records), 'counts': dict(counters), 'match_methods': dict(methods), 'root_methods': dict(root_methods), 'lk_inputs': lk_manifest, 'reused_matn_links_with_span_validation': reused, 'itqan_source_records': len(crosscheck.records), 'grade_policy': grade_policy}
    return records, ledger, summary, {'matn': matn_parser, 'commentary': sharh_parser}
