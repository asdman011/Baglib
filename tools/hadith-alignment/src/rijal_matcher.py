"""Conservative indexed profile matching. Ambiguity is never resolved by grade."""
from collections import defaultdict
from functools import lru_cache
import re

from .isnad_parser import name_key
from .itqan_sources import iter_profiles, manual_aliases

TIERS = {'Sahabi': 1.0, 'Thiqah Thabt': .98, 'Thiqah': .92, 'Saduq': .8, 'Saduq Yahim': .68, 'Maqbul / Layyin': .55, 'Majhul al-Hal': .4, 'Majhul': .3, "Da'if": .25, "Da'if Jiddan": .15, 'Matruk': .08, 'Kadhdhab': 0.0, 'Ungraded': .5}
STOP = {'بن', 'ابن', 'ابو', 'ابي', 'عبد', 'بنت', 'ال', 'ام'}
FAMOUS = {'الزهري': 'محمد بن مسلم', 'ابن شهاب': 'محمد بن مسلم', 'الاعمش': 'سليمان بن مهران', 'قتادة': 'قتادة بن دعامة', 'شعبة': 'شعبة بن الحجاج', 'مالك': 'مالك بن انس', 'نافع': 'نافع مولي ابن عمر', 'عكرمة': 'عكرمة مولي ابن عباس', 'ابو اليمان': 'الحكم بن نافع', 'الحميدي': 'عبد الله بن الزبير بن عيسي', 'مسدد': 'مسدد بن مسرهد', 'وكيع': 'وكيع بن الجراح', 'ابن جريج': 'عبد الملك بن عبد العزيز بن جريج', 'الاوزاعي': 'عبد الرحمن بن عمرو', 'الليث': 'الليث بن سعد', 'معمر': 'معمر بن راشد', 'همام': 'همام بن يحيي', 'عفان': 'عفان بن مسلم', 'بندار': 'محمد بن بشار', 'عبد الرزاق': 'عبد الرزاق بن همام'}


def generation(text: str) -> int | None:
    key = name_key(text)
    terms = ['الاولي', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة', 'الحادية عشرة', 'الثانية عشرة']
    for number, term in reversed(list(enumerate(terms, 1))):
        if term in key:
            return number
    return None


def classify_narrator_grade(text: str, source_tier: str = '') -> tuple[str, float]:
    value = name_key(text)
    # Specific/negative phrases precede generic ثقة/صدوق. Never upgrade a
    # conflicting clause merely because it also contains a positive keyword.
    rules = [(r'كذاب|وضاع|يضع الحديث', 'Kadhdhab'), (r'متروك|تالف|ساقط', 'Matruk'), (r'ضعيف جدا|منكر الحديث|واهي', "Da'if Jiddan"), (r'ضعيف|ليس بثقة|ليس بالقوي|فيه ضعف', "Da'if"), (r'مجهول الحال|مستور', 'Majhul al-Hal'), (r'مجهول', 'Majhul'), (r'صدوق.*(?:يهم|يخطئ|اوهام|تغير)', 'Saduq Yahim'), (r'مقبول|لين', 'Maqbul / Layyin'), (r'صحابي|صحبة', 'Sahabi'), (r'ثقة ثبت|ثقة حافظ|ثقة متقن|ثقة فقيه|امام|حجة', 'Thiqah Thabt'), (r'ثقة|الثقات', 'Thiqah'), (r'صدوق|لا باس به|ليس به باس', 'Saduq')]
    for pattern, tier in rules:
        if re.search(pattern, value):
            return tier, TIERS[tier]
    fallback = {'companion': 'Sahabi', 'reliable': 'Thiqah', 'mostly_reliable': 'Saduq', 'weak': "Da'if", 'abandoned': 'Matruk', 'fabricator': 'Kadhdhab'}.get(source_tier, 'Ungraded')
    return fallback, TIERS[fallback]


def death_year(text: str) -> int | None:
    years = {int(n) for n in re.findall(r'\d{1,4}', str(text))}
    return next(iter(years)) if len(years) == 1 else None


# Eight directional context rules, implemented as hypotheses and recorded as such.
CONTEXT_RULES = [
    ('سفيان', ('الحميدي', 'عمرو بن دينار', 'ابن المديني'), 'سفيان بن عيينة'),
    ('سفيان', ('وكيع', 'منصور', 'الاعمش', 'ابن مهدي'), 'سفيان بن سعيد'),
    ('حماد', ('مسدد', 'سليمان بن حرب', 'قتيبة', 'هشام بن عروة'), 'حماد بن زيد'),
    ('حماد', ('عفان', 'ثابت', 'موسي بن اسماعيل', 'حميد الطويل'), 'حماد بن سلمة'),
    ('يحيي بن سعيد', ('مالك', 'عمرة', 'سعيد بن المسيب'), 'يحيي بن سعيد بن قيس'),
    ('يحيي بن سعيد', ('احمد بن حنبل', 'بندار', 'مسدد', 'ابن المديني'), 'يحيي بن سعيد بن فروخ'),
    ('عبيد الله', ('نافع', 'يحيي بن سعيد القطان'), 'عبيد الله بن عمر'),
    ('عبد الله', ('نافع', 'العمري'), 'عبد الله بن عمر العمري'),
]


class RijalMatcher:
    def __init__(self, root):
        self.profiles = {}
        self.exact, self.tokens, self.kunyas, self.laqabs = (defaultdict(set) for _ in range(4))
        self.aliases = {name_key(k): name_key(v) if v else None for k, v in manual_aliases(root).items()}
        self.aliases.update({name_key(k): name_key(v) for k, v in FAMOUS.items()})
        for identity, p in iter_profiles(root):
            tier, score = classify_narrator_grade(p.get('grade_ar', ''), p.get('grade_en', ''))
            self.profiles[identity] = {'id': identity, 'name': p['full_name'], 'key': name_key(p['full_name']), 'grade_ar': p.get('grade_ar', ''), 'tier': tier, 'score': score, 'death': death_year(p.get('death', '')), 'tabaqah': p.get('tabaqat', ''), 'teachers': {str(x) for x in p.get('teachers', [])}, 'students': {str(x) for x in p.get('students', [])}}
            self.exact[name_key(p['full_name'])].add(identity)
            for token in set(name_key(p['full_name']).split()) - STOP:
                self.tokens[token].add(identity)
                if token.startswith('ال'):
                    self.laqabs[token].add(identity)
            if p.get('kunya') and p['kunya'] != '-':
                self.kunyas[name_key(p['kunya']).replace('ابي ', 'ابو ', 1)].add(identity)

    def unique(self, hits: set[str], previous: str, next_name: str) -> str | None:
        neighbors = self.exact.get(name_key(previous), set()) | self.exact.get(name_key(next_name), set())
        neighbor_generations = {generation(self.profiles[j]['tabaqah']) for j in neighbors} - {None}
        hits = {i for i in hits if generation(self.profiles[i]['tabaqah']) is None or not neighbor_generations or all(abs(generation(self.profiles[i]['tabaqah']) - n) <= 3 for n in neighbor_generations)}
        if len(hits) == 1:
            return next(iter(hits))
        previous_ids = self.exact.get(name_key(previous), set())
        next_ids = self.exact.get(name_key(next_name), set())
        linked = {i for i in hits if self.profiles[i]['students'] & previous_ids or self.profiles[i]['teachers'] & next_ids or any(i in self.profiles[j]['teachers'] for j in previous_ids) or any(i in self.profiles[j]['students'] for j in next_ids)}
        return next(iter(linked)) if len(linked) == 1 else None

    @lru_cache(maxsize=100000)
    def resolve(self, surface: str, previous: str = '', next_name: str = '') -> dict:
        key = name_key(surface)
        if key in {'ابيه', 'جده', 'امه', 'جدته', 'عمه', 'ابي'}:
            return {'method': 'unresolved_kinship'}
        context = name_key(previous + ' ' + next_name)
        for short, cues, target in CONTEXT_RULES:
            if key == short and any(name_key(cue) in context for cue in cues):
                hits = set.intersection(*(self.tokens.get(t, set()) for t in set(target.split()) - STOP))
                hits = {i for i in hits if self.profiles[i]['key'].startswith(target)}
                identity = self.unique(hits, previous, next_name)
                if identity:
                    return self.result(identity, 'context_rule')
                # Keep the contextual name hypothesis, but never fall through to
                # an unrelated short-name profile when biography identity is unclear.
                return {'resolved_name': target, 'method': 'context_name_unresolved_profile', 'candidate_count': len(hits)}
        if key in self.aliases and self.aliases[key]:
            alias = self.aliases[key]
            toks = set(alias.split()) - STOP
            hits = set.intersection(*(self.tokens.get(t, set()) for t in toks)) if toks else set()
            hits = {i for i in hits if self.profiles[i]['key'].startswith(alias)}
            identity = self.unique(hits, previous, next_name)
            if identity:
                return self.result(identity, 'manual_alias')
        candidates = [('exact', self.exact.get(key, set()))]
        toks = set(key.split()) - STOP
        if len(toks) >= 2:
            candidates.append(('token_containment', set.intersection(*(self.tokens.get(t, set()) for t in toks))))
        candidates.append(('kunya', self.kunyas.get(key.replace('ابي ', 'ابو ', 1), set())))
        if len(key.split()) == 1 and key.startswith('ال') and len(self.laqabs.get(key, set())) <= 3:
            candidates.append(('laqab', self.laqabs.get(key, set())))
        for method, hits in candidates:
            identity = self.unique(hits, previous, next_name)
            if identity:
                return self.result(identity, method)
        return {'method': 'ambiguous_or_unmatched', 'candidate_count': len(candidates[0][1])}

    def result(self, identity: str, method: str) -> dict:
        p = self.profiles[identity]
        return {'resolved_name': p['name'], 'rijal_id': identity, 'grade_ar': p['grade_ar'], 'grade_tier': p['tier'], 'reliability': p['score'], 'death_ah': p['death'], 'method': method}


def calibrate_chain(nodes: list[dict]) -> tuple[str, float]:
    paths = defaultdict(list)
    for node in nodes:
        paths[node.get('path', 0)].append(node)
    if not paths:
        return 'Ungraded', .5
    candidates = []
    for path, members in sorted(paths.items()):
        graded = [n for n in members if n.get('grade_tier', 'Ungraded') != 'Ungraded']
        if not graded:
            candidates.append((.5, 'Ungraded'))
        else:
            weakest = min(graded, key=lambda n: TIERS[n['grade_tier']])
            candidates.append((TIERS[weakest['grade_tier']], weakest['grade_tier']))
    score, tier = max(candidates, key=lambda pair: pair[0])
    return tier, score
