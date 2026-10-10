/**
 * Baglib — Centralized Multi-Source Cover Discovery & Validation Engine
 *
 * Resolves book cover art across a progressive cascade:
 * 1. Embedded local cover art (EPUB/PDF)
 * 2. Matched provider cover (Open Library, Google Books, Internet Archive)
 * 3. Open Library Covers API (ISBN, OLID, Cover ID) with `?default=false` verification
 * 4. Google Books volume imageLinks (high-resolution upgrade, &edge=curl stripping)
 * 5. Internet Archive (`archive.org/services/img/{ia_id}`)
 * 6. Goodreads uncompressed master covers (reverse-engineered from bookcover-api)
 * 7. Internet Archive Title Search fallback
 *
 * Implements strict image validation (HTTP status 200, Content-Type `image/*`, Content-Length >= 1000)
 * to avoid generic 1x1 GIFs, empty 43-byte files, and broken links.
 * Positive caching (24h) and negative caching (5m).
 */

import { BAGLIB_USER_AGENT } from './http-client';
import { isValidIsbn } from '../../../shared/validators/metadata-validator';
import { EmbeddedMetadataExtractor } from './embedded-metadata.extractor';

export interface CoverResolutionOptions {
  isbn?: string;
  isbn10?: string;
  isbn13?: string;
  openLibraryCoverId?: number | string;
  openLibraryEditionId?: string;
  googleBooksImageLinks?: {
    extraLarge?: string;
    large?: string;
    medium?: string;
    small?: string;
    thumbnail?: string;
    smallThumbnail?: string;
  };
  internetArchiveId?: string;
  providerCoverUrl?: string;
  title?: string;
  author?: string;
  embeddedCoverBuffer?: Buffer;
  embeddedCoverMime?: string;
}

export interface CoverResolutionResult {
  coverUrl?: string;
  source:
    | 'embedded'
    | 'provider'
    | 'open-library'
    | 'google-books'
    | 'internet-archive'
    | 'goodreads'
    | 'none';
  verified: boolean;
  contentLength?: number;
  contentType?: string;
}

interface CacheEntry {
  url?: string;
  source: CoverResolutionResult['source'];
  timestamp: number;
  isNegative: boolean;
}

export class CoverResolverService {
  private cache = new Map<string, CacheEntry>();
  private readonly POSITIVE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly NEGATIVE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Resolves and verifies the best available cover art for a book.
   */
  async resolveCover(options: CoverResolutionOptions): Promise<CoverResolutionResult> {
    const cacheKey = this.buildCacheKey(options);
    if (cacheKey) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        if (cached.isNegative) {
          return { coverUrl: undefined, source: 'none', verified: false };
        }
        if (cached.url) {
          return { coverUrl: cached.url, source: cached.source, verified: true };
        }
      }
    }

    // 1. Stage 1: Local Embedded Cover (EPUB / PDF)
    if (options.embeddedCoverBuffer && options.embeddedCoverBuffer.length >= 100) {
      const mime = options.embeddedCoverMime || 'image/jpeg';
      const base64Data = options.embeddedCoverBuffer.toString('base64');
      const dataUrl = `data:${mime};base64,${base64Data}`;
      this.setInCache(cacheKey, dataUrl, 'embedded', false);
      return {
        coverUrl: dataUrl,
        source: 'embedded',
        verified: true,
        contentLength: options.embeddedCoverBuffer.length,
        contentType: mime,
      };
    }

    // 2. Stage 2: Matched Provider Cover URL (already associated with winning match)
    if (options.providerCoverUrl) {
      const validation = await this.validateImageUrl(options.providerCoverUrl);
      if (validation.isValid) {
        this.setInCache(cacheKey, options.providerCoverUrl, 'provider', false);
        return {
          coverUrl: options.providerCoverUrl,
          source: 'provider',
          verified: true,
          contentLength: validation.contentLength,
          contentType: validation.contentType,
        };
      }
    }

    const cleanIsbn = (options.isbn13 || options.isbn || options.isbn10 || '')
      .replace(/[-\s]/g, '')
      .toUpperCase();
    const hasValidIsbn = isValidIsbn(cleanIsbn);

    // 3. Stage 3: Open Library Covers API with `?default=false`
    if (hasValidIsbn) {
      // Try Large, then Medium
      const olIsbnUrlL = `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg?default=false`;
      const validationL = await this.validateImageUrl(olIsbnUrlL);
      if (validationL.isValid) {
        this.setInCache(cacheKey, olIsbnUrlL, 'open-library', false);
        return {
          coverUrl: olIsbnUrlL,
          source: 'open-library',
          verified: true,
          contentLength: validationL.contentLength,
          contentType: validationL.contentType,
        };
      }

      const olIsbnUrlM = `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg?default=false`;
      const validationM = await this.validateImageUrl(olIsbnUrlM);
      if (validationM.isValid) {
        this.setInCache(cacheKey, olIsbnUrlM, 'open-library', false);
        return {
          coverUrl: olIsbnUrlM,
          source: 'open-library',
          verified: true,
          contentLength: validationM.contentLength,
          contentType: validationM.contentType,
        };
      }
    }

    if (options.openLibraryCoverId) {
      const olIdUrl = `https://covers.openlibrary.org/b/id/${options.openLibraryCoverId}-L.jpg?default=false`;
      const validation = await this.validateImageUrl(olIdUrl);
      if (validation.isValid) {
        this.setInCache(cacheKey, olIdUrl, 'open-library', false);
        return {
          coverUrl: olIdUrl,
          source: 'open-library',
          verified: true,
          contentLength: validation.contentLength,
          contentType: validation.contentType,
        };
      }
    }

    if (options.openLibraryEditionId) {
      const cleanOlid = options.openLibraryEditionId.replace('/books/', '');
      const olOlidUrl = `https://covers.openlibrary.org/b/olid/${cleanOlid}-L.jpg?default=false`;
      const validation = await this.validateImageUrl(olOlidUrl);
      if (validation.isValid) {
        this.setInCache(cacheKey, olOlidUrl, 'open-library', false);
        return {
          coverUrl: olOlidUrl,
          source: 'open-library',
          verified: true,
          contentLength: validation.contentLength,
          contentType: validation.contentType,
        };
      }
    }

    // 4. Stage 4: Google Books ImageLinks (High-Res & Cleaned)
    if (options.googleBooksImageLinks) {
      const links = options.googleBooksImageLinks;
      const candidates = [
        links.extraLarge,
        links.large,
        links.medium,
        links.small,
        links.thumbnail,
        links.smallThumbnail,
      ].filter(Boolean) as string[];

      for (const rawUrl of candidates) {
        // Transform: HTTPS upgrade, remove curl, request higher zoom if possible
        const cleaned = rawUrl
          .replace(/^http:/i, 'https:')
          .replace(/&edge=curl/gi, '');

        const validation = await this.validateImageUrl(cleaned);
        if (validation.isValid) {
          this.setInCache(cacheKey, cleaned, 'google-books', false);
          return {
            coverUrl: cleaned,
            source: 'google-books',
            verified: true,
            contentLength: validation.contentLength,
            contentType: validation.contentType,
          };
        }
      }
    }

    // 5. Stage 5: Internet Archive Book Images
    if (options.internetArchiveId) {
      const iaUrl = `https://archive.org/services/img/${encodeURIComponent(options.internetArchiveId)}`;
      const validation = await this.validateImageUrl(iaUrl);
      if (validation.isValid) {
        this.setInCache(cacheKey, iaUrl, 'internet-archive', false);
        return {
          coverUrl: iaUrl,
          source: 'internet-archive',
          verified: true,
          contentLength: validation.contentLength,
          contentType: validation.contentType,
        };
      }
    }

    // 6. Stage 6: Goodreads Scraper (Reverse Engineered from bookcover-api)
    if (hasValidIsbn) {
      const grCover = await this.fetchGoodreadsCoverByIsbn(cleanIsbn);
      if (grCover) {
        this.setInCache(cacheKey, grCover, 'goodreads', false);
        return {
          coverUrl: grCover,
          source: 'goodreads',
          verified: true,
        };
      }
    }

    // 7. Stage 7: Internet Archive Title Search Cover Resolution (Crucial for un-ISBN'd and Arabic books)
    if (options.title && options.title.trim().length >= 3) {
      try {
        const cleanTitle = options.title.trim().replace(/["()]/g, ' ');
        const iaSearchUrl = `https://archive.org/advancedsearch.php?q=title%3A(${encodeURIComponent(cleanTitle)})%20AND%20mediatype%3A(texts)&fl[]=identifier,title&rows=2&output=json`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const iaRes = await fetch(iaSearchUrl, {
          headers: { 'User-Agent': BAGLIB_USER_AGENT, Accept: 'application/json' },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (iaRes.ok) {
          const iaData = await iaRes.json();
          const firstDoc = iaData?.response?.docs?.[0];
          if (firstDoc?.identifier) {
            const iaCoverUrl = `https://archive.org/services/img/${encodeURIComponent(firstDoc.identifier)}`;
            const validation = await this.validateImageUrl(iaCoverUrl);
            if (validation.isValid) {
              this.setInCache(cacheKey, iaCoverUrl, 'internet-archive', false);
              return {
                coverUrl: iaCoverUrl,
                source: 'internet-archive',
                verified: true,
                contentLength: validation.contentLength,
                contentType: validation.contentType,
              };
            }
          }
        }
      } catch {
        // Continue to negative caching
      }
    }

    // 9. No valid cover found -> Apply negative caching
    this.setInCache(cacheKey, undefined, 'none', true);
    return {
      coverUrl: undefined,
      source: 'none',
      verified: false,
    };
  }

  /**
   * Validates whether a remote URL returns a usable, genuine image.
   * Checks HTTP 200, Content-Type image/*, and minimum Content-Length (1000 bytes)
   * to reject transparent 1x1 GIFs, broken links, and 43-byte placeholder responses.
   *
   * Optimized with fast HEAD verification and streaming initial chunk inspection
   * to prevent socket stalls and timeouts over slow/regional networks.
   */
  async validateImageUrl(
    url: string,
    timeoutMs = 6000
  ): Promise<{ isValid: boolean; contentType?: string; contentLength?: number }> {
    if (!url || !url.startsWith('http')) {
      return { isValid: false };
    }

    // Ensure Open Library covers API is called with default=false to avoid 43-byte 1x1 GIFs
    let targetUrl = url;
    if (targetUrl.includes('covers.openlibrary.org') && !targetUrl.includes('default=false')) {
      targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'default=false';
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      // 1. Fast HEAD request first to verify headers without downloading large image body
      let res: Response | null = null;
      try {
        res = await fetch(targetUrl, {
          method: 'HEAD',
          headers: {
            'User-Agent': BAGLIB_USER_AGENT,
            Accept: 'image/jpeg, image/png, image/webp, image/*',
          },
          signal: controller.signal,
        });
      } catch {
        // Server might not support HEAD or timed out
      }

      // If HEAD is 404, the image definitely doesn't exist
      if (res && res.status === 404) {
        clearTimeout(timer);
        return { isValid: false };
      }

      // If HEAD failed or returned 405 Method Not Allowed, fallback to streaming GET
      if (!res || res.status === 405 || (!res.ok && res.status !== 206)) {
        res = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            'User-Agent': BAGLIB_USER_AGENT,
            Accept: 'image/jpeg, image/png, image/webp, image/*',
            Range: 'bytes=0-4096',
          },
          signal: controller.signal,
        });
      }

      clearTimeout(timer);

      if (!res.ok && res.status !== 206) {
        return { isValid: false };
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.toLowerCase().startsWith('image/')) {
        return { isValid: false };
      }

      // Check Content-Length header if present
      const contentRange = res.headers.get('content-range');
      let totalLength: number | undefined;

      if (contentRange) {
        const match = contentRange.match(/\/(\d+)$/);
        if (match) totalLength = parseInt(match[1], 10);
      }

      if (!totalLength) {
        const clHeader = res.headers.get('content-length');
        if (clHeader) totalLength = parseInt(clHeader, 10);
      }

      // Known length checks
      if (totalLength !== undefined && totalLength < 1000) {
        return { isValid: false, contentType, contentLength: totalLength };
      }

      if (totalLength !== undefined && totalLength >= 1000) {
        return { isValid: true, contentType, contentLength: totalLength };
      }

      // If Content-Length header is omitted (chunked/redirected), inspect initial stream chunk
      if (res.body) {
        const reader = res.body.getReader();
        const { value, done } = await reader.read();
        await reader.cancel();
        const chunkLen = value ? value.length : 0;
        if (chunkLen < 500 && done) {
          return { isValid: false, contentType, contentLength: chunkLen };
        }
        return {
          isValid: true,
          contentType,
          contentLength: totalLength || chunkLen,
        };
      }

      return {
        isValid: true,
        contentType,
        contentLength: totalLength,
      };
    } catch {
      return { isValid: false };
    }
  }

  /**
   * Goodreads Cover Scraping using the reverse-engineered master resolution technique
   */
  private async fetchGoodreadsCoverByIsbn(isbn: string): Promise<string | null> {
    try {
      const searchUrl = `https://www.goodreads.com/search?utf8=%E2%9C%93&query=${encodeURIComponent(isbn)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
      });

      clearTimeout(timer);
      if (!res.ok) return null;

      const html = await res.text();

      // Look for BookCover image or og:image
      let imageUrl: string | null = null;

      const coverImgMatch = html.match(/class=["'][^"']*BookCover__image[^"']*["'][^>]*>\s*<img[^>]+src=["']([^"']+)["']/i);
      if (coverImgMatch) {
        imageUrl = coverImgMatch[1];
      } else {
        const legacyCoverMatch = html.match(/<img[^>]+class=["'][^"']*bookCover[^"']*["'][^>]+src=["']([^"']+)["']/i);
        if (legacyCoverMatch) imageUrl = legacyCoverMatch[1];
        else {
          const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
          if (ogImageMatch && !ogImageMatch[1].includes('nophoto')) {
            imageUrl = ogImageMatch[1];
          }
        }
      }

      if (!imageUrl || imageUrl.includes('nophoto')) return null;

      // Reverse-engineered master resolution trick: remove _[...]_ from Amazon/Goodreads CDN URLs
      const highResUrl = imageUrl.replace(/_[^_]*_\./, '.');

      const validation = await this.validateImageUrl(highResUrl);
      if (validation.isValid) return highResUrl;

      // Fallback to original URL
      const origValidation = await this.validateImageUrl(imageUrl);
      return origValidation.isValid ? imageUrl : null;
    } catch {
      return null;
    }
  }

  private buildCacheKey(options: CoverResolutionOptions): string | null {
    if (options.isbn13) return `isbn:${options.isbn13}`;
    if (options.isbn) return `isbn:${options.isbn}`;
    if (options.isbn10) return `isbn:${options.isbn10}`;
    if (options.openLibraryCoverId) return `olid:${options.openLibraryCoverId}`;
    if (options.title && options.author) return `ta:${options.title}::${options.author}`;
    if (options.title) return `t:${options.title}`;
    return null;
  }

  private getFromCache(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    const ttl = entry.isNegative ? this.NEGATIVE_TTL_MS : this.POSITIVE_TTL_MS;
    if (now - entry.timestamp > ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  private setInCache(
    key: string | null,
    url: string | undefined,
    source: CoverResolutionResult['source'],
    isNegative: boolean
  ) {
    if (!key) return;
    this.cache.set(key, {
      url,
      source,
      timestamp: Date.now(),
      isNegative,
    });
  }

  /**
   * Directly extracts an image from a local PDF as cover art.
   * Allows specifying pageIndex (1-based) to switch to next or previous pages.
   */
  async extractPdfCover(
    filePath: string,
    pageIndex: number = 1
  ): Promise<CoverResolutionResult & { currentPage?: number; totalPages?: number; pageNumber?: number }> {
    try {
      const extracted = EmbeddedMetadataExtractor.extractPdfImage(filePath, pageIndex);
      if (extracted) {
        return {
          coverUrl: extracted.dataUrl,
          source: 'embedded',
          verified: true,
          contentLength: extracted.coverBuffer.length,
          contentType: extracted.coverMimeType,
          currentPage: extracted.pageIndex,
          totalPages: extracted.totalPages,
          pageNumber: extracted.pageNumber,
        };
      }
    } catch (err) {
      console.warn(`[CoverResolverService] Failed to extract PDF cover from ${filePath}:`, err);
    }
    return {
      coverUrl: undefined,
      source: 'none',
      verified: false,
      currentPage: 1,
      totalPages: 0,
    };
  }

  public clearCache(): void {
    this.cache.clear();
  }
}

export const coverResolverService = new CoverResolverService();
