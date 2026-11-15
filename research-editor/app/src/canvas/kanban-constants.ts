export const DEFAULT_KANBAN_TASKS = {
  ar: [
    'مراجعة تخريج الأحاديث والأسانيد',
    'تحقيق نسبة الأبيات الشعرية وضبط العروض',
    'مقارنة نصوص المخطوط مع النسخ المطبوعة',
  ],
  en: [
    'Review Hadith Takhrij and Narrator Chains',
    'Verify Poetry Attributions and Meter',
    'Compare Manuscript Text with Printed Copies',
  ],
} as const;

export const DEFAULT_KANBAN_TITLES = {
  ar: 'مهام البحث والتحقيق',
  en: 'Research Tasks',
} as const;
