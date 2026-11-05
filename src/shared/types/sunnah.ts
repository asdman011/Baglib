export const SUNNAH_COLLECTION_IDS = ['Bukhari', 'Muslim', 'AbuDaud', 'Tirmizi', 'Nesai', 'IbnMaja'] as const;

export const SUNNAH_SOURCE_BOOK_IDS = ['Nawawi40', 'Qudsi40', 'Dehlawi40', 'HadeethEnc', 'SourceOnly', 'ReviewQueue'] as const;
export type SunnahCollectionId = typeof SUNNAH_COLLECTION_IDS[number] | 'MuwattaMalik' | 'MusnadAhmad' | 'SunanDarimi' | typeof SUNNAH_SOURCE_BOOK_IDS[number];
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
  /** Present only for a merged database, and never for Bukhari or Muslim. */
  gradingSummary?: { count: number; opposed: boolean; wordingDiffers: boolean; unresolved: number };
  /** English came from an attributed variant because the corpus row has none. */
  translation?: { config: string; partial: boolean };
  /** The record lives in its own book and is not linked to a corpus row. */
  sourceBook?: { kind: 'collection' | 'source_only' | 'review'; collection: string };
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
  merged?: { schemaVersion: number; revision: string };
}

export interface SunnahGradingJudgment {
  id: string; origin: string; graderRaw: string; graderAr: string; graderRole: string; graderStatus: string;
  gradeRaw: string; gradeAlt: string; gradeAr: string; gradeArStatus: 'glossary' | 'source_arabic' | 'unresolved';
  scope: string; reviewStatus: string; assessedPart: string; note: string;
  dataset: string; config: string; fieldPath: string; lineage: string[]; sameLabelAs: string[]; wordingSimilarity: number | null;
}
export interface SunnahVariantText {
  sourceKey: string; config: string; text: string; relation: string; score: number | null;
  englishSimilarity: number | null; license: string; attribution: string;
}
export interface SunnahExplanation {
  sourceKey: string; language: SunnahLanguage; title: string; text: string; explanation: string;
  citation: string; license: string; attribution: string;
}
export interface SunnahFieldSource {
  source: string; dataset: string; revision: string; record: string; transformation: string;
  fields: string[]; unresolved: boolean;
}
export interface SunnahMergedResearch {
  judgments: SunnahGradingJudgment[]; wordingDiffers: boolean; opposed: boolean;
  variants: SunnahVariantText[]; explanations: SunnahExplanation[];
  fieldSources: SunnahFieldSource[]; missingFields: string[]; datasets: string[];
}

export interface SunnahResearchNode {
  pos: number; path: number; surface: string; resolved_name: string;
  rijal_id: string | null; grade_ar?: string; method: string;
  grade_tier?: string; death_ah?: number | null; candidate_count?: number;
}
export interface SunnahNarratorLink { id: string; name: string; tier: string }
export interface SunnahNarrator {
  id: string; name: string; variants: string[]; kunya: string; nasab: string; laqab: string;
  tabaqah: string; deathYear: number | null; deathText: string; grade: string; tier: string;
  sources: { source: string; gradeAr: string; gradeEn: string }[];
  teachers: SunnahNarratorLink[]; students: SunnahNarratorLink[];
  teacherCount: number; studentCount: number; hadithCount: number;
}
export interface SunnahResearch {
  commentary: string; title: string; author: string; reference: string;
  volume: string; page: string; sourceUrl: string; matnUrl: string; method: string; score: number;
  nodes: SunnahResearchNode[]; roots: string[]; rootWords: Record<string, string[]>; ayahs: string[];
  calibration: number; weakest: string;
  related: SunnahSearchHit[];
  merged?: SunnahMergedResearch;
}
export interface SunnahSearchHit {
  chapter: SunnahChapterSummary & { collection: SunnahCollectionId };
  hadith: SunnahHadith;
  similarity?: number;
}
export interface SunnahResearchQuery {
  text?: string; collection?: SunnahCollectionId; chapter?: number;
  root?: string; narratorId?: string;
}

/** Counted from the attached corpus; nothing here is a scholarly judgment. */
export interface SunnahStatistics {
  collections: { id: SunnahCollectionId; hadiths: number; chapters: number; commentary: number; corroborated: number }[];
  totals: { hadiths: number; narratorProfiles: number; chainLinks: number; rootLinks: number };
  topNarrators: { id: string; name: string; mentions: number }[];
}

export type SunnahResult<T> = { ok: true; data: T } | { ok: false; error: 'unavailable' | 'invalid-corpus' | 'read-failed' };

export interface SunnahAPI {
  share: (text: string) => Promise<SunnahResult<null>>;
  catalog: () => Promise<SunnahResult<SunnahCatalog | null>>;
  importCorpus: (language?: SunnahLanguage) => Promise<SunnahResult<SunnahCatalog | null>>;
  chapter: (collection: SunnahCollectionId, number: number) => Promise<SunnahResult<SunnahChapter>>;
  research?: (id: number) => Promise<SunnahResult<SunnahResearch>>;
  openSource?: (id: number, kind?: 'commentary' | 'matn') => Promise<SunnahResult<null>>;
  narrator?: (id: string) => Promise<SunnahResult<SunnahNarrator>>;
  search?: (query: SunnahResearchQuery) => Promise<SunnahResult<SunnahSearchHit[]>>;
  statistics?: () => Promise<SunnahResult<SunnahStatistics>>;
}
