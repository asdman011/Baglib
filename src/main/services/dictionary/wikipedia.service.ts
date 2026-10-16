/**
 * Baglib — Online Wikipedia Encyclopedia Service (KEY-142)
 *
 * Connects to Wikipedia REST API (ar.wikipedia.org & en.wikipedia.org)
 * displaying concise summary cards with thumbnails and direct article links.
 */

import type { WikipediaSummaryCard } from '../../../shared/types/dictionary';
import { stripArabicDiacritics } from '../../../shared/utils/lookup-candidates';

export class WikipediaService {
  /**
   * Fetch summary card from Wikipedia REST API.
   * Auto-detects language (default 'ar' for Arabic text, 'en' otherwise).
   */
  async fetchSummary(word: string, preferredLang?: string): Promise<WikipediaSummaryCard | null> {
    const trimmed = word.trim();
    if (!trimmed) return null;

    // Detect language: check for Arabic unicode range
    const isArabic = /[\u0600-\u06FF]/.test(trimmed);
    const langCode = preferredLang || (isArabic ? 'ar' : 'en');

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
    try {
      const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Baglib-Reader/0.1.0 (https://github.com/asdman011/Baglib; book-reader@baglib.local)',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (!data || data.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') {
        return null;
      }

      const isRtl = data.dir === 'rtl' || lang === 'ar';
      const articleUrl =
        data.content_urls?.desktop?.page ||
        `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(term)}`;

      return {
        title: data.title || term,
        displayTitle: data.titles?.display || data.title || term,
        extract: data.extract || '',
        extractHtml: data.extract_html,
        description: data.description,
        thumbnailUrl: data.thumbnail?.source,
        articleUrl,
        lang,
        dir: isRtl ? 'rtl' : 'ltr',
      };
    } catch (err) {
      console.warn(`[WikipediaService] Failed to query ${lang}.wikipedia.org for "${term}":`, err);
      return null;
    }
  }
}
