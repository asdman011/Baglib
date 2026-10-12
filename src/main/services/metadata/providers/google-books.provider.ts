import { MetadataProvider, SearchQuery } from './provider.interface';
import { BibliographicWork, BibliographicEdition } from '../../../../shared/types/bibliographic';
import { googleBooksClient } from '../http-client';
import { QuotaTracker, quotaTracker as defaultQuotaTracker } from '../quotaTracker';

export const DEFAULT_GOOGLE_BOOKS_API_KEY = 'AIzaSyDLDKUVqab2CqPBN3QjuzGnE0phS0063UU';

function sanitizeHtml(html?: string): string | undefined {
  if (!html) return undefined;
  return html
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export class GoogleBooksProvider implements MetadataProvider {
  constructor(private quotaTracker: QuotaTracker = defaultQuotaTracker) {}

  get name(): string {
    return 'Google Books';
  }

  private mapVolumeToWork(volume: any): BibliographicWork {
    const volumeInfo = volume.volumeInfo || {};

    // Google Books merges Work and Edition concepts into a "Volume".
    // We separate it into a Work containing one Edition.

    const isbn10Obj = volumeInfo.industryIdentifiers?.find((i: any) => i.type === 'ISBN_10');
    const isbn13Obj = volumeInfo.industryIdentifiers?.find((i: any) => i.type === 'ISBN_13');

    const isbn10 = isbn10Obj ? isbn10Obj.identifier : undefined;
    const isbn13 = isbn13Obj ? isbn13Obj.identifier : undefined;
    const isbn = isbn13 || isbn10;

    const imageLinks = volumeInfo.imageLinks || {};
    const rawCover =
      imageLinks.extraLarge ||
      imageLinks.large ||
      imageLinks.medium ||
      imageLinks.thumbnail ||
      imageLinks.small ||
      imageLinks.smallThumbnail;
    const coverUrl = rawCover ? rawCover.replace(/^http:/i, 'https:') : undefined;

    const edition: BibliographicEdition = {
      editionId: volume.id,
      title: volumeInfo.title,
      publishDate: volumeInfo.publishedDate,
      publisher: volumeInfo.publisher,
      isbn,
      isbn10,
      isbn13,
      pages: volumeInfo.pageCount,
      coverUrl,
      language: volumeInfo.language,
      sources: [
        {
          provider: this.name,
          providerId: volume.id,
          url: volumeInfo.infoLink,
        },
      ],
    };

    return {
      workId: `gb-${volume.id}`,
      title: volumeInfo.title,
      authors: volumeInfo.authors || [],
      description: sanitizeHtml(volumeInfo.description),
      firstPublishYear: volumeInfo.publishedDate ? parseInt(volumeInfo.publishedDate.substring(0, 4)) : undefined,
      subjects: volumeInfo.categories || [],
      editions: [edition],
    };
  }

  private getApiKeyParam(): string {
    const key =
      process.env.GOOGLE_BOOKS_API_KEY ||
      (typeof globalThis !== 'undefined' && (globalThis as any).GOOGLE_BOOKS_API_KEY) ||
      DEFAULT_GOOGLE_BOOKS_API_KEY;
    return key ? `&key=${encodeURIComponent(key)}` : '';
  }

  private logError(err: any): void {
    const msg = String(err?.message || err);
    if (msg.includes('429')) {
      console.info(
        '[GoogleBooksProvider] Google Books API quota reached (HTTP 429). Retaining surviving candidates.'
      );
    } else if (msg.includes('503')) {
      console.info(
        '[GoogleBooksProvider] Google Books service temporarily unavailable (HTTP 503). Retaining surviving candidates.'
      );
    } else {
      console.warn('[GoogleBooksProvider] Request notice:', msg);
    }
  }

  /**
   * Executes a Google Books HTTP request with Quota-Saver protections:
   * 1. Hard stop if 1,000 requests reached.
   * 2. Intentional pacing sleep (2,500ms) when in Conservation Mode.
   * 3. Local daily quota increment.
   * 4. Single retry after 3,000ms backoff sleep on transient failure in Conservation Mode.
   */
  private async executeWithQuotaProtections<T>(requestFn: () => Promise<T>): Promise<T | null> {
    if (this.quotaTracker.isDepleted()) {
      return null;
    }

    if (this.quotaTracker.isConservationMode()) {
      await this.quotaTracker.applyPacingDelay();
    }

    if (this.quotaTracker.isDepleted()) {
      return null;
    }

    this.quotaTracker.recordRequest();

    try {
      return await requestFn();
    } catch (err: any) {
      if (this.quotaTracker.isConservationMode() && this.quotaTracker.canRequest()) {
        await this.quotaTracker.applyRetryBackoff();
        if (this.quotaTracker.canRequest()) {
          this.quotaTracker.recordRequest();
          try {
            return await requestFn();
          } catch (retryErr: any) {
            this.logError(retryErr);
            return null;
          }
        }
      }
      this.logError(err);
      return null;
    }
  }

  async search(query: string | SearchQuery, maxResults = 10): Promise<BibliographicWork[]> {
    if (!query) return [];
    if (this.quotaTracker.isDepleted()) return [];

    // Limit candidate depth in Conservation Mode from 5-10 down to 2 or 3
    const effectiveMaxResults = this.quotaTracker.isConservationMode()
      ? Math.min(maxResults, 2)
      : maxResults;

    let queryParam = '';
    if (typeof query === 'string') {
      if (!query.trim()) return [];
      queryParam = encodeURIComponent(query.trim());
    } else {
      const tokens: string[] = [];
      if (query.title?.trim()) tokens.push(`intitle:${query.title.trim()}`);
      if (query.author?.trim()) tokens.push(`inauthor:${query.author.trim()}`);
      if (query.general?.trim() && !query.title?.trim()) tokens.push(query.general.trim());
      if (tokens.length === 0) return [];
      queryParam = encodeURIComponent(tokens.join(' '));
    }

    const startIndex =
      typeof query === 'object' && query.startIndex !== undefined
        ? query.startIndex
        : typeof query === 'object' && query.page && query.page > 1
        ? (query.page - 1) * effectiveMaxResults
        : 0;

    const url = `/volumes?q=${queryParam}&maxResults=${effectiveMaxResults}&startIndex=${startIndex}${this.getApiKeyParam()}`;
    let data = await this.executeWithQuotaProtections(() => googleBooksClient.getJson<any>(url));

    // If structured search returned 0 items, fallback to title search directly
    if (
      (!data || !data.items || data.items.length === 0) &&
      typeof query !== 'string' &&
      query.title?.trim() &&
      !this.quotaTracker.isConservationMode() &&
      !this.quotaTracker.isDepleted()
    ) {
      const fallbackQuery = encodeURIComponent(query.title.trim());
      const fallbackUrl = `/volumes?q=${fallbackQuery}&maxResults=${effectiveMaxResults}${this.getApiKeyParam()}`;
      const fallbackData = await this.executeWithQuotaProtections(() =>
        googleBooksClient.getJson<any>(fallbackUrl)
      );
      if (fallbackData && fallbackData.items && fallbackData.items.length > 0) {
        data = fallbackData;
      }
    }

    if (!data || !data.items) return [];

    return data.items.map((item: any) => this.mapVolumeToWork(item));
  }

  async getWorkDetails(workId: string): Promise<BibliographicWork | null> {
    if (this.quotaTracker.isDepleted()) return null;

    const volumeId = workId.startsWith('gb-') ? workId.substring(3) : workId;
    const keyParam = this.getApiKeyParam() ? `?${this.getApiKeyParam().substring(1)}` : '';
    const url = `/volumes/${volumeId}${keyParam}`;

    const data = await this.executeWithQuotaProtections(() => googleBooksClient.getJson<any>(url));
    if (!data) return null;

    return this.mapVolumeToWork(data);
  }

  async searchByIsbn(isbn: string): Promise<BibliographicWork | null> {
    if (this.quotaTracker.isDepleted()) return null;

    const url = `/volumes?q=isbn:${isbn}&maxResults=1${this.getApiKeyParam()}`;
    const data = await this.executeWithQuotaProtections(() => googleBooksClient.getJson<any>(url));

    if (!data || !data.items || data.items.length === 0) return null;

    return this.mapVolumeToWork(data.items[0]);
  }
}
