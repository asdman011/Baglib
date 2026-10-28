"""Per-row positional windows, exact keys, TF-IDF and scoped inheritance."""
from collections import defaultdict
from dataclasses import dataclass
import math
import re

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

from .loaders import OhdRow
from .normalizer import matching_text, normalize_arabic, present


@dataclass
class Match:
    commentary: str | None = None
    score: float = 0.0
    method: str = 'unmatched'
    index: int = -1


def window(i: int, n_lk: int, n_ohd: int, pct: float) -> tuple[int, int, int]:
    center = i * n_ohd // n_lk
    half = max(350, math.floor(pct * n_ohd))
    # Half-open upper bound, as specified; OHD row n_ohd never exists.
    return max(0, center - half), min(n_ohd, center + half), center


def forward_fill(rows: list[dict[str, str]], matches: list[Match]) -> None:
    previous: dict[tuple[str, str], Match] = {}
    for row, match in zip(rows, matches):
        base = re.match(r'^(\d+)', row['Hadith_number'].strip())
        chapter = row['Chapter_Number'].strip()
        if not base or not present(chapter):
            continue
        group = (chapter, base[1])
        if match.commentary is None and group in previous:
            donor = previous[group]
            match.commentary, match.score, match.index = donor.commentary, donor.score, donor.index
            match.method = 'sub_narration_ffill'
        if match.commentary is not None:
            previous[group] = match


def align(rows: list[dict[str, str]], ohd: list[OhdRow], min_score: float = .45, window_pct: float = .08, batch_size: int = 500) -> list[Match]:
    if not math.isfinite(min_score) or not 0 <= min_score <= 1 or not math.isfinite(window_pct) or not 0 <= window_pct <= 1 or batch_size < 1:
        raise ValueError('Scores/window fractions must be finite in [0, 1]; batch size must be positive')
    matches = [Match() for _ in rows]
    if not rows or not ohd:
        return matches
    lk_text = [normalize_arabic(matching_text(row)) for row in rows]
    source = [normalize_arabic(row.text) for row in ohd]
    valid = [bool(text) and present(row.commentary) for text, row in zip(source, ohd)]
    exact = defaultdict(list)
    for j, text in enumerate(source):
        if valid[j]:
            exact[text].append(j)
    pending = []
    for i, text in enumerate(lk_text):
        lo, hi, center = window(i, len(rows), len(ohd), window_pct)
        candidates = [j for j in exact.get(text, []) if lo <= j < hi] if text else []
        if not candidates:
            matn = normalize_arabic(rows[i]['Arabic_Matn'])
            if len(matn) >= 40:
                candidates = [j for j in range(lo, hi) if valid[j] and matn in source[j]]
        if candidates:
            j = min(candidates, key=lambda j: (abs(j - center), j))
            matches[i] = Match(ohd[j].commentary, 1.0, 'exact_window', j)
        elif text:
            pending.append(i)
    if pending:
        vectorizer = TfidfVectorizer(analyzer='word', ngram_range=(1, 2), sublinear_tf=True, dtype=np.float64)
        try:
            vectors = vectorizer.fit_transform(lk_text + source)
        except ValueError as error:
            if 'empty vocabulary' not in str(error):
                raise
        else:
            lk_vectors, ohd_vectors = vectors[:len(rows)], vectors[len(rows):]
            for start in range(0, len(pending), batch_size):
                indices = pending[start:start + batch_size]
                bounds = [window(i, len(rows), len(ohd), window_pct) for i in indices]
                batch_lo = min(b[0] for b in bounds)
                batch_hi = max(b[1] for b in bounds)
                # Normalized TF-IDF dot product = cosine. At most 500 x N_OHD,
                # never a dense full-corpus all-pairs matrix.
                scores = (lk_vectors[indices] @ ohd_vectors[batch_lo:batch_hi].T).toarray()
                for offset, i in enumerate(indices):
                    lo, hi, center = bounds[offset]
                    candidates = np.arange(lo, hi)[np.array(valid[lo:hi], dtype=bool)]
                    if not len(candidates):
                        continue
                    values = scores[offset, candidates - batch_lo]
                    best = float(np.clip(values.max(), 0, 1))
                    matches[i].score = best
                    if best > 0 and best >= min_score:
                        tied = candidates[values == values.max()]
                        j = int(min(tied, key=lambda j: (abs(j - center), j)))
                        matches[i] = Match(ohd[j].commentary, best, 'tfidf_window', j)
    forward_fill(rows, matches)
    return matches
