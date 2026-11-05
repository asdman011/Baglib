export const SOURCE_KEYS = ['libgen', 'annas'] as const;
export type SourceKey = typeof SOURCE_KEYS[number];

/** The one place book-site addresses live. A newer file replaces these without a code change. */
export interface SourceUrlFile { version: 1; updated: string; sources: Record<SourceKey, string[]> }

export const DEFAULT_SOURCE_URLS: SourceUrlFile = {
  version: 1,
  updated: '2026-11-02',
  sources: {
    libgen: ['https://libgen.li', 'https://libgen.bz', 'https://libgen.is', 'https://libgen.rs', 'https://libgen.vg', 'https://libgen.gs'],
    annas: ['https://annas-archive.gl', 'https://annas-archive.pk', 'https://annas-archive.gd'],
  },
};

export interface SourceUrlState { file: SourceUrlFile; custom: boolean; updateUrl: string }
export interface SourceUrlsAPI {
  get(): Promise<SourceUrlState>;
  importFile(): Promise<SourceUrlState | null>;
  update(updateUrl: string): Promise<SourceUrlState>;
  reset(): Promise<SourceUrlState>;
}

const MAX_MIRRORS = 20;

/** Only https origins: no paths, logins or ports, so a file cannot point downloads somewhere odd. */
export function validSourceFile(value: unknown): SourceUrlFile {
  const file = value as Record<string, unknown>;
  const sources = file?.sources as Record<string, unknown> | undefined;
  if (!file || file.version !== 1 || typeof file.updated !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(file.updated) || !sources || typeof sources !== 'object') throw new Error('invalid-source-file');
  const result = { version: 1 as const, updated: file.updated, sources: {} as Record<SourceKey, string[]> };
  for (const key of SOURCE_KEYS) {
    const list = sources[key];
    if (!Array.isArray(list) || !list.length || list.length > MAX_MIRRORS) throw new Error('invalid-source-file');
    result.sources[key] = [...new Set(list.map(item => {
      let url: URL;
      try { url = new URL(String(item)); } catch { throw new Error('invalid-source-file'); }
      if (url.protocol !== 'https:' || url.username || url.password || url.port || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) throw new Error('invalid-source-file');
      return url.origin;
    }))];
  }
  return result;
}
