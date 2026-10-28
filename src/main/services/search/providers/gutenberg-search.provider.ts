import { errorMessage } from '../../../../shared/errors';
/**
 * Baglib — Project Gutenberg Public Domain Provider
 *
 * Implements ISearchProvider via the Gutendex REST API.
 * Provides over 70,000 public domain classic works with guaranteed free EPUB/PDF downloads.
 */

import {
  ISearchProvider,
  SearchProviderId,
  UnifiedSearchQuery,
  UnifiedSearchResult,
  SearchFormat,
} from '../../../../shared/types/search';
import { HttpClient } from '../../metadata/http-client';

export class GutenbergSearchProvider implements ISearchProvider {
  public readonly id: SearchProviderId = 'gutenberg';
  public readonly name = 'Project Gutenberg';
  public readonly nameAr = 'مشروع غوتنبرغ (Project Gutenberg)';
  public readonly description = 'Over 70,000 free public domain classic ebooks with direct downloads';
  public readonly descriptionAr = 'أكثر من 70 ألف كتاب كلاسيكي مجاني في النطاق العام مع تنزيل فوري';
  public readonly icon = 'feather';
  public readonly supportsDownload = true;
  public readonly supportsFullText = true;

  private enabled = true;
  private client: HttpClient;

  constructor(client?: HttpClient) {
    this.client = client || new HttpClient({
      baseUrl: 'https://gutendex.com',
      timeoutMs: 10000,
      defaultHeaders: {
        'User-Agent': 'Baglib-Desktop-App/1.0 (https://github.com/baglib/baglib)',
      },
    });
  }

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

    const searchTerm = [title, author, rawTerm].filter(Boolean).join(' ').trim();
    if (!searchTerm) {
      return [];
    }

    try {
      const pageParam = query.page && query.page > 1 ? `&page=${query.page}` : '';
      const url = `/books/?search=${encodeURIComponent(searchTerm)}${pageParam}`;
      const data = await this.client.getJson<{ results?: { id: number; title: string; authors?: (string | { name?: string })[]; formats?: Record<string, string>; languages?: string[]; subjects?: string[] }[] }>(url);

      if (signal?.aborted || !data?.results || !Array.isArray(data.results)) {
        return [];
      }

      const results: UnifiedSearchResult[] = [];

      for (const item of data.results) {
        const id = `gutenberg:${item.id}`;

        const authors: string[] = Array.isArray(item.authors)
          ? item.authors.map((a) => {
              if (typeof a === 'string') return a;
              if (a?.name && String(a.name).includes(',')) {
                const parts = a.name.split(',').map((p: string) => p.trim());
                if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
              }
              return a?.name || '';
            }).filter(Boolean)
          : [];

        const formats = item.formats || {};
        const availableFormats: SearchFormat[] = [];
        let downloadUrl: string | undefined;

        if (formats['application/epub+zip']) {
          availableFormats.push('EPUB');
          downloadUrl = formats['application/epub+zip'];
        }
        if (formats['application/pdf']) {
          availableFormats.push('PDF');
          if (!downloadUrl) downloadUrl = formats['application/pdf'];
        }
        if (formats['text/plain'] || formats['text/plain; charset=us-ascii'] || formats['text/plain; charset=utf-8']) {
          availableFormats.push('TXT');
          if (!downloadUrl) {
            downloadUrl = formats['text/plain; charset=utf-8'] || formats['text/plain'] || formats['text/plain; charset=us-ascii'];
          }
        }

        const coverUrl = formats['image/jpeg'] || undefined;
        const sourceUrl = `https://www.gutenberg.org/ebooks/${item.id}`;

        results.push({
          id,
          providerId: 'gutenberg',
          providerName: this.name,
          title: item.title || 'Untitled',
          author: authors.length > 0 ? authors.join(', ') : 'Unknown Author',
          authors: authors.length > 0 ? authors : undefined,
          language: Array.isArray(item.languages) ? item.languages[0] : item.languages,
          coverUrl,
          thumbnailUrl: coverUrl,
          subjects: Array.isArray(item.subjects) ? item.subjects.slice(0, 5) : undefined,
          sourceUrl,
          downloadUrl,
          availableFormats: availableFormats.length > 0 ? availableFormats : undefined,
          score: 0.82,
        });
      }

      const limit = query.limit || 20;
      return results.slice(0, limit);
    } catch (err: unknown) {
      if (signal?.aborted) return [];
      console.warn('[baglib:gutenberg-search] Provider search error:', errorMessage(err) || err);
      return [];
    }
  }
}
