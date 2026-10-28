export const SUNNAH_COLLECTION_IDS = ['Bukhari', 'Muslim', 'AbuDaud', 'Tirmizi', 'Nesai', 'IbnMaja'] as const;

export type SunnahCollectionId = typeof SUNNAH_COLLECTION_IDS[number] | 'MuwattaMalik' | 'MusnadAhmad' | 'SunanDarimi';
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
  researchId?: number;
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
  research?: boolean;
}

export interface SunnahResearchNode {
  pos: number; path: number; surface: string; resolved_name: string;
  rijal_id: string | null; grade_ar?: string; method: string;
}
export interface SunnahResearch {
  commentary: string; title: string; author: string; reference: string;
  volume: string; page: string; sourceUrl: string; method: string; score: number;
  nodes: SunnahResearchNode[]; roots: string[]; ayahs: string[];
  calibration: number; weakest: string;
  related: SunnahSearchHit[];
}
export interface SunnahSearchHit {
  chapter: SunnahChapterSummary & { collection: SunnahCollectionId };
  hadith: SunnahHadith;
}
export interface SunnahResearchQuery {
  text?: string; collection?: SunnahCollectionId; chapter?: number;
  root?: string; narratorId?: string;
}

export type SunnahResult<T> = { ok: true; data: T } | { ok: false; error: 'unavailable' | 'invalid-corpus' | 'read-failed' };

export interface SunnahAPI {
  share: (text: string) => Promise<SunnahResult<null>>;
  catalog: () => Promise<SunnahResult<SunnahCatalog | null>>;
  importCorpus: (language?: SunnahLanguage) => Promise<SunnahResult<SunnahCatalog | null>>;
  chapter: (collection: SunnahCollectionId, number: number) => Promise<SunnahResult<SunnahChapter>>;
  research?: (id: number) => Promise<SunnahResult<SunnahResearch>>;
  openSource?: (id: number) => Promise<SunnahResult<null>>;
  search?: (query: SunnahResearchQuery) => Promise<SunnahResult<SunnahSearchHit[]>>;
}
