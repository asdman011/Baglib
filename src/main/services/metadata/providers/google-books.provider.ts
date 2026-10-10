import { MetadataProvider } from './provider.interface';
import { BibliographicWork, BibliographicEdition } from '../../../../shared/types/bibliographic';
import { googleBooksClient } from '../http-client';

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
      description: volumeInfo.description,
      firstPublishYear: volumeInfo.publishedDate ? parseInt(volumeInfo.publishedDate.substring(0, 4)) : undefined,
      subjects: volumeInfo.categories || [],
      editions: [edition],
    };
  }

  async search(query: string, maxResults = 10): Promise<BibliographicWork[]> {
    if (!query) return [];

    try {
      const url = `/volumes?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
      const data = await googleBooksClient.getJson<any>(url);

      if (!data || !data.items) return [];

      return data.items.map((item: any) => this.mapVolumeToWork(item));
    } catch (err) {
      console.error('[GoogleBooksProvider] Search failed:', err);
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
    } catch (err) {
      console.error(`[GoogleBooksProvider] getWorkDetails failed for ${workId}:`, err);
      return null;
    }
  }

  async searchByIsbn(isbn: string): Promise<BibliographicWork | null> {
    try {
      const url = `/volumes?q=isbn:${isbn}&maxResults=1`;
      const data = await googleBooksClient.getJson<any>(url);

      if (!data || !data.items || data.items.length === 0) return null;

      return this.mapVolumeToWork(data.items[0]);
    } catch (err) {
      console.error(`[GoogleBooksProvider] searchByIsbn failed for ${isbn}:`, err);
      return null;
    }
  }
}
