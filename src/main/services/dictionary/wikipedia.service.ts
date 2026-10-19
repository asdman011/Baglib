/**
 * Baglib — Online Wikipedia Encyclopedia Service (KEY-142)
 *
 * Connects to Wikipedia REST API (ar.wikipedia.org & en.wikipedia.org)
 * displaying concise summary cards with thumbnails and direct article links.
 */

import type { WikipediaSummaryCard } from '../../../shared/types/dictionary';
import { stripArabicDiacritics } from '../../../shared/utils/lookup-candidates';

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
    } catch (err: any) {
      console.warn(`[WikipediaService] Notice: Could not fetch summary from ${validLang}.wikipedia.org for "${term}":`, err?.message || err);
      return null;
    }
  }
}
