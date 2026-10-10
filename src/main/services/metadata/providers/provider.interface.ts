import { BibliographicWork } from '../../../../shared/types/bibliographic';

export interface MetadataProvider {
  /** The unique name of the provider (e.g. 'Open Library') */
  get name(): string;

  /** Search for works by query (title, author, etc) */
  search(query: string, maxResults?: number): Promise<BibliographicWork[]>;

  /** Fetch details of a specific work including editions */
  getWorkDetails(workId: string): Promise<BibliographicWork | null>;

  /** Search by ISBN specifically */
  searchByIsbn(isbn: string): Promise<BibliographicWork | null>;
}
