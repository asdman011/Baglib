"""Page ordering and explicit structural anchors with original source spans."""
from collections import Counter
from dataclasses import dataclass, field
import re

from .isnad_matn_splitter import extract_grade, split_isnad_matn
from .loaders import LK_COLUMNS
from .normalizer import present

DIGITS = str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')
MARKS = re.compile(r'[\u0617-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]')


def integer(value: str) -> int:
    text = value.translate(DIGITS).strip()
    if text.casefold() in ('', 'none', 'nan', 'null'):
        return 0
    if not text.isdigit():
        raise ValueError(f'Expected an integer page/serial number, found {value!r}')
    return int(text)


def volume_key(value: str) -> tuple[int, int]:
    text = value.translate(DIGITS).strip()
    if not text or 'مقدمة' in text:
        return (0, 0)
    match = re.search(r'\d+', text)
    if not match:
        raise ValueError(f'Unrecognized volume number {value!r}')
    rest = text[match.end():].strip()
    # Preserve sub-part ordering without collapsing two physical volumes into one.
    part = {'أ': 1, 'ا': 1, 'ب': 2, 'ج': 3}.get(rest, 0)
    return (int(match[0]), part)


def order_pages(pages: list[dict[str, str]], book_id: str) -> tuple[list[dict[str, str]], int]:
    serials = [p['serial_number'] for p in pages]
    if len(serials) != len(set(serials)):
        raise ValueError(f'Duplicate page serials in book {book_id}')
    excluded = sum(book_id == '25794' and volume_key(p['volume_number'])[0] > 45 for p in pages)
    selected = [p for p in pages if not (book_id == '25794' and volume_key(p['volume_number'])[0] > 45)]
    return sorted(selected, key=lambda p: (volume_key(p['volume_number']), integer(p['page_number']), integer(p['serial_number']))), excluded


def location(page: dict[str, str]) -> str:
    return f"v{page['volume_number']}:p{page['page_number']}:s{page['serial_number']}"


@dataclass
class Unit:
    number: str
    chapter_number: str
    chapter: str
    section_number: str
    section: str
    text: str = ''
    pages: list[dict[str, str]] = field(default_factory=list)
    spans: list[dict] = field(default_factory=list)
    footnotes: list[str] = field(default_factory=list)
    anchor: str = 'numbered'

    @property
    def footnote(self) -> str:
        return '\n'.join(self.footnotes)

    @property
    def start(self) -> dict[str, str]:
        return self.pages[0]


def plain_offsets(text: str) -> tuple[str, list[int]]:
    chars, positions = [], []
    for i, character in enumerate(text):
        if MARKS.fullmatch(character):
            continue
        chars.append(' ' if character in '\u200c\u200d\u200e\u200f\ufeff' else character.translate(DIGITS))
        positions.append(i)
    return ''.join(chars), positions


TRANSMISSION = r'(?:و?حدث\w*|و?أخبر\w*|و?اخبر\w*|و?أنبأ\w*|و?عن\b|و?قال\b|و?أن\b|و?سمعت\b|قوله\b|وعنه\b)'
INLINE_NUMBER = re.compile(r'(?<!\S)(?:(?P<square>\[\s*(?:حديث\s*(?:رقم\s*)?)?(?P<sqnum>\d{1,6})\s*\])|(?P<bare>\d{1,6})\s*[-–]\s*(?:\(\s*\d+\s*\)\s*)?(?=' + TRANSMISSION + r')|\(\s*(?P<paren>\d{1,6})\s*\)\s*(?=' + TRANSMISSION + r'))')
INLINE_HEADER = re.compile(r'(?<!\S)(?:(?:\(\s*(\d+)\s*\)|(\d+))\s*[-–.]?\s*)?\(?(كتاب|مسند|باب)\b')


def events_for_page(text: str, commentary: bool = False, book_id: str = '', wide_matn: bool = False) -> list[tuple[int, str, str, str]]:
    plain, offsets = plain_offsets(text)
    numbered = []
    for m in INLINE_NUMBER.finditer(plain):
        # Inspected primary Matn editions use N - transmission. Parenthesized
        # prose lists in Ahmad's introduction are not canonical Hadith numbers.
        if not commentary and not m['bare'] and 'حديث' not in m[0]:
            continue
        # Al-Muntaqa has no canonical numbered commentary sequence. Its isolated
        # prose-list ordinals must not absorb hundreds of subsequent page rows.
        if commentary and book_id == '6684':
            continue
        number = m['sqnum'] or m['bare'] or m['paren']
        # Quran citations [سورة: 12] aren't this pattern; an explicit numeric
        # bracket is retained as an edition anchor, then text-verified at alignment.
        numbered.append((offsets[m.start()], 'number', number, ''))
    if wide_matn:
        # After the observed canonical start, source numbers also introduce
        # قرأت / قرئ / وجدت, bracketed compiler additions and abbreviated chains.
        # Do not require every narration to begin with حدثنا.
        reference = r'(\d{1,6}(?:\s*/\s*[\dأ-يa-z]+)?(?:\s*و\s*\d{1,6})?)'
        wide_pattern = r'(?<![\w/])' + reference + r'(?:\s*(?:\(\s*\d+\s*\)\s*)?[-–]\s*|\s+(?=' + TRANSMISSION + r'))'
        numbered = [(offsets[m.start()], 'number', m[1], '') for m in re.finditer(wide_pattern, plain)]
    headings = []
    heading_ends = []
    for m in INLINE_HEADER.finditer(plain):
        start = offsets[m.start()]
        # Admit page/line starts and Shamela's observed zero-width heading markers.
        line_start = text.rfind('\n', 0, start) + 1
        prefix = text[line_start:start]
        marker = max(prefix.rfind('\u200c'), prefix.rfind('\u200d'))
        tail = prefix[marker + 1:] if marker >= 0 else prefix
        if MARKS.sub('', tail).strip(' \t\r()[]-–0123456789٠١٢٣٤٥٦٧٨٩'):
            continue
        ends = [pos for pos, *_ in numbered if pos > start]
        newline = text.find('\n', start)
        if newline >= 0:
            ends.append(newline)
        next_marker = text.find('\u200c', offsets[m.end()-1]+1)
        if next_marker >= 0:
            ends.append(next_marker)
        end = min(ends) if ends else len(text)
        heading = text[start:end].strip()
        if len(heading) <= 250:
            headings.append((start, 'header', m[1] or m[2] or '', m[3]))
            if end < len(text):
                heading_ends.append(end)
    # Avoid interpreting an ordinal in '(1) باب ...' as a hadith. Bare numeric
    # anchors only qualify when followed by a transmission/attribution word.
    events = {event[0]: event for event in [*numbered, *headings]}
    for end in heading_ends:
        events.setdefault(end, (end, 'continue', '', ''))
    return sorted(events.values())


def parse_units(pages: list[dict[str, str]], commentary: bool = False) -> tuple[list[Unit], dict]:
    units = []
    active = None
    chapter_number = section_number = chapter = section = ''
    chapters = sections = 0
    stats = Counter()
    unresolved_notes = []
    canonical_start = None
    if not commentary and pages and pages[0]['book_id'] in {'1699', '25794', '21795'}:
        for page_index, page in enumerate(pages):
            starts = [e[0] for e in events_for_page(page['text'], False, page['book_id']) if e[1] == 'number' and e[2] == '1']
            if starts:
                canonical_start = (page_index, starts[0])
                break
    for page_index, page in enumerate(pages):
        if canonical_start is not None and page_index < canonical_start[0]:
            stats['excluded_pre_corpus_rows'] += 1
        if active is not None and active.anchor == 'lemma_page':
            active = None
        text = page['text']
        if not present(text):
            stats['missing_text_pages'] += 1
            continue
        page_units = []
        events = events_for_page(text, commentary, page['book_id'], wide_matn=canonical_start is not None)
        if canonical_start is not None:
            events = [e for e in events if e[1] != 'number' or (page_index, e[0]) >= canonical_start]
        boundaries = [(0, 'continue', '', '')] if not events or events[0][0] > 0 else []
        boundaries += events
        for event_index, (start, kind, number, header_kind) in enumerate(boundaries):
            end = boundaries[event_index + 1][0] if event_index + 1 < len(boundaries) else len(text)
            segment = text[start:end]
            if kind == 'header':
                active = None
                if header_kind in ('كتاب', 'مسند'):
                    chapters += 1
                    chapter_number, chapter = number or str(chapters), segment.strip()
                    section_number = section = ''
                    sections = 0
                else:
                    sections += 1
                    section_number, section = number or str(sections), segment.strip()
                stats['headers'] += 1
                continue
            if kind == 'number':
                active = Unit(number, chapter_number, chapter, section_number, section)
                units.append(active)
                stats['numbered_units'] += 1
            if active is None and commentary and 'قوله' in MARKS.sub('', segment) and volume_key(page['volume_number'])[0] > 0:
                active = Unit('', chapter_number, chapter, section_number, section, anchor='lemma_page')
                units.append(active)
                stats['lemma_page_units'] += 1
            if active is not None:
                new_page = bool(active.pages and active.pages[-1]['serial_number'] != page['serial_number'])
                if new_page and active.text and not active.text.endswith('\n'):
                    active.text += '\n'
                active.text += segment
                active.spans.append({'serial_number': page['serial_number'], 'start': start, 'end': end})
                if not active.pages or new_page:
                    active.pages.append(page)
                if all(u is not active for u in page_units):
                    page_units.append(active)
        if present(page['foot_note']):
            if len(page_units) == 1:
                page_units[0].footnotes.append(page['foot_note'])
            else:
                unresolved_notes.append({'serial_number': page['serial_number'], 'units_on_page': len(page_units), 'foot_note': page['foot_note']})
                stats['ambiguous_footnote_pages'] += 1
    number_counts = Counter(u.number for u in units if u.number)
    stats['duplicate_number_occurrences'] = sum(n - 1 for n in number_counts.values())
    stats['max_source_rows_per_unit'] = max((len(u.pages) for u in units), default=0)
    # References can be duplicated in a source; no unit/row is deduplicated.
    return units, {**dict(stats), 'pages': len(pages), 'unassigned_footnotes': unresolved_notes}


def hadith_and_notes(unit: Unit) -> tuple[str, str]:
    marker = re.search(r'\[\s*تعليق المحقق\s*\]', unit.text)
    if marker:
        body, inline = unit.text[:marker.start()], unit.text[marker.start():]
        return body, '\n\n'.join(x for x in [inline, unit.footnote] if present(x))
    return unit.text, unit.footnote


def base_rows(units: list[Unit]) -> tuple[list[dict[str, str]], dict]:
    result = []
    split_count = grades = 0
    for unit in units:
        if not unit.number:
            continue
        body, notes = hadith_and_notes(unit)
        isnad, matn = split_isnad_matn(body)
        arabic_grade, english_grade = extract_grade(notes)
        split_count += bool(isnad)
        grades += bool(arabic_grade)
        record = dict.fromkeys(LK_COLUMNS, '')
        record.update(Chapter_Number=unit.chapter_number, Chapter_Arabic=unit.chapter, Section_Number=unit.section_number, Section_Arabic=unit.section, Hadith_number=unit.number, Arabic_Hadith=body, Arabic_Isnad=isnad, Arabic_Matn=matn, Arabic_Comment=notes, Arabic_Grade=arabic_grade, English_Grade=english_grade)
        result.append(record)
    return result, {'isnad_splits': split_count, 'extracted_grade_clauses': grades, 'segmentation_is_heuristic': True}
