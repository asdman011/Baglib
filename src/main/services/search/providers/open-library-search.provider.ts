/**
 * Baglib — Open Library Search Provider
 *
 * Implements ISearchProvider for querying Open Library's open search API.
 * Maps open bibliographic records, covers, and subjects into UnifiedSearchResult.
 */

import {
  ISearchProvider,
  SearchProviderId,
  UnifiedSearchQuery,
  UnifiedSearchResult,
} from '../../../../shared/types/search';
import { openLibraryClient } from '../../metadata/http-client';

export class OpenLibrarySearchProvider implements ISearchProvider {
  public readonly id: SearchProviderId = 'openlibrary';
  public readonly name = 'Open Library';
  public readonly nameAr = 'المكتبة المفتوحة (Open Library)';
  public readonly description = 'World catalog of millions of public book records and cover art';
  public readonly descriptionAr = 'فهرس عالمي مفتوح يضم ملايين سجلات الكتب وأغلفتها';
  public readonly icon = 'globe';
  public readonly supportsDownload = false;
  public readonly supportsFullText = false;

  private enabled = true;

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

    try {
      const params = new URLSearchParams();
      if (isbn) {
        params.append('isbn', isbn);
      } else {
        if (title) params.append('title', title);
        if (author) params.append('author', author);
        if (rawTerm && !title) params.append('q', rawTerm);
      }

      const limit = Math.min(query.limit || 20, 50);
      params.append('limit', String(limit));
      if (query.page && query.page > 1) {
        params.append('page', String(query.page));
      }

      const url = `/search.json?${params.toString()}`;
      const data = await openLibraryClient.getJson<any>(url);

      if (signal?.aborted || !data?.docs || !Array.isArray(data.docs)) {
        return [];
      }

      const results: UnifiedSearchResult[] = [];

      for (const doc of data.docs) {
        const rawKey = doc.key ? String(doc.key).replace('/works/', '') : '';
        const id = `openlibrary:${rawKey || doc.cover_edition_key || Math.random().toString(36).slice(2, 9)}`;

        const authors: string[] = Array.isArray(doc.author_name)
          ? doc.author_name
          : typeof doc.author_name === 'string'
          ? [doc.author_name]
          : [];

        const isbns: string[] = Array.isArray(doc.isbn)
          ? doc.isbn
          : typeof doc.isbn === 'string'
          ? [doc.isbn]
          : [];

        const primaryIsbn = isbns[0];
        const publishYear = doc.first_publish_year || (Array.isArray(doc.publish_year) ? doc.publish_year[0] : undefined);

        let coverUrl: string | undefined;
        let thumbnailUrl: string | undefined;
        if (doc.cover_i) {
          coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
          thumbnailUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`;
        }

        results.push({
          id,
          providerId: 'openlibrary',
          providerName: this.name,
          title: doc.title || 'Untitled',
          author: authors.length > 0 ? authors.join(', ') : 'Unknown Author',
          authors: authors.length > 0 ? authors : undefined,
          publisher: Array.isArray(doc.publisher) ? doc.publisher[0] : doc.publisher,
          publishYear: typeof publishYear === 'number' ? publishYear : undefined,
          language: Array.isArray(doc.language) ? doc.language[0] : doc.language,
          isbn: primaryIsbn,
          coverUrl,
          thumbnailUrl,
          subjects: Array.isArray(doc.subject) ? doc.subject.slice(0, 6) : undefined,
          sourceUrl: doc.key ? `https://openlibrary.org${doc.key}` : undefined,
          score: 0.8,
        });
      }

      return results;
    } catch (err: any) {
      if (signal?.aborted) return [];
      console.warn('[baglib:openlibrary-search] Provider search error:', err?.message || err);
      return [];
    }
  }
}
