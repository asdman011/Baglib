/**
 * Baglib — Unified Search & Provider Discovery Contracts
 *
 * Defines the cross-process types and interfaces for simultaneous
 * multi-provider book discovery across local catalog and online archives.
 */

export type SearchProviderId =
  | 'local'
  | 'openlibrary'
  | 'googlebooks'
  | 'internetarchive'
  | 'gutenberg';

export type SearchScope = 'all' | 'local' | 'online' | 'fulltext';

export type SearchFormat = 'EPUB' | 'PDF' | 'MOBI' | 'TXT' | 'AUDIO';

export interface SearchProviderInfo {
  id: SearchProviderId;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  icon: string;
  enabled: boolean;
  supportsDownload: boolean;
  supportsFullText: boolean;
  requiresApiKey?: boolean;
}

export interface UnifiedSearchResult {
  /** Unique composite ID: e.g. "local:w-123", "openlibrary:OL123W", "googlebooks:abc12" */
  id: string;
  providerId: SearchProviderId;
  providerName: string;
  title: string;
  author: string;
  authors?: string[];
  publisher?: string;
  publishYear?: number;
  language?: string;
  isbn?: string;
  isbn10?: string;
  isbn13?: string;
  coverUrl?: string;
  thumbnailUrl?: string;
  description?: string;
  subjects?: string[];
  
  /** Online access & direct downloads */
  sourceUrl?: string;
  downloadUrl?: string;
  availableFormats?: SearchFormat[];
  fileSizeBytes?: number;

  /** Local library cross-reference (Duplicate Detection) */
  inLibrary?: boolean;
  localWorkId?: string;
  matchedEditionId?: string;

  /** Relevance or ranking score (0.0 - 1.0) */
  score?: number;
}

export interface UnifiedSearchQuery {
  query: string;
  title?: string;
  author?: string;
  isbn?: string;
  scope?: SearchScope;
  providers?: SearchProviderId[];
  limit?: number;
  page?: number;
}

export type ProviderSearchStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface SearchProgressUpdate {
  searchId: string;
  providerId: SearchProviderId;
  status: ProviderSearchStatus;
  resultCount: number;
  results?: UnifiedSearchResult[];
  error?: string;
  elapsedMs?: number;
}

export interface UnifiedSearchAggregateResult {
  searchId: string;
  query: UnifiedSearchQuery;
  results: UnifiedSearchResult[];
  totalResults: number;
  providerStatuses: Record<SearchProviderId, {
    status: ProviderSearchStatus;
    count: number;
    elapsedMs: number;
    error?: string;
  }>;
  hasLocalDuplicates: boolean;
}

export interface ImportSearchResultInput {
  result: UnifiedSearchResult;
  downloadDigitalCopy?: boolean;
  targetCategoryId?: string;
  targetTags?: string[];
}

export interface ImportSearchResultOutput {
  success: boolean;
  workId?: string;
  alreadyInLibrary?: boolean;
  downloadedFilePath?: string;
  error?: string;
}

export interface ISearchProvider {
  readonly id: SearchProviderId;
  readonly name: string;
  readonly nameAr: string;
  readonly description: string;
  readonly descriptionAr: string;
  readonly icon: string;
  readonly supportsDownload: boolean;
  readonly supportsFullText: boolean;

  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;

  search(query: UnifiedSearchQuery, signal?: AbortSignal): Promise<UnifiedSearchResult[]>;
}
