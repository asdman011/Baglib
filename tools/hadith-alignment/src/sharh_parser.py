"""Classical commentary units retain page spans and separate source footnotes."""
import re

from .shamela_parser import Unit, parse_units, plain_offsets, volume_key


def parse_sharh(pages: list[dict[str, str]]) -> tuple[list[Unit], dict]:
    if pages and pages[0]['book_id'] == '551':
        from .zurqani_parser import parse_zurqani
        return parse_zurqani(pages)
    # Hady al-Sari has its own numbered prose lists. They are not the numbered
    # running commentary of Fath al-Bari and can otherwise steal Hadith 1.
    selected = [p for p in pages if not (p['book_id'] == '1673' and volume_key(p['volume_number'])[0] == 0)]
    units, stats = parse_units(selected, commentary=True)
    stats['excluded_introductory_rows'] = len(pages) - len(selected)
    return units, stats


def lemmas(unit: Unit) -> list[str]:
    # Match vocalized قَوْلُهُ as well as unvocalized text; only temporary keys
    # are stripped, while exported source passages retain their exact characters.
    plain, _ = plain_offsets(unit.text)
    return re.findall(r'قوله\s*(?:\[\s*\d+\s*\])?\s*[:：]?\s*[（(«\["]([^）)»\]\"]{10,800})[）)»\]\"]', plain)
