import type { SunnahCatalog, SunnahChapterSummary, SunnahCollectionId } from './types/sunnah';
import { normalizeArabicText } from './utils/text-normalizer';

export interface SunnahSubject {
  key: string;
  title: string;
  hadiths: number;
  chapters: (SunnahChapterSummary & { collection: SunnahCollectionId })[];
}

/** Compares titles without changing them: "كتابُ الصَّلاة" and "كتاب الصلاة" are one subject. */
export function subjectKey(title: string): string {
  return normalizeArabicText(title, { normalizeTaaMarbuta: false }).toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/gu, ' ').trim()
    .replace(/^(?:كتاب|كتب|ابواب|باب|(?:the )?book of|chapters on)\s+/u, '');
}

/** Subjects are the collections' own chapter titles, grouped only when the titles match. Nothing is machine-assigned. */
export function sunnahSubjects(catalog: SunnahCatalog, lang: 'ar' | 'en'): SunnahSubject[] {
  const subjects = new Map<string, SunnahSubject>();
  for (const collection of catalog.collections) {
    for (const chapter of collection.chapters) {
      const title = chapter.title[lang] || chapter.title.ar || chapter.title.en;
      const key = subjectKey(chapter.title.ar || chapter.title.en);
      if (!key) continue;
      const subject = subjects.get(key) ?? { key, title, hadiths: 0, chapters: [] };
      subject.hadiths += chapter.hadithCount;
      subject.chapters.push({ ...chapter, collection: collection.id });
      subjects.set(key, subject);
    }
  }
  return [...subjects.values()].sort((first, second) => second.chapters.length - first.chapters.length || second.hadiths - first.hadiths);
}
