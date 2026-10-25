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
  files: { name: string; bytes: number; type: 'sqlite' | 'json' | 'font' | 'image' | 'audio' }[];
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
  library: (query?: { category?: QuranCategory; search?: string; offset?: number; view?: 'all' | 'installed' | 'downloads' }) => Promise<QuranResult<QuranLibrary>>;
  refresh: (category: QuranCategory) => Promise<QuranResult<null>>;
  download: (id: string) => Promise<QuranResult<string>>;
  importFile: (id: string) => Promise<QuranResult<string | null>>;
  cancel: (jobId: string) => Promise<QuranResult<null>>;
  remove: (packId: string) => Promise<QuranResult<null>>;
  chooseDirectory: () => Promise<QuranResult<null>>;
  onChanged: (listener: () => void) => () => void;
}
