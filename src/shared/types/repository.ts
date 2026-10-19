/**
 * Baglib — Repository Layer Contracts & Domain Interfaces
 *
 * Defines the stable repository interfaces and domain DTOs.
 * Renderer/UI consumes these contracts via IPC without importing database code.
 */

import type { BookItem, BookItemInput } from './work';
import type { CategoryBreadcrumb, CategoryNode } from './category';
import type { PageNoteDTO, PageNotePayload } from './knowledge';

export * from './work';
export type { ContributorRole } from './work';
export * from './category';
export * from './knowledge';
export * from './physical-library';
export * from './library-views';
export * from './tag';
export * from './search';
export * from './enrichment';

// Re-export sprint 1 domain interfaces & DTOs
export * from '../../../baglib_library_repository_interfaces_sprint_1';

/**
 * Interface for Work repository operations.
 */
export interface IWorkRepository {
  /**
   * Retrieves all works mapped to application BookItem objects.
   */
  getAllWorks(): Promise<BookItem[]> | BookItem[];

  /**
   * Retrieves a single work by ID, or null if not found.
   */
  getById?(workId: string): Promise<BookItem | null> | BookItem | null;

  /**
   * Adds a new work, author, edition, source in a transaction.
   */
  addBook(data: BookItemInput): Promise<BookItem> | BookItem;

  /**
   * Updates an existing work and its associated details.
   */
  updateBook(data: BookItemInput): Promise<BookItemInput> | BookItemInput;

  /**
   * Deletes a work by its ID.
   */
  deleteBook(workId: string): Promise<boolean> | boolean;

  /**
   * Updates reading status and progress for a work.
   */
  updateReadingStatus?(workId: string, status: import('./work').ReadingStatus, progress?: number): Promise<boolean> | boolean;

  /**
   * Records a new borrower loan for a work.
   */
  recordLoan?(workId: string, loanData: Partial<import('./metadata').LendingRecord>): Promise<import('./metadata').LendingRecord> | import('./metadata').LendingRecord;

  /**
   * Marks a loan as returned with optional return date and condition.
   */
  returnLoan?(loanId: string, returnDate?: string, conditionOnReturn?: string): Promise<import('./metadata').LendingRecord> | import('./metadata').LendingRecord;

  /**
   * Retrieves all lending records for a specific work.
   */
  getLendingHistory?(workId: string): Promise<import('./metadata').LendingRecord[]> | import('./metadata').LendingRecord[];

  /**
   * Retrieves all active or overdue loans across the entire library.
   */
  getActiveLoans?(): Promise<Array<import('./metadata').LendingRecord & { workTitle: string }>> | Array<import('./metadata').LendingRecord & { workTitle: string }>;

  /**
   * Finds a work by its digital file content hash.
   */
  findWorkByFileHash?(fileHash: string): Promise<BookItem | null> | BookItem | null;

  /**
   * Finds a work by its digital file path on disk.
   */
  findWorkByFilePath?(filePath: string): Promise<BookItem | null> | BookItem | null;

  /**
   * Finds a work by its ISBN-10 or ISBN-13.
   */
  findWorkByIsbn?(isbn: string): Promise<BookItem | null> | BookItem | null;

  /**
   * Verifies file accessibility and health on disk.
   */
  verifyFileHealth?(workId: string): Promise<import('./digital-file').FileHealthInfo | null> | import('./digital-file').FileHealthInfo | null;

  /**
   * Verifies all digital files across the library.
   */
  verifyAllDigitalFiles?(): Promise<import('./digital-file').StorageHealthSummary> | import('./digital-file').StorageHealthSummary;

  /**
   * Adds an edition and digital source to an existing work.
   */
  addEditionToWork?(
    workId: string,
    editionData: {
      edition?: string;
      publisher?: string;
      publicationYear?: number | string;
      isbn?: string;
      language?: string;
      filePath?: string;
      fileHash?: string;
      digitalFormat?: import('./work').DigitalFormat;
      fileSize?: string;
    }
  ): Promise<BookItem | null> | BookItem | null;

  /**
   * Retrieves paginated works using multi-criteria filtering and SQL sorting.
   */
  getPaginatedWorks?(options: import('./library-views').WorkQueryOptions): Promise<import('./library-views').PaginatedWorksResult> | import('./library-views').PaginatedWorksResult;

  /**
   * Bulk updates category assignment for multiple works.
   */
  bulkUpdateCategory?(workIds: string[], categoryId: string): Promise<number> | number;

  /**
   * Bulk updates reading status and progress for multiple works.
   */
  bulkUpdateReadingStatus?(workIds: string[], status: import('./work').ReadingStatus, progress?: number): Promise<number> | number;

  /**
   * Bulk adds tags to multiple works.
   */
  bulkAddTags?(workIds: string[], tags: string[]): Promise<number> | number;

  /**
   * Bulk deletes multiple works atomically.
   */
  bulkDelete?(workIds: string[]): Promise<number> | number;
}


/**
 * Interface for Category repository operations.
 */
export interface ICategoryRepository {
  /**
   * Fetches work IDs that belong to a category or any of its descendant subcategories.
   */
  getSubtreeWorkIds(categoryId: string): Promise<string[]>;

  /**
   * Fetches breadcrumb chain from root down to the specified category.
   */
  getBreadcrumbs(categoryId: string): Promise<CategoryBreadcrumb[]>;

  /**
   * Fetches the complete hierarchical tree of categories with optional book counts.
   */
  getCategoryTree(options?: { includeCounts?: boolean }): Promise<CategoryNode[]>;

  /**
   * Creates a new category.
   */
  createCategory?(input: import('./category').CategoryCreateInput): Promise<import('./category').Category> | import('./category').Category;

  /**
   * Updates an existing category.
   */
  updateCategory?(id: string, input: import('./category').CategoryUpdateInput): Promise<import('./category').Category> | import('./category').Category;

  /**
   * Deletes a category with orphan handling or work reassignment.
   */
  deleteCategory?(id: string, strategy?: import('./category').CategoryDeleteStrategy, reassignToId?: string): Promise<boolean> | boolean;

  /**
   * Reorders categories by displayOrder.
   */
  reorderCategories?(orderedIds: string[]): Promise<boolean> | boolean;

  /**
   * Retrieves a category by its ID.
   */
  getCategoryById?(id: string): Promise<import('./category').Category | null> | import('./category').Category | null;

  /**
   * Retrieves all flat categories.
   */
  getAllCategories?(): Promise<import('./category').Category[]> | import('./category').Category[];
}

/**
 * Interface for Tag repository operations.
 */
export interface ITagRepository {
  /**
   * Creates a new tag if not already existing.
   */
  createTag(name: string, category?: string): Promise<import('./tag').Tag> | import('./tag').Tag;

  /**
   * Retrieves all tags with their book association count.
   */
  getAllTags(): Promise<import('./tag').TagWithCount[]> | import('./tag').TagWithCount[];

  /**
   * Retrieves most popular tags sorted by work count descending.
   */
  getPopularTags(limit?: number): Promise<import('./tag').TagWithCount[]> | import('./tag').TagWithCount[];

  /**
   * Renames a tag.
   */
  updateTag(id: string, name: string): Promise<import('./tag').Tag> | import('./tag').Tag;

  /**
   * Deletes a tag and removes its associations.
   */
  deleteTag(id: string): Promise<boolean> | boolean;

  /**
   * Merges source tag into target tag, re-pointing all work_tag associations and updating metadata.
   */
  mergeTags(sourceTagId: string, targetTagId: string): Promise<number> | number;
}

/**
 * Interface for Knowledge (notes, annotations) repository operations.
 */
export interface IKnowledgeRepository {
  /**
   * Retrieves all notes across works (legacy helper).
   */
  getAllNotes(): Promise<PageNoteDTO[]> | PageNoteDTO[];

  /**
   * Adds a new note attached to a work (legacy helper).
   */
  addNote(note: PageNotePayload): Promise<PageNotePayload> | PageNotePayload;

  /**
   * Deletes a note by its ID (legacy helper).
   */
  deleteNote(noteId: string): Promise<void> | void;

  /**
   * Retrieves all knowledge items (highlights, notes, quotes, bookmarks, questions) for a work.
   */
  getKnowledgeByWork?(workId: string, type?: import('./knowledge').KnowledgeType): Promise<import('./knowledge').KnowledgeItemDTO[]> | import('./knowledge').KnowledgeItemDTO[];

  /**
   * Retrieves all knowledge items across all works.
   */
  getAllKnowledge?(): Promise<import('./knowledge').KnowledgeItemDTO[]> | import('./knowledge').KnowledgeItemDTO[];

  /**
   * Creates or updates a polymorphic knowledge record with its type-specific details.
   */
  saveKnowledge?(payload: import('./knowledge').SaveKnowledgePayload): Promise<import('./knowledge').KnowledgeItemDTO> | import('./knowledge').KnowledgeItemDTO;

  /**
   * Deletes a knowledge record by ID.
   */
  deleteKnowledge?(knowledgeId: string): Promise<boolean> | boolean;

  /**
   * Records a completed or ongoing reading session.
   */
  recordReadingSession?(session: import('./knowledge').RecordReadingSessionPayload): Promise<import('./knowledge').ReadingSessionRecord> | import('./knowledge').ReadingSessionRecord;

  /**
   * Retrieves reading sessions for a work.
   */
  getReadingSessions?(workId: string): Promise<import('./knowledge').ReadingSessionRecord[]> | import('./knowledge').ReadingSessionRecord[];

  /**
   * Updates last read location (page number or CFI) on the work record.
   */
  updateLastReadLocation?(workId: string, location: string): Promise<boolean> | boolean;

  /**
   * Retrieves the last read location for a work.
   */
  getLastReadLocation?(workId: string): Promise<string | null> | string | null;
}
