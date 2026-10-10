export interface BibliographicSource {
  provider: string; // 'Open Library', 'Google Books'
  providerId: string; // ID on the provider's side
  url?: string;
}

export interface BibliographicEdition {
  editionId: string;
  title?: string;
  publishDate?: string;
  publisher?: string;
  isbn?: string;
  isbn10?: string;
  isbn13?: string;
  pages?: number;
  coverUrl?: string;
  language?: string;
  sources: BibliographicSource[];
}

export interface BibliographicWork {
  workId: string; // Unique ID for the conceptual work
  title: string;
  authors: string[];
  firstPublishYear?: number;
  description?: string;
  subjects?: string[];
  editions: BibliographicEdition[];
}
