/**
 * Baglib — Author Biography & Brief Resolver Service
 *
 * Resolves author biography / brief ("نبذة عن المؤلف") from reliable free sources:
 * 1. Wikipedia Summary REST API (supports Arabic and English endpoints)
 * 2. Open Library Authors API (queries author search & author record)
 */

export class AuthorBioService {
  private cache = new Map<string, string>();

  /**
   * Cleans raw author string by removing academic titles, honorifics, and trailing dates.
   */
  private cleanAuthorName(author: string): string {
    return author
      .replace(/^(دكتور|د\.|أ\.د\.|الشيخ|الإمام|العلامة|الفقيه|الأستاذ|Dr\.|Prof\.|Sir|by\s+)/i, '')
      .replace(/\s*\([^)]*\)\s*$/, '') // remove trailing (1911-2006)
      .replace(/\s*\[[^\]]*\]\s*$/, '')
      .trim();
  }

  /**
   * Resolves author biography / brief summary ("نبذة عن المؤلف").
   */
  async resolveAuthorBio(authorName: string, preferredLanguage?: string): Promise<string | undefined> {
    if (!authorName || typeof authorName !== 'string') return undefined;

    const clean = this.cleanAuthorName(authorName);
    if (!clean || clean.length < 2) return undefined;

    const cacheKey = `${clean.toLowerCase()}_${preferredLanguage || 'auto'}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // 1. Try Wikipedia Summary API
    const wikiBio = await this.fetchWikipediaBio(clean, preferredLanguage);
    if (wikiBio) {
      this.cache.set(cacheKey, wikiBio);
      return wikiBio;
    }

    // 2. Fallback to Open Library Author API
    const olBio = await this.fetchOpenLibraryBio(clean);
    if (olBio) {
      this.cache.set(cacheKey, olBio);
      return olBio;
    }

    return undefined;
  }

  private async fetchWikipediaBio(author: string, preferredLanguage?: string): Promise<string | undefined> {
    const isArabicScript = /[\u0600-\u06FF]/.test(author);
    const primaryLang = preferredLanguage === 'العربية' || isArabicScript ? 'ar' : 'en';
    const secondaryLang = primaryLang === 'ar' ? 'en' : 'ar';

    const tryFetch = async (lang: string, queryName: string): Promise<string | undefined> => {
      try {
        const titleSlug = encodeURIComponent(queryName.replace(/\s+/g, '_'));
        const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${titleSlug}`;
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Baglib/1.0 (https://baglib.org; metadata@baglib.org)',
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(3500),
        });

        if (!response.ok) return undefined;

        const data = await response.json();
        if (data.type === 'disambiguation') return undefined;

        if (data.extract && typeof data.extract === 'string' && data.extract.trim().length > 25) {
          let text = data.extract.trim();
          // Truncate to ~600 chars if exceedingly long
          if (text.length > 600) {
            const cut = text.slice(0, 600);
            const lastPeriod = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('۔'), cut.lastIndexOf('!'), cut.lastIndexOf('؟'));
            if (lastPeriod > 300) {
              text = cut.slice(0, lastPeriod + 1);
            }
          }
          return text;
        }
      } catch {
        // Silently continue to fallback
      }
      return undefined;
    };

    // Try primary language
    const primaryResult = await tryFetch(primaryLang, author);
    if (primaryResult) return primaryResult;

    // Try secondary language
    return await tryFetch(secondaryLang, author);
  }

  private async fetchOpenLibraryBio(author: string): Promise<string | undefined> {
    try {
      const searchUrl = `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(author)}`;
      const searchRes = await fetch(searchUrl, {
        headers: { 'User-Agent': 'Baglib/1.0 (metadata@baglib.org)' },
        signal: AbortSignal.timeout(3500),
      });

      if (!searchRes.ok) return undefined;
      const searchData = await searchRes.json();
      const firstDoc = searchData?.docs?.[0];

      if (firstDoc?.key) {
        const authorUrl = `https://openlibrary.org/authors/${firstDoc.key}.json`;
        const authorRes = await fetch(authorUrl, {
          headers: { 'User-Agent': 'Baglib/1.0 (metadata@baglib.org)' },
          signal: AbortSignal.timeout(3500),
        });

        if (authorRes.ok) {
          const authorData = await authorRes.json();
          let bioText = '';
          if (typeof authorData.bio === 'string') {
            bioText = authorData.bio;
          } else if (authorData.bio?.value && typeof authorData.bio.value === 'string') {
            bioText = authorData.bio.value;
          }

          if (bioText.trim().length > 20) {
            let cleanBio = bioText.replace(/----------[\s\S]*$/, '').trim(); // Remove citations/links
            if (cleanBio.length > 600) {
              cleanBio = cleanBio.slice(0, 600) + '...';
            }
            return cleanBio;
          }
        }
      }
    } catch {
      // Silently return undefined
    }
    return undefined;
  }
}

export const authorBioService = new AuthorBioService();
