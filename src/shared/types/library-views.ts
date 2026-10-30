/**
 * Baglib — Library Views, Pagination, Sorting & Bulk Operations Domain Types
 *
 * Defines contracts for multi-criteria querying, pagination, view preferences,
 * card/list densities, and batch operations.
 */

import type { BookItem, ReadingStatus } from './work';

export type LibrarySortField =
  | 'title'
  | 'author'
  | 'year'
  | 'category'
  | 'format'
  | 'status'
  | 'location'
  | 'newest'
  | 'rating'
  | 'progress';

export type SortDirection = 'asc' | 'desc';

export type CardDensity = 'compact' | 'comfortable' | 'spacious';
export type ListDensity = 'compact' | 'normal';

export type ListColumnKey =
  | 'cover'
  | 'title'
  | 'author'
  | 'category'
  | 'format'
  | 'location'
  | 'status'
  | 'year'
  | 'publisher'
  | 'isbn'
  | 'tags'
  | 'actions';

export interface WorkQueryOptions {
  page?: number;                  // 1-indexed (default 1)
  pageSize?: number;              // default 24 (grid) or 25 (list)
  sortBy?: LibrarySortField;      // default 'newest'
  sortDirection?: SortDirection;  // default 'desc' for newest/year, 'asc' for others
  search?: string;                // search query string
  bookType?: 'digital' | 'physical' | 'hybrid' | 'ALL';
  readingStatus?: 'reading' | 'unread' | 'completed' | 'paused' | 'abandoned' | 'ALL';
  digitalFormat?: string | 'ALL';
  categoryId?: string | 'ALL';    // primary_category_id or category subtree
  tag?: string | 'ALL';
  lendingStatus?: 'AVAILABLE' | 'LENT' | 'OVERDUE' | 'ALL';
  location?: string | 'ALL';      // matches room, shelf, bookcase, or section
  storageFilter?: 'HEALTHY' | 'ATTENTION' | 'DUPLICATES' | 'TRASH' | 'ALL';
  showTrash?: boolean;
}

export interface PaginatedWorksResult {
  items: BookItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ViewPreferences {
  viewMode: 'grid' | 'list';
  cardDensity: CardDensity;
  listDensity: ListDensity;
  visibleColumns: ListColumnKey[];
  sortBy: LibrarySortField;
  sortDirection: SortDirection;
  pageSize: number;
}

export interface BulkOperationResult {
  success: boolean;
  affectedCount: number;
  error?: string;
}

export interface BulkUpdateCategoryInput {
  workIds: string[];
  categoryId: string;
}

export interface BulkUpdateStatusInput {
  workIds: string[];
  readingStatus: ReadingStatus;
  readingProgress?: number;
}

export interface BulkAddTagsInput {
  workIds: string[];
  tags: string[];
}

export interface BulkDeleteInput {
  workIds: string[];
  permanent?: boolean;
}

export interface BulkRestoreInput {
  workIds: string[];
}
