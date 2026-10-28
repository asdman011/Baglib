"""Conservative attribution boundaries; ambiguous chains remain unsplit."""
import re


def split_isnad_matn(text: str) -> tuple[str, str]:
    # Match against a marks-free view while mapping boundaries to original offsets.
    plain, offsets = [], []
    for i, character in enumerate(text):
        if not re.match(r'[\u0617-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]', character):
            plain.append(character)
            offsets.append(i)
    key = ''.join(plain)
    transition = re.search(r'(?:أن\s+رسول\s+الله|قال\s+رسول\s+الله|عن\s+النبي|أن\s+النبي|قال\s+النبي)', key)
    if transition:
        boundary = offsets[transition.start()]
        return text[:boundary], text[boundary:]
    # Final قال is used only with explicit punctuation and preceding transmission.
    candidates = list(re.finditer(r'قال\s*[:：]', key))
    if candidates and re.search(r'حدثنا|أخبرنا|حدثني|أخبرني|\bعن\b', key[:candidates[-1].start()]):
        boundary = offsets[candidates[-1].end()] if candidates[-1].end() < len(offsets) else len(text)
        return text[:boundary], text[boundary:]
    return '', text


GRADE = re.compile(r'((?:حديث|إسناده|اسناده|رجاله)\s+(?:صحيح|حسن|ضعيف|قوي|موضوع|منكر|مرسل|موقوف|مقطوع)(?:\s+لغيره|\s+على شرط الشيخين|\s+على شرط البخاري|\s+على شرط مسلم|\s+جدا)?[^.\n]*)')


def extract_grade(note: str) -> tuple[str, str]:
    # Keep the original clause with all qualifiers; don't equate رجال صحيح with حديث صحيح.
    match = GRADE.search(note)
    if not match:
        return '', ''
    clause = match[1].strip()
    if clause.startswith('رجاله'):
        return clause, ''
    ruling = re.search(r'صحيح|حسن|ضعيف|قوي|موضوع|منكر|مرسل|موقوف|مقطوع', clause)[0]
    english = {'صحيح': 'Sahih', 'حسن': 'Hasan', 'ضعيف': "Da'if", 'موضوع': "Mawdu'"}.get(ruling, '')
    return clause, english
