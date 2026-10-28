"""Verified corrected primary registry: 18 roles, 16 distinct books."""
from dataclasses import dataclass


@dataclass(frozen=True)
class MasterBook:
    matn: str
    commentary: str
    title_key: str
    author: str
    mode: str = 'sharh'


MASTER_REGISTRY = {
    'Bukhari': MasterBook('1681', '1673', 'فتح الباري', 'أحمد بن علي بن حجر العسقلاني'),
    'Muslim': MasterBook('1727', '1711', 'مسلم', 'يحيى بن شرف النووي'),
    'AbuDaud': MasterBook('1726', '5760', 'عون المعبود', 'محمد أشرف العظيم آبادي؛ حاشية ابن القيم'),
    'Tirmidhi': MasterBook('1435', '21662', 'تحفة الأحوذي', 'محمد عبد الرحمن المباركفوري'),
    'Nesai': MasterBook('829', '522', 'النسائي', 'نور الدين السندي'),
    'IbnMajah': MasterBook('1198', '9810', 'ماجه', 'نور الدين السندي'),
    'MuwattaMalik': MasterBook('1699', '551', 'الزرقاني', 'محمد بن عبد الباقي الزرقاني'),
    'MusnadAhmad': MasterBook('25794', '25794', 'أحمد', 'شعيب الأرنؤوط؛ عادل مرشد وآخرون', 'inline'),
    'SunanDarimi': MasterBook('21795', '21795', 'الدارمي', 'حسين سليم أسد الداراني', 'inline'),
}
CORRECTIONS = [
    {'field': 'Muwatta commentary', 'requested': '7252', 'verified': '551', 'reason': '7252 is منهج القرآن الكريم في دعوة المشركين إلى الإسلام; catalogue and HF 551 identify شرح الزرقاني على الموطأ', 'approval': 'User explicitly approved verified ID corrections'},
    {'field': 'Nesai Matn', 'requested': '5764', 'verified': '829', 'reason': '5764 absent from the pinned dataset; 829 title/category/pages verified in the preceding extraction', 'approval': 'User explicitly approved verified ID corrections'},
    {'field': 'Ahmad/Darimi commentary category', 'requested': '7', 'verified': '6', 'reason': 'These roles use editorial notes of the same Matn editions, not separate Sharh books'},
]
