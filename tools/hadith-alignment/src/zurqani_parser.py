"""Observed 551 format: quoted Matn, tatweel separator, dual reference numbers."""
from bisect import bisect_right
from collections import Counter
import re

from .normalizer import present
from .shamela_parser import DIGITS, Unit, plain_offsets


def parse_zurqani(pages):
    selected = [p for p in pages if present(p['text'])]
    offsets, fragments, cursor, chain_positions = [], [], 0, []
    for page in selected:
        if fragments and not fragments[-1].endswith('\n'):
            fragments.append('\n')
            cursor += 1
        offsets.append((cursor, cursor+len(page['text']), page))
        fragments.append(page['text'])
        plain, positions = plain_offsets(page['text'])
        for m in re.finditer(r'(?<!\w)(?:قال\s+)?و?حدثني\s+(?:\w+\s+){0,5}?عن\s+مالك\b', plain):
            chain_positions.append(cursor + positions[m.start()])
        cursor += len(page['text'])
    text = ''.join(fragments)
    # The separator and both numbers distinguish entry anchors from prose dates.
    separators = list(re.finditer(r'ـ{10,}', text))
    if not separators:
        raise ValueError('Zurqani 551 has no observed tatweel/dual-number entry anchors; adapter review required')
    entries, previous_marker_end, unverified_prefixes = [], 0, 0
    numbered = 0
    for marker_index, marker in enumerate(separators):
        index = bisect_right(chain_positions, marker.start()) - 1
        start = chain_positions[index] if index >= 0 and chain_positions[index] >= previous_marker_end else -1
        if start < 0:
            # Preserve the numbered commentary itself when the quoted Matn crosses
            # a format not recognized as a chain. Do not invent a chain boundary.
            paragraph = text.rfind('\n', previous_marker_end, marker.start()) + 1
            start = paragraph if paragraph > previous_marker_end else marker.start()
            unverified_prefixes += 1
        block_end = separators[marker_index+1].start() if marker_index+1 < len(separators) else len(text)
        prefix = text[marker.end():min(block_end, marker.end()+300)]
        pair = re.search(r'(?<!\d)(\d+)\s*[-–]\s*(\d+)(?:\s*[-–])?', prefix)
        number = pair[2].translate(DIGITS) if pair else ''
        numbered += pair is not None
        entries.append((start, number))
        previous_marker_end = marker.end()
    entries.sort()
    units, row_owners = [], Counter()
    for i, (start, number) in enumerate(entries):
        end = entries[i+1][0] if i+1 < len(entries) else len(text)
        unit = Unit(number, '', '', '', '', anchor='zurqani_dual_number')
        for row_start, row_end, page in offsets:
            low, high = max(start, row_start), min(end, row_end)
            if low >= high:
                continue
            fragment = page['text'][low-row_start:high-row_start]
            if unit.text and not unit.text.endswith('\n'):
                unit.text += '\n'
            unit.text += fragment
            unit.pages.append(page)
            unit.spans.append({'serial_number': page['serial_number'], 'start': low-row_start, 'end': high-row_start})
            row_owners[page['serial_number']] += 1
        if unit.pages:
            units.append(unit)
    unresolved = []
    for unit in units:
        for page in unit.pages:
            if present(page['foot_note']):
                if row_owners[page['serial_number']] == 1:
                    unit.footnotes.append(page['foot_note'])
                else:
                    unresolved.append({'serial_number': page['serial_number'], 'foot_note': page['foot_note'], 'units_on_page': row_owners[page['serial_number']]})
    return units, {'pages': len(pages), 'numbered_units': numbered, 'zurqani_separator_units': len(units), 'zurqani_dual_number_units': numbered, 'prefix_boundary_needs_review': unverified_prefixes, 'max_unit_chars': max(map(lambda u: len(u.text), units), default=0), 'max_source_rows_per_unit': max(map(lambda u: len(u.pages), units), default=0), 'unassigned_footnotes': unresolved}
