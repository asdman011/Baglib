"""Sequential windows anchored to the last accepted candidate, with text guards."""
from collections import defaultdict

import numpy as np
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from .normalizer import matching_text, normalize_arabic, present
from .shamela_aligner import UnitMatch, containment, number_key
from .sharh_parser import lemmas


def align_anchored(rows, units, canonical_numbers, min_score=.45):
    result = [UnitMatch() for _ in rows]
    if not units:
        return result
    queries = [normalize_arabic(r['Arabic_Matn'] if present(r['Arabic_Matn']) else matching_text(r)) for r in rows]
    full = [normalize_arabic(u.text) for u in units]
    quoted = [' '.join(normalize_arabic(s) for s in lemmas(u)) or text for u, text in zip(units, full)]
    corpus = queries + quoted
    matrices = []
    for analyzer, ngrams in [('word', (1, 2)), ('char', (3, 5))]:
        try:
            matrices.append(TfidfVectorizer(analyzer=analyzer, ngram_range=ngrams, sublinear_tf=True, dtype=np.float32).fit_transform(corpus))
        except ValueError as error:
            if 'empty vocabulary' not in str(error):
                raise
    vectors = normalize(hstack(matrices, format='csr')) if matrices else None
    anchor = None
    prior = None
    for i, query in enumerate(queries):
        if not query:
            continue
        center = anchor if anchor is not None else i * len(units) // max(1, len(rows))
        lo, hi = max(0, center-15), min(len(units), center+61)
        number = number_key(canonical_numbers[i])
        candidates = [j for j in range(lo, hi) if number and number_key(units[j].number) == number and len(query) >= 35 and containment(query, quoted[j]) >= .35]
        if candidates:
            j = max(candidates, key=lambda j: (containment(query, quoted[j]), -abs(j-center), -j))
            result[i] = UnitMatch(j, 1., 'exact_hadith_num')
        else:
            lo, hi = max(0, center-10), min(len(units), center+41)
            candidates = [j for j in range(lo, hi) if len(query) >= 35 and query in full[j]]
            if candidates:
                j = min(candidates, key=lambda j: (abs(j-center), j))
                result[i] = UnitMatch(j, .95, 'exact_window')
            elif vectors is not None:
                lo, hi = max(0, center-15), min(len(units), center+51)
                scores = (vectors[i] @ vectors[len(rows)+lo:len(rows)+hi].T).toarray()[0]
                best = float(scores.max()) if len(scores) else 0
                if best >= min_score:
                    j = lo + int(np.argmax(scores))
                    result[i] = UnitMatch(j, min(.94, best), 'tfidf_window')
        if result[i].index < 0 and prior is not None:
            same_chapter = present(rows[i]['Chapter_Number']) and rows[i]['Chapter_Number'] == rows[prior]['Chapter_Number']
            current_num, prior_num = number_key(rows[i]['Hadith_number']), number_key(rows[prior]['Hadith_number'])
            import re
            first, second = re.match(r'\d+', current_num), re.match(r'\d+', prior_num)
            suffix = bool(current_num and current_num[-1].isalpha() and first and second and first[0] == second[0])
            overlap = containment(query, queries[prior])
            if same_chapter and (suffix or (prior == i-1 and overlap >= .65)):
                result[i] = UnitMatch(result[prior].index, .85, 'sub_narration_ffill', prior)
        if result[i].index >= 0:
            anchor = result[i].index
            prior = i
    return result
