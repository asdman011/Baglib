import { settingsRepository, type ISettingsRepository } from '../database/repositories/settings.repository';
import { DEFAULT_SOURCE_URLS, validSourceFile, type SourceKey, type SourceUrlFile, type SourceUrlState } from '../../shared/source-urls';

const FILE_KEY = 'sources.urls.v1';
const UPDATE_KEY = 'sources.urls.update.v1';
const MAX_BYTES = 64 * 1024;
const TIMEOUT_MS = 15000;

export class SourceUrlStore {
  constructor(private settings: ISettingsRepository = settingsRepository, private request: typeof fetch = fetch) {}

  /** A stored file that no longer validates falls back to the built-in list rather than breaking search. */
  file(): SourceUrlFile {
    try {
      const stored = this.settings.get<unknown>(FILE_KEY);
      return stored ? validSourceFile(stored) : DEFAULT_SOURCE_URLS;
    } catch { return DEFAULT_SOURCE_URLS; }
  }
  mirrors(key: SourceKey): string[] { return this.file().sources[key]; }
  state(): SourceUrlState {
    return { file: this.file(), custom: !!this.settings.get(FILE_KEY), updateUrl: this.settings.get<string>(UPDATE_KEY) ?? '' };
  }

  apply(text: string): SourceUrlState {
    if (text.length > MAX_BYTES) throw new Error('invalid-source-file');
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new Error('invalid-source-file'); }
    this.settings.set(FILE_KEY, validSourceFile(parsed));
    return this.state();
  }

  /** The address is remembered, so the next update is one click. */
  async update(address: string): Promise<SourceUrlState> {
    let url: URL;
    try { url = new URL(address); } catch { throw new Error('invalid-request'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid-request');
    const response = await this.request(url.href, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('source-update-failed');
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > MAX_BYTES) throw new Error('invalid-source-file');
    const state = this.apply(await response.text());
    this.settings.set(UPDATE_KEY, url.href);
    return { ...state, updateUrl: url.href };
  }

  reset(): SourceUrlState { this.settings.delete(FILE_KEY); return this.state(); }
}

export const sourceUrls = new SourceUrlStore();
