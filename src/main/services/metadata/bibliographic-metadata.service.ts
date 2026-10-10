import { MetadataProvider } from './providers/provider.interface';
import { OpenLibraryProvider } from './providers/open-library.provider';
import { GoogleBooksProvider } from './providers/google-books.provider';
import { BibliographicWork } from '../../../shared/types/bibliographic';

export class BibliographicMetadataService {
  private providers: MetadataProvider[];

  constructor() {
    this.providers = [
      new OpenLibraryProvider(),
      new GoogleBooksProvider(),
    ];
  }

  /**
   * Search across all providers using a waterfall fallback approach.
   * If the primary provider returns results, they are returned.
   * If it fails or returns empty, it falls back to the next provider.
   */
  async search(query: string, maxResults = 10): Promise<BibliographicWork[]> {
    for (const provider of this.providers) {
      try {
        const results = await provider.search(query, maxResults);
        if (results && results.length > 0) {
          return results;
        }
      } catch (err) {
        console.warn(`[BibliographicMetadataService] Provider ${provider.name} failed during search:`, err);
        // Fallback to next
      }
    }
    return [];
  }

  /**
   * Fetch work details by iterating through providers.
   * Since workIds are provider-specific, this should ideally be called directly on the provider,
   * but for abstraction we check if the ID matches a specific provider pattern if possible,
   * or just try all.
   */
  async getWorkDetails(workId: string): Promise<BibliographicWork | null> {
    // If it starts with gb-, we know it's Google Books
    if (workId.startsWith('gb-')) {
      const gbProvider = this.providers.find(p => p.name === 'Google Books');
      if (gbProvider) return gbProvider.getWorkDetails(workId);
    }

    // Otherwise assume it's Open Library or try sequentially
    for (const provider of this.providers) {
      try {
        const details = await provider.getWorkDetails(workId);
        if (details) return details;
      } catch (err) {
        console.warn(`[BibliographicMetadataService] Provider ${provider.name} failed during getWorkDetails:`, err);
      }
    }
    return null;
  }

  /**
   * Search by ISBN with fallback logic
   */
  async searchByIsbn(isbn: string): Promise<BibliographicWork | null> {
    for (const provider of this.providers) {
      try {
        const result = await provider.searchByIsbn(isbn);
        if (result) return result;
      } catch (err) {
        console.warn(`[BibliographicMetadataService] Provider ${provider.name} failed during searchByIsbn:`, err);
      }
    }
    return null;
  }
}

export const bibliographicMetadataService = new BibliographicMetadataService();
