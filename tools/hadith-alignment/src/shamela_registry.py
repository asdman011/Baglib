"""Requested primary editions; validation is based on observed dataset rows."""
from dataclasses import dataclass

from .loaders import LK_COLUMNS

DATASET = 'mhaamh19/shamela_books_text_full'
PAGE_COLUMNS = ['serial_number', 'category_id', 'category', 'book_title', 'book_id', 'edition', 'publisher', 'page_number', 'volume_number', 'text', 'foot_note']
SHAMELA_COLUMNS = [
    'Arabic_Tafseel', 'Shamela_Matn_Book_ID', 'Shamela_Matn_Title',
    'Shamela_Matn_Edition_Publisher', 'Shamela_Matn_Vol_Page',
    'Shamela_Sharh_Book_ID', 'Shamela_Sharh_Title',
    'Shamela_Sharh_Edition_Publisher', 'Shamela_Sharh_Vol_Page',
    'Shamela_Sharh_Footnote', 'Tafseel_Match_Score', 'Tafseel_Match_Method',
]
CORPUS_COLUMNS = LK_COLUMNS + SHAMELA_COLUMNS


@dataclass(frozen=True)
class BookPair:
    matn_id: str
    sharh_id: str
    matn_title_key: str
    sharh_title_key: str
    lk_aliases: tuple[str, ...] = ()
    tahqiq: bool = False


REGISTRY = {
    'Bukhari': BookPair('1681', '1673', 'البخاري', 'فتح الباري', ('Bukhari',)),
    'Muslim': BookPair('1727', '1711', 'مسلم', 'مسلم', ('Muslim',)),
    'AbuDaud': BookPair('1726', '5760', 'داود', 'عون المعبود', ('AbuDaud',)),
    'Tirmidhi': BookPair('1435', '21662', 'الترمذي', 'تحفة الأحوذي', ('Tirmidhi', 'Tirmizi')),
    'Nesai': BookPair('829', '522', 'النسائي', 'النسائي', ('Nesai',)),
    'IbnMajah': BookPair('1198', '9810', 'ماجه', 'ماجه', ('IbnMajah', 'IbnMaja')),
    'MuwattaMalik': BookPair('1699', '6684', 'موطأ', 'المنتقى'),
    'MusnadAhmad': BookPair('25794', '124910', 'أحمد', 'الفتح الرباني', tahqiq=True),
    'SunanDarimi': BookPair('21795', '912', 'الدارمي', 'الدارمي', tahqiq=True),
}


def target_ids(books: list[str]) -> set[str]:
    return {identity for book in books for identity in (REGISTRY[book].matn_id, REGISTRY[book].sharh_id)}
