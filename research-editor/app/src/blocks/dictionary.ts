const dictionaries = {
  ar: { ayah: 'آية قرآنية', hadith: 'حديث نبوي', verse: 'أبيات شعرية', 'book-quote': 'اقتباس كتاب', search: 'ابحث في مصادر مكتبتك', loading: 'جارٍ البحث…', empty: 'لا توجد نتائج', error: 'تعذر البحث', close: 'إغلاق', insert: 'إدراج', open: 'فتح المصدر', group: 'مصادر BagLib' },
  en: { ayah: 'Quran ayah', hadith: 'Hadith', verse: 'Poetry passage', 'book-quote': 'Book quote', search: 'Search your library sources', loading: 'Searching…', empty: 'No results', error: 'Search failed', close: 'Close', insert: 'Insert', open: 'Open source', group: 'BagLib sources' },
};
export const sourceLabels = () => dictionaries[document.documentElement.lang === 'ar' ? 'ar' : 'en'];
export const sourceAliases = {
  ayah: ['ayah', 'quran', 'آية', 'اية', 'قرآن', 'قران'],
  hadith: ['hadith', 'sunnah', 'حديث', 'سنة', 'سنه'],
  verse: ['poetry', 'verse', 'poem', 'شعر', 'أبيات', 'ابيات', 'قصيدة'],
  'book-quote': ['book', 'quote', 'library', 'كتاب', 'اقتباس', 'مكتبة'],
};
