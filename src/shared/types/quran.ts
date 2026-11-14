export const QURAN_CATEGORIES = ['quran-script', 'mushaf-layout', 'font', 'quran-metadata', 'translation', 'tafsir', 'recitation', 'transliteration', 'surah-info', 'ayah-topics', 'morphology', 'mutashabihat', 'similar-ayah', 'ayah-theme'] as const;
export type QuranCategory = typeof QURAN_CATEGORIES[number];

export interface QuranLocation {
  profileKey: string;
  surah: number;
  ayah: number;
  word?: number;
}

export interface QuranReadingProfile {
  key: string;
  qiraah: string | null;
  riwayah: string | null;
  tariq: string | null;
  numbering: string | null;
  segmentation: string | null;
  script: string | null;
  verified: boolean;
  totalVerses?: number;
}

export const HAFS_READING_PROFILE: Readonly<QuranReadingProfile> = {
  key: 'hafs-kufi',
  qiraah: "'asim",
  riwayah: 'hafs',
  tariq: 'shatibiyyah',
  numbering: 'kufi',
  segmentation: 'qpc-hafs',
  script: 'kfgqpc-hafs',
  verified: true,
  totalVerses: 6236,
};

export const WARSH_READING_PROFILE: Readonly<QuranReadingProfile> = {
  key: 'warsh-madani',
  qiraah: "nafi'",
  riwayah: 'warsh',
  tariq: 'azraq',
  numbering: 'madani-first',
  segmentation: 'qpc-warsh',
  script: 'qpc-warsh',
  verified: true,
  totalVerses: 6214,
};

export function isProfileCompatible(profile1: QuranReadingProfile, profile2: QuranReadingProfile): boolean {
  if (profile1.key === profile2.key) return true;
  if (!profile1.verified || !profile2.verified) return false;
  return profile1.riwayah === profile2.riwayah && profile1.numbering === profile2.numbering;
}

export function areLocationsCompatible(loc1: QuranLocation, loc2: QuranLocation): boolean {
  return loc1.profileKey === loc2.profileKey;
}

export interface QuranResource {
  id: string;
  category: QuranCategory;
  title: string;
  sourcePath: string;
  tags: string[];
  formats: string[];
  related: string[];
  restricted: boolean;
  profile: QuranReadingProfile;
  fetchedAt: string;
  downloadAccess?: 'sign-in-required' | 'link-available' | 'unknown';
}

export type QuranError = 'unavailable' | 'network' | 'invalid-resource' | 'restricted' | 'authentication-required' | 'invalid-package' | 'unsupported-format' | 'storage' | 'cancelled' | 'interrupted' | 'busy';
export type QuranResult<Value> = { ok: true; data: Value } | { ok: false; error: QuranError };
export type QuranJobState = 'queued' | 'awaiting-download' | 'downloading' | 'installing' | 'complete' | 'failed' | 'cancelled';
export interface QuranJob {
  id: string;
  resourceId: string;
  title: string;
  state: QuranJobState;
  received: number;
  total: number;
  error: QuranError | null;
  updatedAt: string;
  progressUnit?: 'files';
  recitation?: { pack: string; surah?: number };
}
export interface QuranPack {
  id: string;
  resource: QuranResource;
  digest: string;
  bytes: number;
  files: { name: string; bytes: number; type: 'sqlite' | 'json' | 'font' | 'image' | 'audio' | 'svg' }[];
  installedAt: string;
  capability: 'stored';
}
export interface QuranLibrary {
  resources: QuranResource[];
  installed: QuranPack[];
  jobs: QuranJob[];
  directory: string;
  hasMore: boolean;
  catalogStatus: 'cached-partial' | 'source-listing';
  localResources?: string[];
}
export interface QuranAPI {
  signIn: () => Promise<QuranResult<null>>;
  inspectAyah: (query: { script: string; layout?: string; surah: number; ayah: number }) => Promise<QuranResult<QuranAyahDetails>>;
  downloadBatch: (ids: string[]) => Promise<QuranResult<string[]>>;
  downloadRecitation: (query: { pack: string; surah?: number }) => Promise<QuranResult<string>>;
  copyText: (text: string) => Promise<QuranResult<null>>;
  khatmahList: () => Promise<QuranResult<import('./khatmah').KhatmahState>>;
  khatmahMutate: (query: import('./khatmah').KhatmahMutation) => Promise<QuranResult<import('./khatmah').KhatmahState>>;
  readerCatalog: () => Promise<QuranResult<QuranReaderCatalog>>;
  read: (query: QuranReadQuery) => Promise<QuranResult<QuranPassage>>;
  searchAyahs: (query: QuranSearchQuery) => Promise<QuranResult<QuranSearchHit[]>>;
  commentary: (query: { script: string; pack: string; surah: number; ayah: number }) => Promise<QuranResult<QuranCommentary>>;
  mushafPage: (query: { pack: string; page: number; script?: string }) => Promise<QuranResult<QuranMushafPage>>;
  mushafPageForAyah: (query: { pack: string; surah: number; ayah: number; script?: string }) => Promise<QuranResult<{ pageNumber: number }>>;
  recitationAudio: (query: { pack: string; surah: number; ayah: number }) => Promise<QuranResult<QuranAyahAudio>>;
  recitationSurah: (query: { pack: string; surah: number }) => Promise<QuranResult<QuranAyahAudio[]>>;
  cacheAudio: (query: { pack: string; surah: number; ayah: number; audioUrl: string }) => Promise<QuranResult<{ localUrl: string }>>;
  surahAudioStatus: (query: { pack: string; surah: number }) => Promise<QuranResult<{ cachedCount: number; totalCount: number; isComplete: boolean }>>;
  downloadSurahAudio: (query: { pack: string; surah: number }) => Promise<QuranResult<{ completed: number; total: number }>>;
  surahIntro: (query: { surah: number; pack?: string }) => Promise<QuranResult<QuranSurahIntro | null>>;
  ayahThemes: (query: { surah: number; ayah?: number; pack?: string }) => Promise<QuranResult<QuranAyahTheme[]>>;
  morphology: (query: { script: string; surah: number; ayah: number }) => Promise<QuranResult<QuranMorphology[]>>;
  mutashabihat: (query: { script: string; surah: number; ayah: number }) => Promise<QuranResult<QuranPhraseMatch[]>>;
  ayahTopics: (query: { surah: number; ayah: number; pack?: string }) => Promise<QuranResult<QuranTopic[]>>;
  searchTopics: (query: { text: string; pack?: string }) => Promise<QuranResult<QuranTopic[]>>;
  topics: (query: { ids: number[]; pack?: string }) => Promise<QuranResult<QuranTopic[]>>;
  structure: () => Promise<QuranResult<QuranStructure>>;
  similarAyahs: (query: { surah: number; ayah: number; pack?: string }) => Promise<QuranResult<QuranSimilarAyah[]>>;
  frequency: (query: QuranFrequencyQuery) => Promise<QuranResult<QuranFrequency>>;
  frequencyPlaces: (query: { family: QuranFrequencyFamily; text: string }) => Promise<QuranResult<QuranFrequencyPlace[]>>;
  setup: (ids: string[]) => Promise<QuranResult<{ installed: string[]; missing: string[]; failed: string[] } | null>>;
  library: (query?: { category?: QuranCategory; search?: string; offset?: number; view?: 'all' | 'installed' | 'downloads' }) => Promise<QuranResult<QuranLibrary>>;
  refresh: (category: QuranCategory) => Promise<QuranResult<null>>;
  download: (id: string) => Promise<QuranResult<string>>;
  importFile: (id: string) => Promise<QuranResult<string | null>>;
  cancel: (jobId: string) => Promise<QuranResult<null>>;
  remove: (packId: string) => Promise<QuranResult<null>>;
  chooseDirectory: () => Promise<QuranResult<null>>;
  onChanged: (listener: () => void) => () => void;
}

export type QuranReaderKind = 'script' | 'translation' | 'tafsir' | 'word-translation' | 'word-transliteration' | 'surahs' | 'mushaf-layout' | 'recitation' | 'surah-info' | 'ayah-theme' | 'ayah-topics' | 'similar-ayah' | 'word-root' | 'word-lemma' | 'word-stem' | 'mutashabihat' | 'glyph-script' | 'glyph-layout' | 'font' | 'ayah-transliteration' | 'juz' | 'hizb' | 'rub' | 'ruku' | 'manzil' | 'sajda';
export interface QuranReaderSource { id: string; title: string; kind: QuranReaderKind; profile: 'hafs' | 'warsh'; language?: 'ar' | 'en'; }
export interface QuranReaderCatalog { sources: QuranReaderSource[]; presets: { id: string; title: string; kind: QuranReaderKind; installed: boolean; importOnly?: boolean }[]; }
export interface QuranReadQuery { script: string; surah: number; from: number; translation?: string; meanings?: string; transliteration?: string; ayahTransliteration?: string; }
export interface QuranRichNode { tag: 'text' | 'p' | 'div' | 'br' | 'b' | 'i' | 'u' | 'sup' | 'h2' | 'h3'; text?: string; children?: QuranRichNode[]; }
export interface QuranAyah { number: number; words: { position: number; text: string; marker: boolean; meaning?: string; transliteration?: string }[]; translation?: QuranTranslation; transliteration?: QuranRichNode[]; }
export interface QuranTranslation { text: string; notes: string[]; anchors?: { offset: number; note: number }[]; }
export interface QuranPassage { profile: 'hafs' | 'warsh'; surah: number; surahs: { number: number; count: number; arabic?: string; name?: string; revelationPlace?: string; revelationOrder?: number }[]; basmala?: string; ayahs: QuranAyah[]; next: number | null; }
export interface QuranSearchQuery { script: string; text: string; translations?: string[]; includeScript?: boolean; }
export interface QuranSearchHit { surah: number; ayah: number; text: string; source?: { id: string; title: string; kind: 'script' | 'translation'; language?: string }; }
export interface QuranCommentary { from: string; to: string; nodes: QuranRichNode[]; }
export interface QuranAyahDetails { surah: number; ayah: number; profile: 'hafs' | 'warsh'; canonical: string; imlaey: string | null; }
export interface QuranMorphology { location: string; root?: string; lemma?: string; stem?: string; }
export type QuranFrequencyFamily = 'root' | 'lemma';
export interface QuranFrequencyQuery { family: QuranFrequencyFamily; surah?: number; text?: string; limit?: number }
export interface QuranFrequency { family: QuranFrequencyFamily; total: number; distinct: number; rows: { text: string; count: number; stated?: number }[] }
export interface QuranFrequencyPlace { surah: number; ayah: number; count: number }
export interface QuranPhraseMatch { id: number; text: string; source: string; ranges: [number, number][]; references: string[]; total: number; }
export interface QuranMushafWord { id: string; surah: number; ayah: number; wordIndex: number; type?: 'text' | 'aya-mark'; line?: number; textHafs?: string; canonicalText?: string; imlaey?: string; }
export interface QuranMushafPage { pageNumber: number; totalPages: number; surahStart: number; ayahStart: number; surahEnd: number; ayahEnd: number; svg: string; profile: 'hafs' | 'warsh'; layoutMode?: 'adapted'; words: QuranMushafWord[]; fontUrl?: string; basmala?: string; glyphLines?: { number: number; type: string; centered: boolean; surah: number; words: { surah: number; ayah: number; position: number; glyph: string; text: string; marker?: boolean }[] }[]; }
export type QuranAudioSegment = [fromWord: number, toWord: number, startMs: number, endMs: number];
export interface QuranAyahAudio { surah: number; ayah: number; audioUrl: string; duration: number | null; segments: QuranAudioSegment[]; localUrl?: string; cached?: boolean; profile?: 'hafs' | 'warsh'; }
export interface QuranSurahIntro { surahNumber: number; surahName: string; text: string; shortText: string; nodes?: QuranRichNode[]; }
export interface QuranDivision { number: number; first: string; last: string; surahRuku?: number; }
export interface QuranSajdah { number: number; reference: string; type: string; }
export interface QuranStructure { juz: QuranDivision[]; hizb: QuranDivision[]; rub: QuranDivision[]; ruku: QuranDivision[]; manzil: QuranDivision[]; sajdah: QuranSajdah[]; }
export interface QuranAyahTheme { theme: string; surahNumber: number; ayahFrom: number; ayahTo: number; keywords: string[]; totalAyahs: number; }
export interface QuranTopic { topicId: number; name: string; arabicName: string; parentId: number | null; thematicParentId: number | null; ontologyParentId: number | null; description: string; wikiLink: string; thematic: boolean; ontology: boolean; ayahs: { surah: number; ayah: number }[]; relatedTopics: number[]; }
export interface QuranSimilarAyah {
  verseKey: string;
  matchedAyahKey: string;
  surah: number;
  ayah: number;
  matchedWordsCount: number;
  coverage: number;
  score: number;
  matchWordsRange: [number, number][];
}

// Semantic Retrieval and Cited AI Contracts (Task 6.4 / KEY-179)
export type QuranSemanticChunkKind = 'ayah' | 'tafsir-section' | 'surah-intro' | 'ayah-theme' | 'topic-concept';

export interface QuranSemanticChunk {
  chunkId: string;
  profileKey: string;
  sourceId: string;
  kind: QuranSemanticChunkKind;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  text: string;
  language: 'ar' | 'en';
  citation: string;
  metadata?: Record<string, unknown>;
  immutableSourceDigest?: string;
}

export interface QuranRetrievalQuery {
  queryText: string;
  profileKey: string;
  language?: 'ar' | 'en';
  hybridWeight?: { lexicalBm25: number; denseVector: number };
  filterSurah?: number;
  filterKinds?: QuranSemanticChunkKind[];
  topK?: number;
}

export interface QuranRetrievalHit {
  chunk: QuranSemanticChunk;
  lexicalScore?: number;
  vectorScore?: number;
  combinedScore: number;
  provenance: { sourceId: string; citation: string };
}

export type QuranAIAbstentionReason =
  | 'no-retrieved-evidence'
  | 'out-of-domain'
  | 'theological-controversy'
  | 'user-notes-unconsented';

export interface QuranAICitedResponse {
  query: string;
  answerMarkdown: string;
  citations: { citation: string; surah: number; ayahStart: number; ayahEnd: number; sourceId: string }[];
  abstained: boolean;
  abstentionReason?: QuranAIAbstentionReason;
  modelProvenance: { modelName: string; provider: 'local-cpu' | 'cloud-byok'; latencyMs: number };
}


