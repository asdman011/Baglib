import { BibliographicWork } from '../../../../shared/types/bibliographic';

export interface SearchQuery {
  title?: string;
  author?: string;
  general?: string;
}

export interface MetadataProvider {
  /** The unique name of the provider (e.g. 'Open Library') */
  get name(): string;

  /** Search for works by query string or structured title/author query */
  search(query: string | SearchQuery, maxResults?: number): Promise<BibliographicWork[]>;

  /** Fetch details of a specific work including editions */
  getWorkDetails(workId: string): Promise<BibliographicWork | null>;

  /** Search by ISBN specifically */
  searchByIsbn(isbn: string): Promise<BibliographicWork | null>;
}

