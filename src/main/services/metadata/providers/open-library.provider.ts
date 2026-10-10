import { MetadataProvider, SearchQuery } from './provider.interface';
import { BibliographicWork, BibliographicEdition, BibliographicSource } from '../../../../shared/types/bibliographic';
import { openLibraryClient } from '../http-client';
import { isPlaceholderAuthor } from '../../../../shared/validators/metadata-validator';

export class OpenLibraryProvider implements MetadataProvider {
  get name(): string {
    return 'Open Library';
  }

  async search(query: string | SearchQuery, maxResults = 10): Promise<BibliographicWork[]> {
    if (!query) return [];

    try {
      let queryParam = '';
      let hasAuthor = false;
      let hasTitle = false;

      if (typeof query === 'string') {
        if (!query.trim()) return [];
        queryParam = `q=${encodeURIComponent(query.trim())}`;
      } else {
        const parts: string[] = [];
        if (query.title?.trim()) {
          parts.push(`title=${encodeURIComponent(query.title.trim())}`);
          hasTitle = true;
        }
        if (query.author?.trim() && !isPlaceholderAuthor(query.author)) {
          parts.push(`author=${encodeURIComponent(query.author.trim())}`);
          hasAuthor = true;
        }
        if (query.general?.trim() && !query.title) parts.push(`q=${encodeURIComponent(query.general.trim())}`);
        if (parts.length === 0) return [];
        queryParam = parts.join('&');
      }

      const url = `/search.json?${queryParam}&limit=${maxResults}`;
      const data = await openLibraryClient.getJson<any>(url);
      let docs = data?.docs;

      // Fallback: If title + author returned 0 docs, retry with title only
      if ((!docs || !Array.isArray(docs) || docs.length === 0) && hasAuthor && hasTitle && typeof query !== 'string' && query.title?.trim()) {
        const fallbackUrl = `/search.json?title=${encodeURIComponent(query.title.trim())}&limit=${maxResults}`;
        const fallbackData = await openLibraryClient.getJson<any>(fallbackUrl);
        if (fallbackData?.docs && Array.isArray(fallbackData.docs)) {
          docs = fallbackData.docs;
        }
      }

      if (!docs || !Array.isArray(docs)) return [];

      return data.docs.map((doc: any): BibliographicWork => {
        // Extract editions from search results
        const editions: BibliographicEdition[] = [];
        
        // Open library search results sometimes give the edition_key array
        if (doc.edition_key && Array.isArray(doc.edition_key)) {
          // We'll create a basic edition for the top one, or the ones provided
          const firstEditionKey = doc.edition_key[0];
          
          if (firstEditionKey) {
            editions.push({
              editionId: firstEditionKey,
              title: doc.title,
              publishDate: doc.first_publish_year ? doc.first_publish_year.toString() : undefined,
              publisher: doc.publisher ? doc.publisher[0] : undefined,
              isbn: doc.isbn ? doc.isbn[0] : undefined,
              coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined,
              language: doc.language ? doc.language[0] : undefined,
              sources: [
                {
                  provider: this.name,
                  providerId: firstEditionKey,
                  url: `https://openlibrary.org/books/${firstEditionKey}`,
                }
              ]
            });
          }
        } else {
          // Fallback if no edition keys are provided but we have a work
          editions.push({
            editionId: `fallback-${doc.key}`,
            title: doc.title,
            publishDate: doc.first_publish_year ? doc.first_publish_year.toString() : undefined,
            isbn: doc.isbn ? doc.isbn[0] : undefined,
            coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined,
            sources: []
          });
        }

        const workId = doc.key.replace('/works/', '');

        return {
          workId,
          title: doc.title,
          authors: doc.author_name || [],
          firstPublishYear: doc.first_publish_year,
          subjects: doc.subject || [],
          editions,
        };
      });
    } catch (err) {
      console.error('[OpenLibraryProvider] Search failed:', err);
      return [];
    }
  }

  async getWorkDetails(workId: string): Promise<BibliographicWork | null> {
    try {
      // Fetch work details
      const workData = await openLibraryClient.getJson<any>(`/works/${workId}.json`);
      
      // Fetch editions
      const editionsData = await openLibraryClient.getJson<any>(`/works/${workId}/editions.json`);

      const editions: BibliographicEdition[] = [];
      if (editionsData && editionsData.entries) {
        for (const ed of editionsData.entries) {
          const editionId = ed.key.replace('/books/', '');
          editions.push({
            editionId,
            title: ed.title,
            publishDate: ed.publish_date,
            publisher: ed.publishers ? ed.publishers[0] : undefined,
            isbn: ed.isbn_13 ? ed.isbn_13[0] : (ed.isbn_10 ? ed.isbn_10[0] : undefined),
            isbn10: ed.isbn_10 ? ed.isbn_10[0] : undefined,
            isbn13: ed.isbn_13 ? ed.isbn_13[0] : undefined,
            pages: ed.number_of_pages,
            coverUrl: ed.covers && ed.covers.length > 0 ? `https://covers.openlibrary.org/b/id/${ed.covers[0]}-L.jpg` : undefined,
            language: ed.languages && ed.languages.length > 0 ? ed.languages[0].key.replace('/languages/', '') : undefined,
            sources: [
              {
                provider: this.name,
                providerId: editionId,
                url: `https://openlibrary.org/books/${editionId}`,
              }
            ]
          });
        }
      }

      // Author resolution can be complex in OL (author is an object or array of objects with keys)
      // For simplicity in details, we might skip deep author hydration unless needed, or try to parse
      let authors: string[] = [];
      if (workData.authors) {
        // Normally requires another API call, but we return the keys or basic info
        authors = workData.authors.map((a: any) => a.author?.key || 'Unknown');
      }

      return {
        workId,
        title: workData.title,
        authors,
        description: typeof workData.description === 'string' ? workData.description : workData.description?.value,
        subjects: workData.subjects || [],
        editions,
      };

    } catch (err) {
      console.error(`[OpenLibraryProvider] getWorkDetails failed for ${workId}:`, err);
      return null;
    }
  }

  async searchByIsbn(isbn: string): Promise<BibliographicWork | null> {
    try {
      // The Books API returns edition-level data by ISBN
      const url = `/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
      const data = await openLibraryClient.getJson<any>(url);
      
      const bookData = data[`ISBN:${isbn}`];
      if (!bookData) return null;

      // In Open Library, the Books API doesn't always cleanly link back to the Work ID.
      // But we can construct a basic Work -> Edition model from the Edition data.
      
      const editionId = bookData.identifiers?.openlibrary ? bookData.identifiers.openlibrary[0] : `isbn-${isbn}`;
      const workId = bookData.key ? bookData.key.replace('/works/', '').replace('/books/', '') : `w-${isbn}`; // Usually returns book key, fallback
      
      const authors = bookData.authors ? bookData.authors.map((a: any) => a.name) : [];
      
      const edition: BibliographicEdition = {
        editionId,
        title: bookData.title,
        publishDate: bookData.publish_date,
        publisher: bookData.publishers ? bookData.publishers[0]?.name : undefined,
        isbn: isbn,
        pages: bookData.number_of_pages,
        coverUrl: bookData.cover ? bookData.cover.large : undefined,
        sources: [
          {
            provider: this.name,
            providerId: editionId,
            url: bookData.url,
          }
        ]
      };

      return {
        workId,
        title: bookData.title,
        authors,
        editions: [edition],
      };
    } catch (err) {
      console.error(`[OpenLibraryProvider] searchByIsbn failed for ${isbn}:`, err);
      return null;
    }
  }
}
