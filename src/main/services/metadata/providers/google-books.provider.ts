import { MetadataProvider, SearchQuery } from './provider.interface';
import { BibliographicWork, BibliographicEdition } from '../../../../shared/types/bibliographic';
import { googleBooksClient } from '../http-client';

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

    const edition: BibliographicEdition = {
      editionId: volume.id,
      title: volumeInfo.title,
      publishDate: volumeInfo.publishedDate,
      publisher: volumeInfo.publisher,
      isbn,
      isbn10,
      isbn13,
      pages: volumeInfo.pageCount,
      coverUrl: volumeInfo.imageLinks?.thumbnail?.replace('http:', 'https:'),
      language: volumeInfo.language,
      sources: [
        {
          provider: this.name,
          providerId: volume.id,
          url: volumeInfo.infoLink,
        }
      ]
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

  async search(query: string | SearchQuery, maxResults = 10): Promise<BibliographicWork[]> {
    if (!query) return [];

    try {
      let queryParam = '';
      if (typeof query === 'string') {
        if (!query.trim()) return [];
        queryParam = encodeURIComponent(query.trim());
      } else {
        const tokens: string[] = [];
        if (query.title?.trim()) tokens.push(`intitle:${query.title.trim()}`);
        if (query.author?.trim()) tokens.push(`inauthor:${query.author.trim()}`);
        if (query.general?.trim()) tokens.push(query.general.trim());
        if (tokens.length === 0) return [];
        queryParam = encodeURIComponent(tokens.join(' '));
      }

      const url = `/volumes?q=${queryParam}&maxResults=${maxResults}`;
      const data = await googleBooksClient.getJson<any>(url);

      if (!data || !data.items) return [];

      return data.items.map((item: any) => this.mapVolumeToWork(item));
    } catch (err: any) {
      if (String(err?.message).includes('429')) {
        console.info('[GoogleBooksProvider] Service rate limited (HTTP 429), failing over.');
      } else {
        console.warn('[GoogleBooksProvider] Search note:', err?.message || err);
      }
      return [];
    }
  }

  async getWorkDetails(workId: string): Promise<BibliographicWork | null> {
    try {
      // workId is prefixed with 'gb-'
      const volumeId = workId.startsWith('gb-') ? workId.substring(3) : workId;
      
      const data = await googleBooksClient.getJson<any>(`/volumes/${volumeId}`);
      if (!data) return null;

      return this.mapVolumeToWork(data);
    } catch (err: any) {
      if (String(err?.message).includes('429')) {
        console.info('[GoogleBooksProvider] GetWorkDetails rate limited (HTTP 429).');
      } else {
        console.warn(`[GoogleBooksProvider] getWorkDetails note for ${workId}:`, err?.message || err);
      }
      return null;
    }
  }

  async searchByIsbn(isbn: string): Promise<BibliographicWork | null> {
    try {
      const url = `/volumes?q=isbn:${isbn}&maxResults=1`;
      const data = await googleBooksClient.getJson<any>(url);

      if (!data || !data.items || data.items.length === 0) return null;

      return this.mapVolumeToWork(data.items[0]);
    } catch (err: any) {
      if (String(err?.message).includes('429')) {
        console.info('[GoogleBooksProvider] SearchByIsbn rate limited (HTTP 429).');
      } else {
        console.warn(`[GoogleBooksProvider] searchByIsbn note for ${isbn}:`, err?.message || err);
      }
      return null;
    }
  }
}
