export const SOURCE_KEYS = ['libgen', 'annas'] as const;
export type SourceKey = typeof SOURCE_KEYS[number];

/**
 * The one place book-site addresses live. A newer file replaces these without a code change.
 * `downloads` lists download hosts that are not search mirrors; it is optional in an older file
 * and filled from the built-in list when a valid file omits it.
 */
export interface SourceUrlFile {
  version: 1;
  updated: string;
  sources: Record<SourceKey, string[]> & { downloads: string[] };
}

export const DEFAULT_SOURCE_URLS: SourceUrlFile = {
  version: 1,
  updated: '2026-11-02',
  sources: {
    libgen: ['https://libgen.li', 'https://libgen.bz', 'https://libgen.is', 'https://libgen.rs', 'https://libgen.vg', 'https://libgen.gs'],
    annas: ['https://annas-archive.gl', 'https://annas-archive.pk', 'https://annas-archive.gd'],
    downloads: ['https://booksdl.lc'],
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
function validOriginList(list: unknown): string[] {
  if (!Array.isArray(list) || !list.length || list.length > MAX_MIRRORS) throw new Error('invalid-source-file');
  return [...new Set(list.map(item => {
    let url: URL;
    try { url = new URL(String(item)); } catch { throw new Error('invalid-source-file'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) throw new Error('invalid-source-file');
    return url.origin;
  }))];
}

export function validSourceFile(value: unknown): SourceUrlFile {
  const file = value as Record<string, unknown>;
  const sources = file?.sources as Record<string, unknown> | undefined;
  if (!file || file.version !== 1 || typeof file.updated !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(file.updated) || !sources || typeof sources !== 'object') throw new Error('invalid-source-file');
  const result = { version: 1 as const, updated: file.updated, sources: {} as SourceUrlFile['sources'] };
  for (const key of SOURCE_KEYS) result.sources[key] = validOriginList(sources[key]);
  result.sources.downloads = sources.downloads === undefined ? [...DEFAULT_SOURCE_URLS.sources.downloads] : validOriginList(sources.downloads);
  return result;
}

/** Host part of an origin, or '' when the entry is not parseable. */
function hostOf(origin: string): string {
  try { return new URL(origin).host; } catch { return ''; }
}

/** A url belongs to a host when it is that host or one of its subdomains. */
function belongsTo(url: URL, host: string): boolean {
  return !!host && (url.host === host || url.host.endsWith(`.${host}`));
}

/** Electron webRequest patterns for every libgen mirror and download host, libgen first. */
export function mirrorRequestPatterns(file: SourceUrlFile): string[] {
  const seen = new Set<string>();
  const patterns: string[] = [];
  for (const origin of [...file.sources.libgen, ...file.sources.downloads]) {
    const host = hostOf(origin);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    patterns.push(`*://*.${host}/*`);
  }
  return patterns;
}

/** The first libgen mirror is the reference site for referer headers. */
export function primaryLibgenOrigin(file: SourceUrlFile): string {
  return file.sources.libgen[0] ?? DEFAULT_SOURCE_URLS.sources.libgen[0];
}

/** True when the url points at a libgen mirror or a known download host. */
export function isMirrorUrl(file: SourceUrlFile, url: string): boolean {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  return [...file.sources.libgen, ...file.sources.downloads].some(origin => belongsTo(parsed, hostOf(origin)));
}

/**
 * Referer a mirror or download host expects: its own origin for a libgen mirror,
 * the primary libgen origin for a download host (or anything else).
 */
export function mirrorReferer(file: SourceUrlFile, url: string): string {
  const primary = `${primaryLibgenOrigin(file)}/`;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return primary; }
  const mirror = file.sources.libgen.find(origin => belongsTo(parsed, hostOf(origin)));
  return mirror ? `${mirror}/` : primary;
}
