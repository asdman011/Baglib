"""Master export contract. SQL adds stable row IDs and collection identity."""
from .loaders import LK_COLUMNS

COMMENTARY_COLUMNS = ['Arabic_Tafseel', 'Matn_Book_ID', 'Matn_Shamela_URL', 'Commentary_Book_ID', 'Commentary_Book_Title', 'Commentary_Author', 'Commentary_Shamela_URL', 'Shamela_Volume', 'Shamela_Page', 'Tafseel_Match_Score', 'Tafseel_Match_Method', 'Source_Row_Reference']
ITQAN_COLUMNS = ['Itqan_Narrator_Chain_JSON', 'Itqan_Weakest_Narrator_Grade', 'Itqan_Chain_Calibration_Score', 'Itqan_Quran_Root_Links_JSON', 'Itqan_Linked_Ayah_Keys_JSON', 'Itqan_Corroborating_Hadiths_JSON']
MASTER_COLUMNS = LK_COLUMNS + COMMENTARY_COLUMNS + ITQAN_COLUMNS
FLOAT_COLUMNS = {'Tafseel_Match_Score', 'Itqan_Chain_Calibration_Score'}
INTEGER_COLUMNS = {'Matn_Book_ID', 'Commentary_Book_ID'}


def book_url(identity: str | int | None) -> str:
    if identity is None or str(identity) == '':
        return ''
    if not str(identity).isdigit():
        raise ValueError('Shamela book identity must be numeric')
    return f'https://shamela.ws/book/{identity}'
