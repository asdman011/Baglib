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
}

export type QuranError = 'unavailable' | 'network' | 'invalid-resource' | 'restricted' | 'invalid-package' | 'unsupported-format' | 'storage' | 'cancelled' | 'interrupted' | 'busy';
export type QuranResult<Value> = { ok: true; data: Value } | { ok: false; error: QuranError };
export type QuranJobState = 'awaiting-download' | 'downloading' | 'installing' | 'complete' | 'failed' | 'cancelled';
export interface QuranJob {
  id: string;
  resourceId: string;
  title: string;
  state: QuranJobState;
  received: number;
  total: number;
  error: QuranError | null;
  updatedAt: string;
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
}
export interface QuranAPI {
  copyText: (text: string) => Promise<QuranResult<null>>;
  readerCatalog: () => Promise<QuranResult<QuranReaderCatalog>>;
  read: (query: QuranReadQuery) => Promise<QuranResult<QuranPassage>>;
  searchAyahs: (query: { script: string; text: string }) => Promise<QuranResult<QuranSearchHit[]>>;
  commentary: (query: { script: string; pack: string; surah: number; ayah: number }) => Promise<QuranResult<QuranCommentary>>;
  mushafPage: (query: { pack: string; page: number }) => Promise<QuranResult<QuranMushafPage>>;
  mushafPageForAyah: (query: { pack: string; surah: number; ayah: number }) => Promise<QuranResult<{ pageNumber: number }>>;
  recitationAudio: (query: { pack: string; surah: number; ayah: number }) => Promise<QuranResult<QuranAyahAudio>>;
  recitationSurah: (query: { pack: string; surah: number }) => Promise<QuranResult<QuranAyahAudio[]>>;
  cacheAudio: (query: { pack: string; surah: number; ayah: number; audioUrl: string }) => Promise<QuranResult<{ localUrl: string }>>;
  surahAudioStatus: (query: { pack: string; surah: number }) => Promise<QuranResult<{ cachedCount: number; totalCount: number; isComplete: boolean }>>;
  downloadSurahAudio: (query: { pack: string; surah: number }) => Promise<QuranResult<{ completed: number; total: number }>>;
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

export type QuranReaderKind = 'script' | 'translation' | 'tafsir' | 'word-translation' | 'word-transliteration' | 'surahs' | 'mushaf-layout' | 'recitation';
export interface QuranReaderSource { id: string; title: string; kind: QuranReaderKind; profile: 'hafs' | 'warsh'; }
export interface QuranReaderCatalog { sources: QuranReaderSource[]; presets: { id: string; title: string; kind: QuranReaderKind; installed: boolean }[]; }
export interface QuranReadQuery { script: string; surah: number; from: number; translation?: string; meanings?: string; transliteration?: string; }
export interface QuranRichNode { tag: 'text' | 'p' | 'div' | 'br' | 'b' | 'i' | 'u' | 'sup'; text?: string; children?: QuranRichNode[]; }
export interface QuranAyah { number: number; words: { position: number; text: string; marker: boolean; meaning?: string; transliteration?: string }[]; translation?: { text: string; notes: string[] }; }
export interface QuranPassage { profile: 'hafs' | 'warsh'; surah: number; surahs: { number: number; count: number; arabic?: string; name?: string }[]; basmala?: string; ayahs: QuranAyah[]; next: number | null; }
export interface QuranSearchHit { surah: number; ayah: number; text: string; }
export interface QuranCommentary { from: string; to: string; nodes: QuranRichNode[]; }
export interface QuranMushafWord { id: string; surah: number; ayah: number; wordIndex: number; type?: 'text' | 'aya-mark'; line?: number; textHafs?: string; imlaey?: string; }
export interface QuranMushafPage { pageNumber: number; totalPages: number; surahStart: number; ayahStart: number; surahEnd: number; ayahEnd: number; svg: string; profile: 'hafs' | 'warsh'; words: QuranMushafWord[]; }
export type QuranAudioSegment = [fromWord: number, toWord: number, startMs: number, endMs: number];
export interface QuranAyahAudio { surah: number; ayah: number; audioUrl: string; duration: number | null; segments: QuranAudioSegment[]; localUrl?: string; cached?: boolean; }

