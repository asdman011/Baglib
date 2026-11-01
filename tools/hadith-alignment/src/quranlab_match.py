"""Versioned text crosswalk between QuranLab records and corpus rows.

A number never establishes identity. Numbers and neighbours are supporting evidence
only; scores are similarity measures, not probabilities.
"""
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from difflib import SequenceMatcher
import re
import unicodedata

CROSSWALK_VERSION = 'quranlab-crosswalk-v1'
MARKS = re.compile(r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]')
NON_WORD = re.compile(r'[^\u0621-\u064A]+')  # digits here are footnote marks and row labels
HONORIFICS = [('صلى', 'الله', 'عليه', 'وسلم'), ('صلي', 'الله', 'عليه', 'وسلم'), ('صلي', 'الله', 'عليه', 'و', 'سلم'), ('رضي', 'الله', 'عنه'), ('رضي', 'الله', 'عنها'), ('رضي', 'الله', 'عنهما'), ('رضي', 'الله', 'عنهم'), ('عز', 'وجل'), ('تبارك', 'وتعالي'), ('سبحانه', 'وتعالي')]
HONORIFIC_INDEX = defaultdict(list)
for phrase in HONORIFICS:
    HONORIFIC_INDEX[phrase[0]].append(phrase)
# Formula words differ between editions and say nothing about who is in the chain.
FORMULA = {'حدثنا', 'حدثني', 'وحدثنا', 'وحدثني', 'اخبرنا', 'اخبرني', 'واخبرنا', 'واخبرني', 'انبانا', 'قال', 'قالا', 'قالوا', 'عن', 'انه', 'ان', 'انها', 'سمعت', 'يعني', 'هو', 'ابن', 'بن'}
GRAM = 4
MAX_POSTING = 64
CANDIDATES = 6


@dataclass(frozen=True)
class Thresholds:
    """Calibrated in reference/quranlab_match_calibration.json; bump with the version."""
    verified_full: float = .90
    verified_isnad: float = .80
    margin: float = .03
    prefix: float = .90
    prefix_isnad: float = .85
    prefix_min_tokens: int = 12
    candidate_floor: float = .55
    containment: float = .90
    inner: float = .95
    inner_block: float = .70
    report_in_collection: float = .95
    min_tokens: int = 8


THRESHOLDS = Thresholds()
PART_RELATIONS = {'corpus_extends_source', 'corpus_contains_report'}


def match_tokens(text):
    """Matching key only; canonical text is never rewritten. ة/ه stay distinct."""
    value = unicodedata.normalize('NFKC', text or '').replace('ﷺ', ' ')
    value = MARKS.sub('', value)
    value = value.translate(str.maketrans({'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ی': 'ي', 'ک': 'ك', 'ؤ': 'ء', 'ئ': 'ء'}))
    tokens = NON_WORD.sub(' ', value).split()
    kept, index = [], 0
    while index < len(tokens):
        for phrase in HONORIFIC_INDEX.get(tokens[index], ()):
            if tuple(tokens[index:index + len(phrase)]) == phrase:
                index += len(phrase)
                break
        else:
            kept.append(tokens[index])
            index += 1
    return kept


def ordered(left, right):
    if not left or not right:
        return 0.
    return SequenceMatcher(None, left, right, autojunk=False).ratio()


def containment(inner, outer):
    """Share of `inner` tokens found, in order, inside `outer`."""
    if not inner or not outer:
        return 0.
    blocks = SequenceMatcher(None, inner, outer, autojunk=False).get_matching_blocks()
    return sum(block.size for block in blocks) / len(inner)


def longest_block(inner, outer):
    return SequenceMatcher(None, inner, outer, autojunk=False).find_longest_match().size


@dataclass
class CorpusRow:
    id: int
    number: str
    tokens: list
    isnad: list
    matn: list
    position: int
    alternate: list = field(default_factory=list)


@dataclass
class Decision:
    source_key: str
    decision: str
    hadith_id: int | None
    relation: str = 'none'
    method: str = 'none'
    full: float = 0.
    isnad: float = 0.
    matn: float = 0.
    runner_up: float = 0.
    number_agrees: bool = False
    candidates: list = field(default_factory=list)
    reason: str = ''
    tail_tokens: int = 0


def grams(tokens):
    return [tuple(tokens[i:i + GRAM]) for i in range(len(tokens) - GRAM + 1)]


def clean_number(value):
    """Comparison form only; stored numbers keep their exact strings."""
    return re.sub(r'\.0+$', '', str(value or '').strip())


class CorpusIndex:
    def __init__(self, rows):
        self.by_id = {row.id: row for row in rows}
        self.exact = defaultdict(list)
        self.alternate = defaultdict(list)
        self.postings = defaultdict(list)
        self.by_number = defaultdict(list)
        for row in rows:
            self.exact[' '.join(row.tokens)].append(row)
            if row.alternate and row.alternate != row.tokens:
                self.alternate[' '.join(row.alternate)].append(row)
            self.by_number[clean_number(row.number)].append(row)
            for gram in set(grams(row.tokens)):
                self.postings[gram].append(row.id)

    def retrieve(self, tokens, number):
        """Bounded retrieval: rare 4-grams only, never all pairs."""
        votes = Counter()
        for gram in set(grams(tokens)):
            posting = self.postings.get(gram, ())
            if len(posting) <= MAX_POSTING:
                votes.update(posting)
        ids = [identity for identity, _ in sorted(votes.items(), key=lambda item: (-item[1], item[0]))[:CANDIDATES]]
        for row in self.by_number.get(clean_number(number), ())[:3]:
            if row.id not in ids:
                ids.append(row.id)
        return [self.by_id[identity] for identity in ids]


def corpus_row(identity, number, full, isnad, matn, position, comment=''):
    """`comment` is LK's closing remark, which other editions keep inside the record."""
    tokens = match_tokens(full)
    return CorpusRow(identity, number, tokens, match_tokens(isnad), match_tokens(matn), position, tokens + match_tokens(comment) if comment else [])


def chain_tokens(tokens):
    kept = [token for token in tokens if token not in FORMULA]
    # Muwatta rows open with the recension's own "حدثني يحيى عن مالك".
    return kept[1:] if kept[:2] == ['يحيي', 'مالك'] else kept


def score(tokens, row):
    full = ordered(tokens, row.tokens)
    # Same matn on a different chain must not pass: compare the chain on its own.
    annotated = bool(row.isnad and row.matn)
    size = len(row.isnad) if annotated else max(1, len(row.tokens) // 3)
    corpus_chain = chain_tokens(row.isnad if annotated else row.tokens[:size])
    source_chain = chain_tokens(tokens[:size + 6])
    isnad = containment(corpus_chain, source_chain)
    matn = ordered(tokens[max(0, size - 6):], row.tokens[size:])
    return full, isnad, matn


def prefix_of(inner, outer, thresholds):
    """`inner` opens `outer`: the extra text only follows the report that matched."""
    if len(inner) < thresholds.prefix_min_tokens or len(outer) <= len(inner):
        return 0.
    return ordered(inner, outer[:len(inner) + 6])


def classify(source_key, number, tokens, index, thresholds=THRESHOLDS):
    if len(tokens) < thresholds.min_tokens:
        same = index.exact.get(' '.join(tokens), [])
        return Decision(source_key, 'candidate_review' if same else 'source_only', None, reason='too-short-for-identity', candidates=[row.id for row in same[:5]])
    key = ' '.join(tokens)
    same = index.exact.get(key, [])
    method = 'exact_normalized'
    if not same:
        same = index.alternate.get(key, [])
        method = 'exact_with_closing_remark'
    if len(same) == 1:
        return Decision(source_key, 'verified_match', same[0].id, 'one_to_one', method, 1., 1., 1., number_agrees=clean_number(same[0].number) == clean_number(number))
    if len(same) > 1:
        numbered = [row for row in same if clean_number(row.number) == clean_number(number)]
        if len(numbered) == 1:
            return Decision(source_key, 'verified_match', numbered[0].id, 'one_to_one', method + '_repeat_number', 1., 1., 1., 1., True, [row.id for row in same[:5]])
        return Decision(source_key, 'candidate_review', None, 'one_to_many', method + '_repeat', 1., 1., 1., 1., candidates=[row.id for row in same[:5]], reason='identical text repeated without a number to separate it')
    scored = sorted(((*score(tokens, row), row) for row in index.retrieve(tokens, number)), key=lambda item: (-item[0], item[3].id))
    if not scored:
        return Decision(source_key, 'source_only', None, reason='no-candidate')
    full, isnad, matn, row = scored[0]
    runner_up = scored[1][0] if len(scored) > 1 else 0.
    agrees = clean_number(row.number) == clean_number(number)
    candidates = [item[3].id for item in scored[:5]]
    if full >= thresholds.verified_full and full - runner_up < thresholds.margin:
        return Decision(source_key, 'candidate_review', None, 'one_to_many', 'near_tie', full, isnad, matn, runner_up, agrees, candidates, 'two candidates are too close to separate')
    if full >= thresholds.verified_full and isnad >= thresholds.verified_isnad:
        return Decision(source_key, 'verified_match', row.id, 'one_to_one', 'aligned_text', full, isnad, matn, runner_up, agrees, candidates)
    extended = []
    for item_full, item_isnad, item_matn, item in scored:
        if item_isnad < thresholds.prefix_isnad:
            continue
        if prefix_of(item.alternate or item.tokens, tokens, thresholds) >= thresholds.prefix or prefix_of(item.tokens, tokens, thresholds) >= thresholds.prefix:
            extended.append(('source_extends_corpus', item, len(tokens) - len(item.tokens), item_full, item_isnad, item_matn))
        elif prefix_of(tokens, item.tokens, thresholds) >= thresholds.prefix:
            extended.append(('corpus_extends_source', item, len(item.tokens) - len(tokens), item_full, item_isnad, item_matn))
    if len(extended) == 1:
        relation, item, tail, item_full, item_isnad, item_matn = extended[0]
        return Decision(source_key, 'verified_match', item.id, relation, 'prefix_text', item_full, item_isnad, item_matn, runner_up, clean_number(item.number) == clean_number(number), candidates, 'one report opens the other; the rest stays unassigned', tail)
    if len(extended) > 1:
        return Decision(source_key, 'candidate_review', None, 'one_to_many', 'prefix_tie', full, isnad, matn, runner_up, agrees, candidates, 'several rows open this record')
    best_contained = max((containment(item[3].tokens, tokens), item[3].id) for item in scored)
    source_contained = max((containment(tokens, item[3].tokens), item[3].id) for item in scored)
    # One corpus row can hold several reports; a whole report found inside it is that report.
    if len(tokens) >= thresholds.prefix_min_tokens and source_contained[0] >= thresholds.inner:
        holders = [item[3] for item in scored if containment(tokens, item[3].tokens) >= thresholds.containment]
        block = longest_block(tokens, index.by_id[source_contained[1]].tokens)
        if len(holders) == 1 and block >= thresholds.inner_block * len(tokens):
            holder = holders[0]
            return Decision(source_key, 'verified_match', holder.id, 'corpus_contains_report', 'inner_text', full, isnad, matn, runner_up, clean_number(holder.number) == clean_number(number), candidates, 'this report is one part of a longer corpus row', len(holder.tokens) - len(tokens))
    if best_contained[0] >= thresholds.containment:
        return Decision(source_key, 'candidate_review', None, 'source_contains_corpus', 'containment', full, isnad, matn, runner_up, agrees, candidates, f'corpus row {best_contained[1]} sits inside a longer source record')
    if source_contained[0] >= thresholds.containment:
        return Decision(source_key, 'candidate_review', None, 'corpus_contains_source', 'containment', full, isnad, matn, runner_up, agrees, candidates, f'source record sits inside longer corpus row {source_contained[1]}')
    if full >= thresholds.candidate_floor:
        return Decision(source_key, 'candidate_review', None, 'partial', 'partial_text', full, isnad, matn, runner_up, agrees, candidates, 'similar text below the identity threshold')
    if agrees:
        return Decision(source_key, 'conflicting_identity', None, 'number_only', 'number_without_text', full, isnad, matn, runner_up, True, candidates, 'same number, different text')
    return Decision(source_key, 'source_only', None, reason='below-candidate-floor', full=full, candidates=candidates[:1])


def resolve_collisions(decisions):
    """Two sources claiming one row is an identity conflict, not a free choice.

    Part-of relations are exempt: several reports can sit inside one corpus row.
    """
    claims = defaultdict(list)
    for decision in decisions:
        if decision.decision == 'verified_match' and decision.relation not in PART_RELATIONS:
            claims[decision.hadith_id].append(decision)
    for identity, claimants in claims.items():
        if len(claimants) < 2:
            continue
        best = max(item.full for item in claimants)
        leaders = [item for item in claimants if item.full == best]
        numbered = [item for item in leaders if item.number_agrees]
        keep = leaders[0] if len(leaders) == 1 else numbered[0] if len(numbered) == 1 else None
        if keep is not None and any(item not in leaders and best - item.full < .05 for item in claimants):
            keep = None
        for item in claimants:
            if item is not keep:
                item.candidates = [identity]
                item.hadith_id = None
                item.decision = 'conflicting_identity' if keep is None else 'candidate_review'
                item.relation = 'many_to_one'
                item.reason = f'another source record claims corpus row {identity}'
    return decisions


def match_collection(source_rows, corpus_rows, thresholds=THRESHOLDS):
    index = CorpusIndex(corpus_rows)
    return resolve_collisions([classify(row.key, row.number, match_tokens(row.text), index, thresholds) for row in source_rows])


ATTRIBUTIONS = [('متفق عليه', ('Bukhari', 'Muslim')), ('متفق عليها', ('Bukhari', 'Muslim')), ('البخاري', ('Bukhari',)), ('مسلم', ('Muslim',)), ('أبو داود', ('AbuDaud',)), ('الترمذي', ('Tirmidhi',)), ('ابن ماجه', ('IbnMajah',)), ('مالك', ('MuwattaMalik',)), ('أحمد', ('MusnadAhmad',)), ('الدارمي', ('SunanDarimi',))]


def attributed_books(text):
    """Books HadeethEnc names for a report. An-Nasa'i's al-Kubra is not the Mujtaba."""
    found = {book for phrase, books in ATTRIBUTIONS if phrase in (text or '') for book in books}
    if 'النسائي' in (text or '') and 'النسائي في الكبرى' not in text:
        found.add('Nesai')
    return sorted(found)


def match_report(source_key, tokens, book, index, thresholds=THRESHOLDS):
    """Link a chain-less report to one attributed collection, at most one row."""
    if len(tokens) < thresholds.prefix_min_tokens:
        return None
    holders = [(containment(tokens, row.tokens), row) for row in index.retrieve(tokens, '')]
    holders = sorted(((value, row) for value, row in holders if value >= thresholds.report_in_collection), key=lambda item: (-item[0], item[1].id))
    if len(holders) == 1:
        return Decision(source_key, 'verified_match', holders[0][1].id, 'report_in_attributed_collection', 'inner_text', holders[0][0], reason=f'whole report found once in {book}')
    if holders:
        return Decision(source_key, 'candidate_review', None, 'one_to_many', 'inner_text', holders[0][0], candidates=[row.id for _, row in holders[:5]], reason=f'report occurs in several {book} rows or chains')
    return None
