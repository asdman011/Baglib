import { errorMessage } from '../../../shared/errors';
/**
 * Baglib — Online Wikipedia Encyclopedia Service (KEY-142)
 *
 * Connects to Wikipedia REST API (ar.wikipedia.org & en.wikipedia.org)
 * displaying concise summary cards with thumbnails and direct article links.
 */

import type { WikipediaSearchArticle, WikipediaSearchResult, WikipediaSummaryCard } from '../../../shared/types/dictionary';
import { stripArabicDiacritics } from '../../../shared/utils/lookup-candidates';

const WIKIPEDIA_USER_AGENT = 'Baglib-Reader/0.1.0 (https://github.com/asdman011/Baglib; book-reader@baglib.local)';
const WIKIPEDIA_TIMEOUT_MS = 5000;
const MAX_WIKI_QUERY_LENGTH = 200;

export function parseWikipediaSearchResponse(data: unknown, lang: 'ar' | 'en', limit = 8): WikipediaSearchArticle[] {
  const cap = Math.max(1, Math.min(10, Math.trunc(limit)));
  if (Array.isArray(data) && data.length >= 4 && Array.isArray(data[1]) && Array.isArray(data[3])) {
    const titles = data[1] as unknown[];
    const descriptions = Array.isArray(data[2]) ? data[2] as unknown[] : [];
    const urls = data[3] as unknown[];
    const items: WikipediaSearchArticle[] = [];
    for (let i = 0; i < titles.length && items.length < cap; i++) {
      const rawTitle = titles[i];
      const rawUrl = urls[i];
      const rawDesc = descriptions[i];
      const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
      const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
      const summary = typeof rawDesc === 'string' ? rawDesc.trim() : '';
      if (!title || !/^https?:\/\//i.test(url)) continue;
      items.push({ title, summary, url, lang });
    }
    return items;
  }
  if (data && typeof data === 'object' && 'query' in data) {
    const pages = (data as { query?: { pages?: Record<string, { title?: unknown; extract?: unknown; fullurl?: unknown; index?: unknown }> } }).query?.pages;
    if (!pages || typeof pages !== 'object') return [];
    return Object.values(pages)
      .sort((a, b) => (typeof a.index === 'number' ? a.index : 9999) - (typeof b.index === 'number' ? b.index : 9999))
      .flatMap(page => {
        const title = typeof page.title === 'string' ? page.title.trim() : '';
        if (!title) return [];
        const rawExtract = typeof page.extract === 'string' ? page.extract.replace(/\s+/gu, ' ').trim() : '';
        const summary = rawExtract.length > 260 ? `${rawExtract.slice(0, 259).trimEnd()}…` : rawExtract;
        const url = typeof page.fullurl === 'string' && /^https?:\/\//i.test(page.fullurl)
          ? page.fullurl
          : `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/gu, '_'))}`;
        return [{ title, summary, url, lang }];
      })
      .slice(0, cap);
  }
  return [];
}

function isOfflineError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string; code?: string; cause?: { code?: string } };
  const code = e.code || e.cause?.code || '';
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) return true;
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return true;
  return e.name === 'TypeError' && /fetch failed|network/i.test(e.message || '');
}

/**
 * Normalizes user/book language representations into valid ISO Wikipedia subdomains (e.g. 'ar', 'en', 'fr').
 */
export function normalizeWikipediaLang(lang?: string, isArabicText?: boolean): string {
  if (!lang) return isArabicText ? 'ar' : 'en';
  const clean = lang.trim().toLowerCase();

  if (
    clean === 'ar' ||
    clean.startsWith('ar-') ||
    clean === 'العربية' ||
    clean === 'عربي' ||
    clean === 'arabic'
  ) {
    return 'ar';
  }

  if (
    clean === 'en' ||
    clean.startsWith('en-') ||
    clean === 'الإنجليزية' ||
    clean === 'الانجليزية' ||
    clean === 'english'
  ) {
    return 'en';
  }

  if (clean === 'fr' || clean.startsWith('fr-') || clean === 'الفرنسية' || clean === 'french') {
    return 'fr';
  }

  if (clean === 'de' || clean.startsWith('de-') || clean === 'الألمانية' || clean === 'german') {
    return 'de';
  }

  if (clean === 'es' || clean.startsWith('es-') || clean === 'الإسبانية' || clean === 'spanish') {
    return 'es';
  }

  if (clean === 'tr' || clean.startsWith('tr-') || clean === 'التركية' || clean === 'turkish') {
    return 'tr';
  }

  if (clean === 'fa' || clean.startsWith('fa-') || clean === 'الفارسية' || clean === 'persian') {
    return 'fa';
  }

  if (clean === 'ur' || clean.startsWith('ur-') || clean === 'الأوردية' || clean === 'urdu') {
    return 'ur';
  }

  // If already a valid 2-3 letter ASCII language code (e.g. 'it', 'ja', 'ru', 'zh')
  if (/^[a-z]{2,3}$/.test(clean)) {
    return clean;
  }

  return isArabicText ? 'ar' : 'en';
}

export class WikipediaService {
  /**
   * Fetch summary card from Wikipedia REST API.
   * Auto-detects language (default 'ar' for Arabic text, 'en' otherwise).
   */
  async fetchSummary(word: string, preferredLang?: string): Promise<WikipediaSummaryCard | null> {
    const trimmed = word.trim();
    if (!trimmed) return null;

    // Disregard URLs and web addresses
    if (/^(https?:\/\/|www\.)/i.test(trimmed)) {
      return null;
    }

    // Detect language: check for Arabic unicode range
    const isArabic = /[\u0600-\u06FF]/.test(trimmed);
    const langCode = normalizeWikipediaLang(preferredLang, isArabic);

    // Try original word first
    let result = await this.queryApi(trimmed, langCode);

    // If failed and word was Arabic with Tashkeel, retry with stripped diacritics
    if (!result && isArabic) {
      const stripped = stripArabicDiacritics(trimmed);
      if (stripped !== trimmed) {
        result = await this.queryApi(stripped, langCode);
      }
    }

    // Fallback: If not found in Arabic and preferred was Arabic, try English as secondary lookup
    if (!result && langCode === 'ar' && !isArabic) {
      result = await this.queryApi(trimmed, 'en');
    }

    return result;
  }

  private async queryApi(term: string, lang: string): Promise<WikipediaSummaryCard | null> {
    const validLang = normalizeWikipediaLang(lang);
    try {
      const url = `https://${validLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Baglib-Reader/0.1.0 (https://github.com/asdman011/Baglib; book-reader@baglib.local)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (!data || data.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') {
        return null;
      }

      const isRtl = data.dir === 'rtl' || validLang === 'ar';
      const articleUrl =
        data.content_urls?.desktop?.page ||
        `https://${validLang}.wikipedia.org/wiki/${encodeURIComponent(term)}`;

      return {
        title: data.title || term,
        displayTitle: data.titles?.display || data.title || term,
        extract: data.extract || '',
        extractHtml: data.extract_html,
        description: data.description,
        thumbnailUrl: data.thumbnail?.source,
        articleUrl,
        lang: validLang,
        dir: isRtl ? 'rtl' : 'ltr',
      };
    } catch (err: unknown) {
      console.warn(`[WikipediaService] Notice: Could not fetch summary from ${validLang}.wikipedia.org for "${term}":`, errorMessage(err) || err);
      return null;
    }
  }

  /**
   * Online-only search for Wikipedia articles (title + short summary + URL).
   * Validates query length and language code ('ar' | 'en'), uses a 5s timeout,
   * and returns `{ ok: false, error: 'offline' }` when unreachable. Never caches to disk.
   */
  async searchArticles(
    query: unknown,
    preferredLang?: unknown,
    limit = 8,
    fetchImpl: typeof fetch = fetch
  ): Promise<WikipediaSearchResult> {
    const raw = typeof query === 'string' ? query.trim() : '';
    const isArabic = /[\u0600-\u06FF]/u.test(raw);
    let lang: 'ar' | 'en';
    if (preferredLang === undefined || preferredLang === null || preferredLang === '') {
      lang = isArabic ? 'ar' : 'en';
    } else if (preferredLang === 'ar' || preferredLang === 'en') {
      lang = preferredLang;
    } else {
      return { ok: false, error: 'invalid-request', lang: isArabic ? 'ar' : 'en', items: [] };
    }

    if (!raw || raw.length > MAX_WIKI_QUERY_LENGTH || /^(https?:\/\/|www\.)/i.test(raw)) {
      return { ok: false, error: 'invalid-request', lang, items: [] };
    }

    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(10, Math.trunc(limit))) : 8;
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(raw)}&gsrlimit=${safeLimit}&prop=extracts|info&exintro=1&explaintext=1&exchars=240&inprop=url&format=json`;
    try {
      const response = await fetchImpl(url, {
        headers: {
          'User-Agent': WIKIPEDIA_USER_AGENT,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(WIKIPEDIA_TIMEOUT_MS),
      });
      if (!response.ok) {
        return { ok: false, error: 'failed', lang, items: [] };
      }
      const data = await response.json();
      const items = parseWikipediaSearchResponse(data, lang, safeLimit);
      return { ok: true, lang, items };
    } catch (err: unknown) {
      if (isOfflineError(err)) {
        return { ok: false, error: 'offline', lang, items: [] };
      }
      console.warn(`[WikipediaService] Search failed on ${lang}.wikipedia.org for "${raw}":`, errorMessage(err) || err);
      return { ok: false, error: 'failed', lang, items: [] };
    }
  }
}
