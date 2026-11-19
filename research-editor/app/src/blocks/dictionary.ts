const dictionaries = {
  ar: { ayah: 'آية قرآنية', hadith: 'حديث نبوي', verse: 'أبيات شعرية', 'book-quote': 'اقتباس كتاب', dictionary: 'المعجم', people: 'الأعلام والرواة', wikipedia: 'ويكيبيديا', scholar: 'عالم', narrator: 'راوٍ', wikiAr: 'العربية', wikiEn: 'English', offline: 'لا يوجد اتصال بالإنترنت', search: 'ابحث في مصادر مكتبتك', loading: 'جارٍ البحث…', empty: 'لا توجد نتائج', error: 'تعذر البحث', close: 'إغلاق', insert: 'إدراج', open: 'فتح المصدر', group: 'مصادر BagLib' },
  en: { ayah: 'Quran ayah', hadith: 'Hadith', verse: 'Poetry passage', 'book-quote': 'Book quote', dictionary: 'Dictionary', people: 'People', wikipedia: 'Wikipedia', scholar: 'Scholar', narrator: 'Narrator', wikiAr: 'Arabic', wikiEn: 'English', offline: 'No internet connection', search: 'Search your library sources', loading: 'Searching…', empty: 'No results', error: 'Search failed', close: 'Close', insert: 'Insert', open: 'Open source', group: 'BagLib sources' },
};
export const sourceLabels = () => dictionaries[document.documentElement.lang === 'ar' ? 'ar' : 'en'];
export const sourceAliases = {
  ayah: ['ayah', 'quran', 'آية', 'اية', 'قرآن', 'قران'],
  hadith: ['hadith', 'sunnah', 'حديث', 'سنة', 'سنه'],
  verse: ['poetry', 'verse', 'poem', 'شعر', 'أبيات', 'ابيات', 'قصيدة'],
  'book-quote': ['book', 'quote', 'library', 'كتاب', 'اقتباس', 'مكتبة'],
  dictionary: ['dictionary', 'dict', 'معجم', 'قاموس', 'المعجم', 'القاموس'],
  people: ['people', 'person', 'scholars', 'scholar', 'narrators', 'narrator', 'علماء', 'عالم', 'رواة', 'راوي', 'رجال', 'أعلام', 'اعلام'],
  wikipedia: ['wikipedia', 'wiki', 'ويكيبيديا', 'ويكي'],
};
