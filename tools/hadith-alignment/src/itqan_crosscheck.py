"""Text-verified Itqan identities and bounded cross-book Matn candidates."""
from collections import defaultdict
from functools import lru_cache
import re

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

from .isnad_matn_splitter import split_isnad_matn
from .itqan_sources import load_json
from .normalizer import normalize_arabic

ITQAN_KEYS = {'Bukhari': 'bukhari', 'Muslim': 'muslim', 'AbuDaud': 'abudawud', 'Tirmidhi': 'tirmidhi', 'Nesai': 'nasai', 'IbnMajah': 'ibnmajah', 'MuwattaMalik': 'malik', 'MusnadAhmad': 'ahmed', 'SunanDarimi': 'darimi'}


class ItqanCrosscheck:
    def __init__(self, root, book):
        self.records = []
        self.full, self.matn, self.tokens = (defaultdict(set) for _ in range(3))
        folder = root / 'app/data/sunni' / ITQAN_KEYS[book]
        for path in sorted(folder.glob('*.json'), key=lambda p: (int(p.stem) if p.stem.isdigit() else 10**9, p.name)):
            data = load_json(path)
            if not isinstance(data, list):
                continue
            for row in data:
                if not isinstance(row, dict) or not row.get('arabic'):
                    continue
                index = len(self.records)
                normalized = normalize_arabic(row['arabic'])
                matn = normalize_arabic(split_isnad_matn(row['arabic'])[1])
                identity = str(row.get('idInBook', row.get('id', '')))
                self.records.append({**row, '_path': str(path), '_key': f'{ITQAN_KEYS[book]}:{identity}', '_text': normalized})
                self.full[normalized].add(index)
                if len(matn) >= 40:
                    self.matn[matn].add(index)
                for token in set(matn.split()):
                    self.tokens[token].add(index)

    def match(self, row):
        full, matn = normalize_arabic(row['Arabic_Hadith']), normalize_arabic(row['Arabic_Matn'])
        hits = self.full.get(full, set())
        method = 'exact_full_text'
        if not hits and len(matn) >= 40:
            hits = self.matn.get(matn, set())
            method = 'exact_matn_unique'
        if not hits and len(matn) >= 60:
            words = sorted(set(matn.split()), key=lambda t: (len(self.tokens.get(t, set())), t))[:3]
            candidates = set.union(*(self.tokens.get(t, set()) for t in words)) if words else set()
            hits = {i for i in candidates if matn in self.records[i]['_text']}
            method = 'long_matn_substring_unique'
        # Repeated Matn may have distinct chains/grades. Leave ambiguous sources
        # unresolved instead of matching a number from another edition.
        if len(hits) != 1:
            return None, {'method': 'ambiguous_or_unmatched', 'candidate_count': len(hits)}
        record = self.records[next(iter(hits))]
        return record, {'method': method, 'source_id': record['_key'], 'source_file': record['_path']}


def corroboration_candidates(rows: list[dict], threshold=.85, maximum=5) -> list[list[dict]]:
    """Recompute text similarities; Itqan topic scores are not probabilities."""
    text = [normalize_arabic(r['Arabic_Matn']) for r in rows]
    postings = defaultdict(list)
    for i, value in enumerate(text):
        if len(value) >= 40:
            for token in set(value.split()):
                postings[token].append(i)
    try:
        vectors = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, dtype=np.float32).fit_transform(text)
    except ValueError:
        return [[] for _ in rows]
    output = []
    for i, value in enumerate(text):
        words = sorted(set(value.split()), key=lambda t: (len(postings[t]), t))[:3]
        candidates = set()
        for token in words:
            if len(postings[token]) <= 1000:
                candidates.update(postings[token])
        candidates = sorted(j for j in candidates if rows[j]['book_key'] != rows[i]['book_key'] and len(text[j]) >= 40)[:256]
        links = []
        if len(value) >= 40 and candidates:
            scores = (vectors[i] @ vectors[candidates].T).toarray()[0]
            ranked = sorted(zip(candidates, scores), key=lambda item: (-float(item[1]), rows[item[0]]['book_key'], rows[item[0]]['Hadith_number'], item[0]))
            seen = set()
            for j, score in ranked:
                key = (rows[j]['book_key'], rows[j]['Hadith_number'])
                if float(score) >= threshold and key not in seen:
                    links.append({'book': key[0], 'hadith_number': key[1], 'type': 'shared_matn', 'similarity': min(1., float(score)), 'output_row_index': j})
                    seen.add(key)
                if len(links) >= maximum:
                    break
        output.append(links)
    return output
