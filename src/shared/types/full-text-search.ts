/**
 * Baglib — Full-Text Search Engine Contracts (KEY-140)
 *
 * Defines contracts for morphology-aware In-Book search and
 * library-wide SQLite FTS5 search across all indexed books.
 */

export interface InBookSearchQuery {
  query: string;
  caseSensitive?: boolean;
  matchWholeWord?: boolean;
  normalizeArabic?: boolean;
}

export interface InBookSearchMatch {
  id: string;
  pageNumber: number;
  locationCfiOrPage: string;
  chapterTitle?: string;
  preContext: string;
  matchText: string;
  postContext: string;
  fullSnippet: string;
  characterIndex: number;
}

export interface InBookSearchProgress {
  currentSection: number;
  totalSections: number;
  matchesCount: number;
  matches: InBookSearchMatch[];
  isComplete: boolean;
}

export interface InBookSearchOptions {
  caseSensitive?: boolean;
  matchWholeWord?: boolean;
  normalizeArabic?: boolean;
  contextRadius?: number;
  signal?: AbortSignal;
  onProgress?: (progress: InBookSearchProgress) => void;
}

export interface IndexedBookPage {
  pageNumber: number;
  locationCfiOrPage?: string;
  chapterTitle?: string;
  content: string;
}

export interface LibraryFtsQuery {
  query: string;
  bookId?: string;
  limit?: number;
  offset?: number;
}

export interface LibraryFtsResult {
  bookId: string;
  bookTitle?: string;
  bookAuthor?: string;
  pageNumber: number;
  locationCfiOrPage: string;
  chapterTitle?: string;
  snippet: string;
  rank: number;
}
