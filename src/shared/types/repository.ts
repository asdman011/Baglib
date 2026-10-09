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
export * from './category';
export * from './knowledge';

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
   * Fetches the complete hierarchical tree of categories.
   */
  getCategoryTree(): Promise<CategoryNode[]>;
}

/**
 * Interface for Knowledge (notes, annotations) repository operations.
 */
export interface IKnowledgeRepository {
  /**
   * Retrieves all notes across works.
   */
  getAllNotes(): Promise<PageNoteDTO[]> | PageNoteDTO[];

  /**
   * Adds a new note attached to a work.
   */
  addNote(note: PageNotePayload): Promise<PageNotePayload> | PageNotePayload;

  /**
   * Deletes a note by its ID.
   */
  deleteNote(noteId: string): Promise<void> | void;
}
