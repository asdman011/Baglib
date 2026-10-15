/**
 * Baglib — Google Books Search Provider
 *
 * Implements ISearchProvider for querying the Google Books API.
 * Integrates quota tracking, HTML description stripping, and rich volume metadata mapping.
 */

import {
  ISearchProvider,
  SearchProviderId,
  UnifiedSearchQuery,
  UnifiedSearchResult,
} from '../../../../shared/types/search';
import { googleBooksClient } from '../../metadata/http-client';
import { QuotaTracker, quotaTracker as defaultQuotaTracker } from '../../metadata/quotaTracker';
import { DEFAULT_GOOGLE_BOOKS_API_KEY } from '../../metadata/providers/google-books.provider';

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

export class GoogleBooksSearchProvider implements ISearchProvider {
  public readonly id: SearchProviderId = 'googlebooks';
  public readonly name = 'Google Books';
  public readonly nameAr = 'كتب جوجل (Google Books)';
  public readonly description = 'Extensive global book catalog, summaries, and publication details';
  public readonly descriptionAr = 'فهرس عالمي ضخم للكتب وموجزات المحتوى وبيانات النشر الدقيقة';
  public readonly icon = 'book';
  public readonly supportsDownload = false;
  public readonly supportsFullText = true;

  private enabled = true;

  constructor(
    private quotaTracker: QuotaTracker = defaultQuotaTracker,
    private apiKey: string = DEFAULT_GOOGLE_BOOKS_API_KEY
  ) {}

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public async search(query: UnifiedSearchQuery, signal?: AbortSignal): Promise<UnifiedSearchResult[]> {
    if (signal?.aborted) return [];

    const rawTerm = (query.query || '').trim();
    const title = (query.title || '').trim();
    const author = (query.author || '').trim();
    const isbn = (query.isbn || '').trim();

    if (!rawTerm && !title && !author && !isbn) {
      return [];
    }

    // Quota check
    if (!this.quotaTracker.canRequest()) {
      console.warn('[baglib:googlebooks-search] Daily quota exhausted or reached safe ceiling.');
      return [];
    }

    try {
      const parts: string[] = [];
      if (isbn) {
        parts.push(`isbn:${isbn.replace(/[-\s]/g, '')}`);
      } else {
        if (title) parts.push(`intitle:${title}`);
        if (author) parts.push(`inauthor:${author}`);
        if (rawTerm && !title) parts.push(rawTerm);
      }

      const qString = parts.join(' ');
      const limit = Math.min(query.limit || 20, 40);
      const startIndex = query.page && query.page > 1 ? (query.page - 1) * limit : 0;

      const url = `/volumes?q=${encodeURIComponent(qString)}&maxResults=${limit}&startIndex=${startIndex}&key=${this.apiKey}`;
      this.quotaTracker.recordRequest();

      const data = await googleBooksClient.getJson<any>(url);

      if (signal?.aborted || !data?.items || !Array.isArray(data.items)) {
        return [];
      }

      const results: UnifiedSearchResult[] = [];

      for (const item of data.items) {
        const info = item.volumeInfo || {};
        const id = `googlebooks:${item.id}`;

        const authors: string[] = Array.isArray(info.authors) ? info.authors : [];
        const isbns = info.industryIdentifiers || [];
        const isbn10Obj = isbns.find((i: any) => i.type === 'ISBN_10');
        const isbn13Obj = isbns.find((i: any) => i.type === 'ISBN_13');
        const primaryIsbn = isbn13Obj?.identifier || isbn10Obj?.identifier;

        let publishYear: number | undefined;
        if (info.publishedDate) {
          const match = String(info.publishedDate).match(/^(\d{4})/);
          if (match) publishYear = parseInt(match[1], 10);
        }

        const images = info.imageLinks || {};
        const rawCover = images.extraLarge || images.large || images.medium || images.thumbnail || images.small;
        const coverUrl = rawCover ? rawCover.replace(/^http:/i, 'https:') : undefined;
        const thumbnailUrl = images.smallThumbnail ? images.smallThumbnail.replace(/^http:/i, 'https:') : coverUrl;

        results.push({
          id,
          providerId: 'googlebooks',
          providerName: this.name,
          title: info.title || 'Untitled',
          author: authors.length > 0 ? authors.join(', ') : 'Unknown Author',
          authors: authors.length > 0 ? authors : undefined,
          publisher: info.publisher,
          publishYear,
          language: info.language,
          isbn: primaryIsbn,
          isbn10: isbn10Obj?.identifier,
          isbn13: isbn13Obj?.identifier,
          coverUrl,
          thumbnailUrl,
          description: sanitizeHtml(info.description),
          subjects: Array.isArray(info.categories) ? info.categories : undefined,
          sourceUrl: info.infoLink || info.previewLink,
          score: 0.85,
        });
      }

      return results;
    } catch (err: any) {
      if (signal?.aborted) return [];
      console.warn('[baglib:googlebooks-search] Provider search error:', err?.message || err);
      return [];
    }
  }
}
