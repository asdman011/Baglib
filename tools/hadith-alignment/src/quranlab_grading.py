"""Parse attributed grade strings into scoped judgments.

Every raw string is kept. A string gets Arabic only when all of it is explained by
the reviewed glossary; anything else stays raw with an explicit review state, and no
term is folded into a strength scale. `family` only flags that wording differs.
"""
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re

GLOSSARY_VERSION = 'quranlab-grade-glossary-v1'
REFERENCE = Path(__file__).resolve().parent.parent / 'reference'


def load_graders(path=REFERENCE / 'quranlab_graders.json'):
    return {entry['raw']: entry for entry in json.loads(Path(path).read_text(encoding='utf-8'))['graders']}


def load_glossary(path=REFERENCE / 'quranlab_grade_glossary.json'):
    return json.loads(Path(path).read_text(encoding='utf-8'))


@dataclass(frozen=True)
class ParsedGrade:
    grade_raw: str
    grade_ar: str | None
    scope: str
    family: str
    references: tuple
    review_status: str
    note: str = ''


CITATION = re.compile(r'(Sahih (?:Bukhari|Muslim))((?:\s*\(\s*[\d\s,،/-]*\)?(?:\s*After\s*\(?\s*\d+\s*\)?|\s*Mukhtasar\))?)+)?', re.I)
NUMBER = re.compile(r'\d+')


def compact(text):
    return re.sub(r'\s+', ' ', text or '').strip()


def parse_citations(raw):
    """`Sahih Muslim (1480)` names where a report is found, so it stays a reference."""
    found = []
    for match in CITATION.finditer(raw):
        found.append({'collection': 'Bukhari' if 'bukhari' in match.group(1).lower() else 'Muslim', 'numbers': NUMBER.findall(match.group(2) or '')})
    return found


def citation_ar(citations):
    parts = []
    for item in citations:
        title = 'صحيح البخاري' if item['collection'] == 'Bukhari' else 'صحيح مسلم'
        parts.append(f"{title} ({'، '.join(item['numbers'])})" if item['numbers'] else title)
    return ' و'.join(parts)


class GradeParser:
    def __init__(self, glossary=None):
        data = glossary or load_glossary()
        self.exact = {compact(entry['en']).casefold(): entry for entry in data['terms']}
        self.ar_exact = {compact(entry['ar']): entry for entry in data['terms'] if entry.get('ar')}
        for entry in data.get('arabic_only', ()):
            self.ar_exact[compact(entry['ar'])] = entry
        self.english_context = {compact(entry['raw']).casefold(): entry for entry in data.get('hadeethenc_english', ())}

    def parse(self, raw):
        text = compact(raw)
        if not text or text == '-':
            return ParsedGrade(raw or '', None, 'unresolved', 'none', (), 'not_a_judgment', 'placeholder without a judgment')
        if re.search(r'[\u0621-\u064A]', text):
            return self.parse_arabic(raw, text)
        entry = self.exact.get(text.casefold())
        if entry:
            return ParsedGrade(raw, entry['ar'], entry['scope'], entry['family'], (), entry.get('status', 'glossary_reviewed'))
        lead = re.match(r'^(Isnaad (?:Sahih|Hasan)|Sahih(?: - )?)?\s*(.*)$', text, re.I)
        citations = parse_citations(text)
        if citations and re.search(r'After|Mukhtasar', text):
            # "After" and "Mukhtasar" qualify the reference; a bare citation would drop that.
            return ParsedGrade(raw, None, 'unresolved', 'unknown', tuple(json.dumps(item, sort_keys=True) for item in citations), 'needs_review', 'qualified reference kept raw')
        if citations:
            prefix = compact(lead.group(1) or '').rstrip('-').strip().casefold()
            remainder = compact(CITATION.sub(' ', text))
            prefix_entry = self.exact.get(prefix) if prefix.startswith('isnaad') else None
            if prefix_entry and compact(remainder.replace(lead.group(1), '', 1)) == '':
                arabic = f"{prefix_entry['ar']}، {citation_ar(citations)}"
                return ParsedGrade(raw, arabic, 'mixed_isnad_and_attribution', prefix_entry['family'], tuple(json.dumps(item, sort_keys=True) for item in citations), 'glossary_reviewed')
            if remainder == '':
                return ParsedGrade(raw, citation_ar(citations), 'transmission_attribution', 'sahih', tuple(json.dumps(item, sort_keys=True) for item in citations), 'glossary_reviewed')
        return ParsedGrade(raw, None, 'unresolved', 'unknown', tuple(json.dumps(item, sort_keys=True) for item in citations), 'needs_review', 'wording outside the glossary')

    def parse_arabic(self, raw, text):
        entry = self.ar_exact.get(text)
        if entry:
            return ParsedGrade(raw, text, entry['scope'], entry['family'], (), 'source_arabic')
        # Arabic wording is the original: kept as is, unclassified until reviewed.
        return ParsedGrade(raw, text, 'unresolved', 'unknown', (), 'needs_review', 'qualified or compound Arabic wording kept whole')

    def parse_hadeethenc_english(self, raw):
        entry = self.english_context.get(compact(raw).casefold())
        if entry:
            return ParsedGrade(raw, None, entry['scope'], entry['family'], (), 'needs_review', 'translation of the Arabic grade; the Arabic field is authoritative')
        return ParsedGrade(raw, None, 'unresolved', 'unknown', (), 'needs_review', 'translation of the Arabic grade; the Arabic field is authoritative')


def judgment_id(*parts):
    return hashlib.sha256('\x1f'.join(str(part) for part in parts).encode('utf-8')).hexdigest()[:24]


ACCEPTED = {'sahih', 'hasan', 'hasan_sahih', 'qawi'}
REJECTED = {'daif', 'daif_jiddan', 'mawdu', 'batil', 'munkar', 'shadh'}


def compare_judgments(judgments):
    """Report differences only inside one scope. Nothing here picks a winner.

    A chain ruling and a ruling on the report are different claims, so they are
    never compared with each other. These two sets exist for this flag alone.
    """
    scopes = {}
    for judgment in judgments:
        if judgment['family'] in {'none', 'unknown'}:
            continue
        scope = {'hadith': 'hadith', 'isnad': 'isnad', 'mixed_isnad_and_attribution': 'isnad'}.get(judgment['scope'])
        if scope:
            scopes.setdefault(scope, set()).add(judgment['family'])
    wording = any(len(values) > 1 for values in scopes.values())
    opposed = any(values & ACCEPTED and values & REJECTED for values in scopes.values())
    return wording, opposed
