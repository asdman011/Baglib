/**
 * Baglib — Metadata Enrichment & Safe Merge Types (Story 12 / KEY-3)
 */

import { BookItem, DigitalFormat } from './work';

export interface EnrichmentCandidateEdition {
  id: string;
  providerId: string;
  providerName: string;
  title: string;
  authors?: string[];
  publisher?: string;
  publicationYear?: number | string;
  isbn?: string;
  isbn10?: string;
  isbn13?: string;
  language?: string;
  description?: string;
  subjects?: string[];
  coverUrl?: string;
  coverResolution?: 'high' | 'medium' | 'thumbnail';
  downloadUrl?: string;
  downloadFormat?: DigitalFormat;
  sourceUrl?: string;
  pageCount?: number;
  matchConfidence?: number;
  matchReason?: string;
}

export type EnrichmentFieldKey =
  | 'title'
  | 'author'
  | 'publisher'
  | 'publicationYear'
  | 'isbn'
  | 'language'
  | 'description'
  | 'coverImage'
  | 'categories'
  | 'pagesCount';

export interface EnrichmentFieldDiff {
  field: EnrichmentFieldKey;
  labelKey: string;
  currentValue: any;
  incomingValue: any;
  hasCurrent: boolean;
  hasIncoming: boolean;
  isDifferent: boolean;
  isOverwriting: boolean;
}

export interface EnrichmentComparison {
  workId: string;
  currentBook: BookItem;
  candidate: EnrichmentCandidateEdition;
  diffs: Record<EnrichmentFieldKey, EnrichmentFieldDiff>;
  summary: {
    totalFields: number;
    newFieldsCount: number;
    overwritingCount: number;
    identicalCount: number;
  };
}

export interface ApplyEnrichmentRequest {
  workId: string;
  candidateId: string;
  selectedFields: EnrichmentFieldKey[];
  incomingValues: Partial<BookItem>;
  overwritePopulatedFields?: boolean;
  attachDigitalCopy?: boolean;
  downloadCoverLocally?: boolean;
}

export interface ApplyEnrichmentResult {
  success: boolean;
  workId: string;
  updatedBook: BookItem;
  appliedFields: EnrichmentFieldKey[];
  skippedFields: EnrichmentFieldKey[];
  downloadedCoverPath?: string;
  attachedDigitalPath?: string;
  error?: string;
}

export interface CandidateEditionsQueryResult {
  workId: string;
  candidates: EnrichmentCandidateEdition[];
  queryUsed: {
    isbn?: string;
    title?: string;
    author?: string;
  };
  totalFound: number;
}

export interface CoverFetchRequest {
  workId?: string;
  coverUrl?: string;
  isbn?: string;
  title?: string;
  author?: string;
  minSizeBytes?: number;
}

export interface CoverFetchResult {
  success: boolean;
  coverUrl: string;
  localPath?: string;
  source: string;
  resolution?: string;
  error?: string;
}
