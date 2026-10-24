export const SUNNAH_COLLECTION_IDS = ['Bukhari', 'Muslim', 'AbuDaud', 'Tirmizi', 'Nesai', 'IbnMaja'] as const;

export type SunnahCollectionId = typeof SUNNAH_COLLECTION_IDS[number];
export type SunnahLanguage = 'ar' | 'en';
export type SunnahText = Record<SunnahLanguage, string>;

export interface SunnahPassage {
  full: string;
  isnad: string;
  matn: string;
}

export interface SunnahHadith {
  id: string;
  number: string;
  section: { number: string; title: SunnahText };
  text: Record<SunnahLanguage, SunnahPassage>;
  comment: string;
  grade: SunnahText;
}

export interface SunnahChapterSummary {
  number: number;
  title: SunnahText;
  hadithCount: number;
}

export interface SunnahChapter extends SunnahChapterSummary {
  collection: SunnahCollectionId;
  hadiths: SunnahHadith[];
}

export interface SunnahCatalog {
  version: 1;
  sha256: string;
  importedAt: string;
  hadithCount: number;
  collections: {
    id: SunnahCollectionId;
    hadithCount: number;
    chapters: SunnahChapterSummary[];
  }[];
}

export type SunnahResult<T> = { ok: true; data: T } | { ok: false; error: 'unavailable' | 'invalid-corpus' | 'read-failed' };

export interface SunnahAPI {
  share: (text: string) => Promise<SunnahResult<null>>;
  catalog: () => Promise<SunnahResult<SunnahCatalog | null>>;
  importCorpus: () => Promise<SunnahResult<SunnahCatalog | null>>;
  chapter: (collection: SunnahCollectionId, number: number) => Promise<SunnahResult<SunnahChapter>>;
}
