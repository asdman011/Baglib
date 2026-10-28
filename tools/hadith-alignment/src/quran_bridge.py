"""Read-only canonical Quran vocabulary plus auditable precomputed morphology."""
from collections import defaultdict
from functools import lru_cache
import math
import re
import sqlite3

from .itqan_sources import load_json, load_map
from .shamela_parser import plain_offsets

SYMBOLS = {'Bukhari': 'خ', 'Muslim': 'م', 'AbuDaud': 'د', 'Tirmidhi': 'ت', 'Nesai': 'ن', 'IbnMajah': 'جه', 'MusnadAhmad': 'حم', 'MuwattaMalik': 'ط', 'SunanDarimi': 'دي'}


def lexical_key(text: str) -> str:
    plain, _ = plain_offsets(text)
    plain = plain.translate(str.maketrans({'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ؤ': 'ء', 'ئ': 'ء'}))
    return re.sub(r'[^\u0621-\u063a\u0641-\u064a\u0629\s]', ' ', plain).strip()


def canonicalize_itqan_alias(root: str, aliases: dict) -> str:
    """Upstream convention only. It is not necessarily Baglib's canonical root."""
    return aliases.get(root, root)


class QuranBridge:
    def __init__(self, itqan_dir, roots_db=None):
        self.aliases = load_map(itqan_dir, 'root_alias_map')
        self.ayahs = defaultdict(set)
        self.vocabulary_source = 'Itqan Hafs roots_index'
        if roots_db and roots_db.exists():
            db = sqlite3.connect(roots_db.resolve().as_uri() + '?mode=ro', uri=True)
            try:
                roots = {row[0]: re.sub(r'\s+', '', row[1]) for row in db.execute('SELECT id,arabic_trilateral FROM roots')}
                for identity, location in db.execute('SELECT root_id,word_location FROM root_words'):
                    ayah = ':'.join(location.split(':')[:2])
                    if identity in roots and re.fullmatch(r'\d+:\d+', ayah):
                        self.ayahs[roots[identity]].add(ayah)
                for value in roots.values():
                    self.ayahs[value]
            finally:
                db.close()
            self.vocabulary_source = str(roots_db.resolve())
        else:
            for root, data in load_json(itqan_dir / 'quran/data/roots_index.json').items():
                self.ayahs[root].update(data['v'])
        self.vocabulary = set(self.ayahs)
        self.by_key = defaultdict(set)
        for root in self.vocabulary:
            self.by_key[lexical_key(root)].add(root)
        self.alias_inverse = defaultdict(set)
        for source, variant in self.aliases.items():
            candidates = self.by_key.get(lexical_key(source), set())
            if len(candidates) == 1:
                self.alias_inverse[lexical_key(variant)].update(candidates)
        self.words = defaultdict(set)
        for word, value in load_json(itqan_dir / 'app/data/word_defs_v2.json').items():
            if isinstance(value, dict):
                canonical = self.to_quran(value.get('r', ''))
                if canonical:
                    self.words[lexical_key(word)].add(canonical)
        self.wensinck = defaultdict(set)
        for root, value in load_json(itqan_dir / 'app/data/wensinck.json').items():
            canonical = self.to_quran(root)
            if canonical:
                for word in value.get('forms', []):
                    self.wensinck[lexical_key(word)].add(canonical)
        # Explicit lexical patches, not a general ة/ه substitution.
        self.patches = {lexical_key(word): root for word, root in {'يوم': 'يوم', 'اليوم': 'يوم', 'أمر': 'أمر', 'الأمر': 'أمر', 'ولي': 'ولي', 'أرض': 'أرض', 'الأرض': 'أرض', 'وقي': 'وقي', 'تقوى': 'وقي', 'التقوى': 'وقي', 'فتنة': 'فتن', 'الفتنة': 'فتن', 'فتن': 'فتن', 'صلاة': 'صلو', 'الصلاة': 'صلو', 'زكاة': 'زكو', 'الزكاة': 'زكو'}.items() if root in self.vocabulary}

    def to_quran(self, value: str) -> str | None:
        if value in self.vocabulary:
            return value
        candidates = self.by_key.get(lexical_key(value), set())
        if len(candidates) == 1:
            return next(iter(candidates))
        inverse = self.alias_inverse.get(lexical_key(value), set())
        return next(iter(inverse)) if len(inverse) == 1 else None

    @lru_cache(maxsize=200000)
    def word_root(self, word: str) -> tuple[str | None, str]:
        key = lexical_key(word)
        variants = [key]
        if len(key) > 4 and key[0] in 'وفبلك':
            variants.append(key[1:])
        for variant in variants:
            if variant in self.patches:
                return self.patches[variant], 'explicit_lexical_patch'
            roots = self.words.get(variant, set())
            if len(roots) == 1:
                return next(iter(roots)), 'itqan_precomputed_morphology'
            roots = self.wensinck.get(variant, set())
            if len(roots) == 1:
                return next(iter(roots)), 'wensinck_form'
        # Conservative light-stemmer fallback; ambiguous candidates stay unresolved.
        stems = set(variants)
        stems.update(v[2:] for v in variants if v.startswith('ال') and len(v) > 4)
        for stem in list(stems):
            for suffix in ('هما', 'كم', 'هم', 'هن', 'نا', 'ون', 'ين', 'ات', 'ه', 'ي'):
                if stem.endswith(suffix) and len(stem) - len(suffix) >= 3:
                    stems.add(stem[:-len(suffix)])
        candidates = {self.to_quran(s) for s in stems if 3 <= len(s) <= 4} - {None}
        return (next(iter(candidates)), 'light_stemmer') if len(candidates) == 1 else (None, 'unresolved')

    def extract(self, matn: str) -> tuple[list[str], list[str], dict, dict]:
        matched = defaultdict(set)
        methods = defaultdict(int)
        for word in re.findall(r'[\u0621-\u063a\u0641-\u065f\u0670\u0629]+', matn):
            root, method = self.word_root(word)
            methods[method] += 1
            if root:
                matched[root].add(word)
        verse_scores = defaultdict(float)
        for root in matched:
            # Root co-occurrence is an index/retrieval signal, never exegesis.
            rarity = math.log(6237 / (len(self.ayahs[root]) + 1))
            for ayah in self.ayahs[root]:
                verse_scores[ayah] += rarity
        verses = sorted(verse_scores, key=lambda a: (-verse_scores[a], tuple(map(int, a.split(':')))))[:20]
        return sorted(matched), verses, {r: sorted(words) for r, words in sorted(matched.items())}, dict(methods)
