import type { ManuscriptKind } from './manuscripts';

export interface ManuscriptTemplate {
  id: string;
  titleKey: string;
  descKey: string;
  defaultKind: ManuscriptKind;
  defaultTitle: { ar: string; en: string };
  chapters: { ar: string; en: string }[];
}

export const MANUSCRIPT_TEMPLATES: ManuscriptTemplate[] = [
  {
    id: 'research-paper',
    titleKey: 'researchTemplateResearchPaper',
    descKey: 'researchTemplateResearchPaperDesc',
    defaultKind: 'research',
    defaultTitle: {
      ar: 'بحث جديد: الإطار النظري والتطبيقي',
      en: 'New Research Paper: Theoretical & Applied Framework',
    },
    chapters: [
      { ar: 'الملخص والمقدمة', en: 'Abstract & Introduction' },
      { ar: 'المبحث الأول: الإطار المفاهيمي', en: 'Section 1: Conceptual Framework' },
      { ar: 'المبحث الثاني: دراسة الأدلة والنصوص', en: 'Section 2: Textual Evidence & Analysis' },
      { ar: 'المبحث الثالث: المناقشة والنتائج', en: 'Section 3: Discussion & Findings' },
      { ar: 'الخاتمة وقائمة المراجع', en: 'Conclusion & Bibliography' },
    ],
  },
  {
    id: 'book-chapter',
    titleKey: 'researchTemplateBookChapter',
    descKey: 'researchTemplateBookChapterDesc',
    defaultKind: 'book',
    defaultTitle: {
      ar: 'كتاب جديد: فصول ودراسات',
      en: 'New Book: Chapters & Studies',
    },
    chapters: [
      { ar: 'توطئة وتمهيد', en: 'Prologue & Preface' },
      { ar: 'الفصل الأول: التأصيل المنهجي', en: 'Chapter 1: Methodological Foundations' },
      { ar: 'الفصل الثاني: التحليل الموضوعي', en: 'Chapter 2: Thematic Analysis' },
      { ar: 'الفصل الثالث: التطبيقات المعاصرة', en: 'Chapter 3: Contemporary Applications' },
      { ar: 'خاتمة الفصل وهوامش البحث', en: 'Chapter Conclusion & Notes' },
    ],
  },
  {
    id: 'thematic-study',
    titleKey: 'researchTemplateThematicStudy',
    descKey: 'researchTemplateThematicStudyDesc',
    defaultKind: 'research',
    defaultTitle: {
      ar: 'دراسة موضوعية: النصوص والشواهد',
      en: 'Thematic Study: Texts & Attestations',
    },
    chapters: [
      { ar: 'المدخل الموضوعي والمفاهيم الأساسية', en: 'Thematic Introduction & Core Concepts' },
      { ar: 'الشواهد القرآنية والسياق الدلالي', en: 'Quranic Attestations & Semantic Context' },
      { ar: 'الروايات والآثار النبوية', en: 'Prophetic Traditions & Historical Reports' },
      { ar: 'الشواهد الشعرية واللغوية', en: 'Poetic & Linguistic Citations' },
      { ar: 'الخلاصات المنهجية', en: 'Methodological Syntheses' },
    ],
  },
  {
    id: 'critical-edition',
    titleKey: 'researchTemplateCriticalEdition',
    descKey: 'researchTemplateCriticalEditionDesc',
    defaultKind: 'book',
    defaultTitle: {
      ar: 'تحقيق مخطوط: النص والشروح',
      en: 'Critical Manuscript Edition (Tahqiq)',
    },
    chapters: [
      { ar: 'مقدمة التحقيق ودراسة عصر المؤلف', en: "Editor's Introduction & Historical Study" },
      { ar: 'وصف النسخ الخطية ورموزها (Sigla)', en: 'Description of Manuscript Witnesses (Sigla)' },
      { ar: 'النص المحقق: القسم الأول', en: 'Critical Text: Part 1' },
      { ar: 'النص المحقق: القسم الثاني وفروق النسخ', en: 'Critical Text: Part 2 & Variant Readings' },
      { ar: 'فهارس الآيات والأحاديث والشواهد', en: 'Indexes: Quran, Hadith & Poetic Citations' },
    ],
  },
];
