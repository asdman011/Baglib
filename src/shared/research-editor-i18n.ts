/** Centralized editor dictionary, also exposed by renderer/translations.ts. */
export const researchEditorTranslations = {
  en: {
    reCitation: 'Source citation', reBibliography: 'Bibliography', reContents: 'Table of contents', reFootnotes: 'Footnotes', reSettings: 'Scholarly settings', reStyle: 'Bibliography style', reArabicStyle: 'Arabic scholarly', reChicago: 'Chicago', reAPA: 'APA', rePlacement: 'Quran citation placement', reInline: 'Inline', reFootnote: 'Footnote', reNumbering: 'Footnote numbering', reChapter: 'Per chapter', rePage: 'Per page (PDF export)', rePagePending: 'Page numbering takes effect with paginated PDF export. The editor uses chapter numbering.', reHeadingNumbering: 'Number headings', reEmpty: 'No entries yet', reNoDate: 'n.d.', reOpenSource: 'Open source', reSave: 'Save settings', reSaved: 'Settings saved', reError: 'Could not save settings', reInsertCitation: 'Insert citation', reSourceText: 'Source text',
  },
  ar: {
    reCitation: 'توثيق مصدر', reBibliography: 'قائمة المراجع', reContents: 'جدول المحتويات', reFootnotes: 'الحواشي', reSettings: 'إعدادات التوثيق', reStyle: 'نمط المراجع', reArabicStyle: 'التوثيق العربي', reChicago: 'شيكاغو', reAPA: 'APA', rePlacement: 'موضع توثيق القرآن', reInline: 'داخل النص', reFootnote: 'في الحاشية', reNumbering: 'ترقيم الحواشي', reChapter: 'لكل فصل', rePage: 'لكل صفحة (تصدير PDF)', rePagePending: 'يُطبّق ترقيم الصفحات عند تصدير PDF المقسّم إلى صفحات. يستخدم المحرر الترقيم لكل فصل.', reHeadingNumbering: 'ترقيم العناوين', reEmpty: 'لا توجد عناصر بعد', reNoDate: 'د.ت.', reOpenSource: 'فتح المصدر', reSave: 'حفظ الإعدادات', reSaved: 'حُفظت الإعدادات', reError: 'تعذر حفظ الإعدادات', reInsertCitation: 'إدراج توثيق', reSourceText: 'نص المصدر',
  },
};
export const researchEditorLabels = (lang: string) => researchEditorTranslations[lang === 'ar' ? 'ar' : 'en'];
