"""Verified-number candidates, lemmas, bounded word/character similarity and inheritance."""
from collections import defaultdict
from dataclasses import dataclass
import math
import re

import numpy as np
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from .aligner import window
from .normalizer import matching_text, normalize_arabic, present
from .shamela_parser import DIGITS, Unit
from .sharh_parser import lemmas


@dataclass
class UnitMatch:
    index: int = -1
    score: float = 0.0
    method: str = 'unmatched'
    donor: int = -1


def number_key(value: str) -> str:
    text = value.translate(DIGITS).strip().lower()
    match = re.fullmatch(r'(\d+)(?:\.0+)?([a-z]?)', text)
    if match:
        return str(int(match[1])) + (match[2] or '')
    if re.fullmatch(r'\d+\s*/\s*[\dأ-يa-z]+|\d+\s*و\s*\d+', text):
        return re.sub(r'\s+', '', text)
    return ''


def containment(a: str, b: str) -> float:
    first, second = set(a.split()), set(b.split())
    return len(first & second) / min(len(first), len(second)) if first and second else 0.0


def choose(candidates: list[int], i: int, n: int, m: int) -> int:
    center = i * m // n
    return min(candidates, key=lambda j: (abs(j - center), j))


def align_units(rows: list[dict[str, str]], units: list[Unit], *, min_score: float = .45, window_pct: float = .08, verified_numbers: list[str] | None = None, inherit: bool = False) -> list[UnitMatch]:
    if not math.isfinite(min_score) or not 0 <= min_score <= 1 or not math.isfinite(window_pct) or not 0 <= window_pct <= 1:
        raise ValueError('Thresholds must be finite fractions')
    result = [UnitMatch() for _ in rows]
    if not rows or not units:
        return result
    queries = [normalize_arabic(r['Arabic_Matn'] if present(r['Arabic_Matn']) else matching_text(r)) for r in rows]
    texts = [normalize_arabic(u.text) for u in units]
    # Fuzzy comparison against compact quoted lemmas helps long commentary, while
    # preserving the full source unit for export. No arbitrary truncation of queries.
    unit_lemmas = [[normalize_arabic(x) for x in lemmas(u)] for u in units]
    targets = [' '.join(x) if x else text for x, text in zip(unit_lemmas, texts)]
    numbers = defaultdict(list)
    hashes = defaultdict(list)
    for j, unit in enumerate(units):
        if number_key(unit.number):
            numbers[number_key(unit.number)].append(j)
        if texts[j]:
            hashes[texts[j]].append(j)
    pending = []
    for i, query in enumerate(queries):
        if not query:
            continue
        number = number_key(verified_numbers[i] if verified_numbers is not None else rows[i]['Hadith_number'])
        # Number equality is never sufficient. Require substantial textual support.
        candidates = [j for j in numbers.get(number, []) if len(query) >= 40 and containment(query, targets[j]) >= .35]
        if candidates:
            best_overlap = max(containment(query, targets[j]) for j in candidates)
            candidates = [j for j in candidates if containment(query, targets[j]) == best_overlap]
            j = choose(candidates, i, len(rows), len(units))
            result[i] = UnitMatch(j, 1.0, 'hadith_num_exact')
            continue
        lo, hi, _ = window(i, len(rows), len(units), window_pct)
        candidates = [j for j in hashes.get(query, []) if lo <= j < hi]
        if not candidates and len(query) >= 40:
            candidates = [j for j in range(lo, hi) if query in texts[j] or any(len(lemma) >= 40 and lemma in query for lemma in unit_lemmas[j])]
        if candidates:
            j = choose(candidates, i, len(rows), len(units))
            result[i] = UnitMatch(j, .95, 'exact_window')
        else:
            pending.append(i)
    if pending:
        matrices = []
        corpus = queries + targets
        for analyzer in ('word', 'char'):
            vectorizer = TfidfVectorizer(analyzer=analyzer, ngram_range=(1, 2), sublinear_tf=True, dtype=np.float32)
            try:
                matrices.append(vectorizer.fit_transform(corpus))
            except ValueError as error:
                if 'empty vocabulary' not in str(error):
                    raise
        if matrices:
            vectors = normalize(hstack(matrices, format='csr'))
            source = vectors[len(rows):]
            # Keep batches/windows bounded; never materialize the whole all-pairs matrix.
            for start in range(0, len(pending), 128):
                ids = pending[start:start + 128]
                bounds = [window(i, len(rows), len(units), window_pct) for i in ids]
                low, high = min(b[0] for b in bounds), max(b[1] for b in bounds)
                scores = (vectors[ids] @ source[low:high].T).toarray()
                for offset, i in enumerate(ids):
                    lo, hi, _ = bounds[offset]
                    values = scores[offset, lo-low:hi-low]
                    best = float(np.clip(values.max(), 0, 1))
                    result[i].score = best
                    if best >= min_score and best > 0:
                        candidates = (np.flatnonzero(values == values.max()) + lo).tolist()
                        result[i] = UnitMatch(choose(candidates, i, len(rows), len(units)), best, 'tfidf_window')
    if inherit:
        previous = {}
        for i, (row, match) in enumerate(zip(rows, result)):
            # A shared Bab alone doesn't establish a follow-up narration. Require
            # suffix/base continuity or an explicit follow-up phrase as well.
            group = (row['Chapter_Number'], row['Section_Number'])
            number = number_key(row['Hadith_number'])
            base = re.match(r'^\d+', number)
            followup = bool(re.search(r'[a-z]$', number) or re.search(r'\b(?:مثله|نحوه|بمثله|بنحوه)\b', normalize_arabic(matching_text(row))))
            if match.index < 0 and all(present(x) for x in group) and followup and group in previous:
                donor = previous[group]
                prior_number = number_key(rows[donor]['Hadith_number'])
                prior_base = re.match(r'^\d+', prior_number)
                if (base and prior_base and base[0] == prior_base[0]) or 'مثله' in normalize_arabic(matching_text(row)) or 'نحوه' in normalize_arabic(matching_text(row)):
                    source_match = result[donor]
                    result[i] = UnitMatch(source_match.index, source_match.score, 'sub_narration_ffill', donor)
            if result[i].index >= 0:
                previous[group] = i
    return result
