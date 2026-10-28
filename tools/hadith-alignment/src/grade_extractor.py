"""Derived OCR/grade normalization; source clauses remain separately preserved."""
import re

FIXES = {'صحبح': 'صحيح', 'صحيخ': 'صحيح', 'ضعبف': 'ضعيف', 'إجناده': 'إسناده', 'أجناده': 'إسناده', 'إسناذه': 'إسناده', 'الأرنوؤط': 'الأرنؤوط'}
PATTERNS = [
    (r'(?:إسناده|اسناده)\s+صحيح\s+على\s+شرط\s+الشيخين', 'إسناده صحيح على شرط الشيخين', 'Sahih (Bukhari & Muslim standard)'),
    (r'(?:إسناده|اسناده)\s+صحيح\s+على\s+شرط\s+البخاري', 'إسناده صحيح على شرط البخاري', 'Sahih (Bukhari standard)'),
    (r'(?:إسناده|اسناده)\s+صحيح\s+على\s+شرط\s+مسلم', 'إسناده صحيح على شرط مسلم', 'Sahih (Muslim standard)'),
    (r'صحيح\s+لغيره', 'صحيح لغيره', 'Sahih li-ghayrihi'),
    (r'حسن\s+لغيره', 'حسن لغيره', 'Hasan li-ghayrihi'),
    (r'ضعيف\s+جدا', 'ضعيف جدا', "Da'if Jiddan"),
    (r'(?:حديث|إسناده|اسناده)\s+موضوع', 'موضوع', "Mawdu'"),
    (r'(?:حديث|إسناده|اسناده)\s+ضعيف', 'ضعيف', "Da'if"),
    (r'(?:حديث|إسناده|اسناده)\s+حسن', 'حسن', 'Hasan'),
    (r'(?:حديث|إسناده|اسناده)\s+صحيح', 'صحيح', 'Sahih'),
]


def extract_standardized_hadith_grade(text: str, *, bare_label: bool = False) -> dict:
    normalized = re.sub(r'[\u0617-\u061a\u064b-\u065f\u0670\u0640]', '', text)
    for wrong, right in FIXES.items():
        normalized = normalized.replace(wrong, right)
    for pattern, arabic, english in PATTERNS:
        match = re.search(pattern, normalized)
        if match:
            # An explicit negated clause must never be promoted to a positive grade.
            if re.search(r'(?:ليس|غير|لا)\s*$', normalized[max(0, match.start()-12):match.start()]):
                continue
            return {'arabic': arabic, 'english': english, 'matched_clause': match[0], 'source_text': text, 'ocr_corrected': normalized != text}
    if bare_label:
        labels = {"Sahih": 'صحيح', 'Hasan': 'حسن', "Da\'if": 'ضعيف', "Mawdu\'": 'موضوع', 'Hasan Sahih': 'حسن صحيح'}
        if text in labels:
            return {'arabic': labels[text], 'english': text, 'matched_clause': text, 'source_text': text, 'ocr_corrected': False}
    return {}
