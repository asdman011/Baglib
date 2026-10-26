/**
 * Baglib — Database IPC Handlers
 *
 * Exposes database status and diagnostics to the renderer
 * via Electron IPC. Repository-level CRUD handlers will be
 * added in later stories (BGL-106).
 */

import { ipcMain } from 'electron';
import { getDatabase, getDatabasePath } from '../database/connection';
import { WorkRepository } from '../database/repositories/work.repository';
import { coverResolverService } from '../services/metadata/cover-resolver.service';
import { getPdfPageCoverService } from '../services/metadata/pdf-page-cover.service';

function normalizeIpcError(err: unknown, fallbackMessage: string): Error {
  if (err instanceof Error) return err;
  if (typeof err === 'object' && err !== null && (err as any).message) {
    return new Error(String((err as any).message));
  }
  return new Error(typeof err === 'string' && err ? err : fallbackMessage);
}

export function setupDatabaseIPC() {
  /**
   * Returns basic database status info for debugging / status bar.
   */
  ipcMain.handle('database:get-status', () => {
    try {
      const db = getDatabase();
      const dbPath = getDatabasePath();

      const tables = db.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_migrations' AND name NOT LIKE 'sqlite_%'`
      ).all() as { name: string }[];

      const migrations = db.prepare(
        'SELECT id, name, applied_at FROM _migrations ORDER BY id'
      ).all() as { id: number; name: string; applied_at: string }[];

      return {
        connected: true,
        path: dbPath,
        tableCount: tables.length,
        tables: tables.map((t) => t.name),
        migrations,
      };
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to get database status:', err);
      return {
        connected: false,
        error: String(err),
      };
    }
  });

  /**
   * Fetch all books (works) from SQLite database
   */
  ipcMain.handle('library:get-all-books', () => {
    try {
      const db = getDatabase();
      const repo = new WorkRepository(db);
      return repo.getAllWorks();
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to fetch all books:', err);
      return [];
    }
  });

  /**
   * Add a new book (work, edition, author, source) into SQLite database
   * Defaults linked PDFs to their rendered first page unless the cover was explicitly selected.
   */
  ipcMain.handle('library:add-book', async (_, bookData) => {
    try {
      if (
        !bookData.coverImage &&
        bookData.metadataProvenance?.fieldSources?.coverImage?.status !== 'user_override' &&
        bookData.filePath &&
        typeof bookData.filePath === 'string' &&
        bookData.filePath.toLowerCase().endsWith('.pdf')
      ) {
        try {
          const pdfRes = await coverResolverService.extractPdfCover(bookData.filePath);
          if (pdfRes?.coverUrl) {
            bookData.coverImage = pdfRes.coverUrl;
          }
        } catch (pdfErr) {
          console.warn('[baglib/db-ipc] Auto PDF cover extraction fallback error:', pdfErr);
        }
      }
      const db = getDatabase();
      const repo = new WorkRepository(db);
      return repo.addBook(bookData);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to add book:', err);
      throw normalizeIpcError(err, 'Failed to add book');
    }
  });

  /**
   * Update an existing book (work, edition, metadata) in SQLite database
   * Renders the first PDF page when a linked book has no cover or explicit cover override.
   */
  ipcMain.handle('library:update-book', async (_, bookData) => {
    try {
      if (
        !bookData.coverImage &&
        bookData.metadataProvenance?.fieldSources?.coverImage?.status !== 'user_override' &&
        bookData.filePath &&
        typeof bookData.filePath === 'string' &&
        bookData.filePath.toLowerCase().endsWith('.pdf')
      ) {
        try {
          const pdfRes = await coverResolverService.extractPdfCover(bookData.filePath);
          if (pdfRes?.coverUrl) {
            bookData.coverImage = pdfRes.coverUrl;
          }
        } catch (pdfErr) {
          console.warn('[baglib/db-ipc] Auto PDF cover extraction fallback error:', pdfErr);
        }
      }
      const db = getDatabase();
      const repo = new WorkRepository(db);
      return repo.updateBook(bookData);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to update book:', err);
      throw normalizeIpcError(err, 'Failed to update book');
    }
  });

  /**
   * Delete a book from SQLite database by workId
   */
  ipcMain.handle('library:delete-book', (_, bookId: string) => {
    try {
      const db = getDatabase();
      const repo = new WorkRepository(db);
      return repo.deleteBook(bookId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to delete book:', err);
      throw normalizeIpcError(err, 'Failed to delete book');
    }
  });

  /**
   * Update reading status and progress for a book
   */
  ipcMain.handle('library:update-reading-status', (_, workId: string, status: any, progress?: number) => {
    try {
      const db = getDatabase();
      const repo = new WorkRepository(db);
      return repo.updateReadingStatus(workId, status, progress);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to update reading status:', err);
      throw normalizeIpcError(err, 'Failed to update reading status');
    }
  });

  /**
   * Lending Operations (Task 4.4 / 4.6)
   */
  ipcMain.handle('library:record-loan', (_, workId: string, loanData: any) => {
    try {
      const db = getDatabase();
      const repo = new WorkRepository(db);
      return repo.recordLoan(workId, loanData);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to record loan:', err);
      throw normalizeIpcError(err, 'Failed to record loan');
    }
  });

  ipcMain.handle('library:return-loan', (_, loanId: string, returnDate?: string, conditionOnReturn?: string) => {
    try {
      const db = getDatabase();
      const repo = new WorkRepository(db);
      return repo.returnLoan(loanId, returnDate, conditionOnReturn);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to return loan:', err);
      throw normalizeIpcError(err, 'Failed to return loan');
    }
  });

  ipcMain.handle('library:get-lending-history', (_, workId: string) => {
    try {
      const db = getDatabase();
      const repo = new WorkRepository(db);
      return repo.getLendingHistory(workId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to fetch lending history:', err);
      return [];
    }
  });

  ipcMain.handle('library:get-active-loans', () => {
    try {
      const db = getDatabase();
      const repo = new WorkRepository(db);
      return repo.getActiveLoans();
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to fetch active loans:', err);
      return [];
    }
  });

  /**
   * Fetch all notes
   */
  ipcMain.handle('library:get-all-notes', () => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/knowledge.repository').KnowledgeRepository)(db);
      return repo.getAllNotes();
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to fetch notes:', err);
      return [];
    }
  });

  /**
   * Add a new note
   */
  ipcMain.handle('library:add-note', (_, noteData) => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/knowledge.repository').KnowledgeRepository)(db);
      const annotRepo = new (require('../database/repositories/annotation.repository').AnnotationRepository)(db);

      // Save to annotations table as well
      try {
        annotRepo.save({
          id: noteData.id,
          bookId: noteData.bookId,
          type: 'note',
          locationCfiOrPage: String(noteData.pageNumber || 1),
          selectedText: noteData.highlightedText || null,
          noteContent: noteData.content,
          createdAt: noteData.createdAt,
        });
      } catch (e) {
        console.warn('[baglib/db-ipc] Auto-sync to annotations table failed:', e);
      }

      return repo.addNote(noteData);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to add note:', err);
      throw err;
    }
  });

  /**
   * Delete a note
   */
  ipcMain.handle('library:delete-note', (_, noteId: string) => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/knowledge.repository').KnowledgeRepository)(db);
      const annotRepo = new (require('../database/repositories/annotation.repository').AnnotationRepository)(db);

      try {
        annotRepo.delete(noteId);
      } catch {}

      return repo.deleteNote(noteId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to delete note:', err);
      throw err;
    }
  });

  /**
   * Annotations & Freehand Ink Management (KEY-137)
   */
  ipcMain.handle('library:get-annotations', (_, bookId: string) => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/annotation.repository').AnnotationRepository)(db);
      return repo.getByBookId(bookId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to get annotations:', err);
      return [];
    }
  });

  ipcMain.handle('library:get-all-annotations', () => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/annotation.repository').AnnotationRepository)(db);
      return repo.getAll();
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to get all annotations:', err);
      return [];
    }
  });

  ipcMain.handle('library:save-annotation', (_, payload) => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/annotation.repository').AnnotationRepository)(db);
      return repo.save(payload);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to save annotation:', err);
      throw err;
    }
  });

  ipcMain.handle('library:delete-annotation', (_, annotationId: string) => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/annotation.repository').AnnotationRepository)(db);
      return repo.delete(annotationId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to delete annotation:', err);
      throw err;
    }
  });

  ipcMain.handle('library:get-filtered-annotations', (_, filter) => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/annotation.repository').AnnotationRepository)(db);
      return repo.getFiltered(filter);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to filter annotations:', err);
      return [];
    }
  });

  /**
   * Core Knowledge Layer IPC (highlights, notes, quotes, bookmarks, questions)
   */
  ipcMain.handle('knowledge:get-by-work', (_, workId: string, type?: string) => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/knowledge.repository').KnowledgeRepository)(db);
      return repo.getKnowledgeByWork(workId, type);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to get knowledge by work:', err);
      return [];
    }
  });

  ipcMain.handle('knowledge:get-all', () => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/knowledge.repository').KnowledgeRepository)(db);
      return repo.getAllKnowledge();
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to get all knowledge:', err);
      return [];
    }
  });

  ipcMain.handle('knowledge:save', (_, payload) => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/knowledge.repository').KnowledgeRepository)(db);
      return repo.saveKnowledge(payload);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to save knowledge item:', err);
      throw err;
    }
  });

  ipcMain.handle('knowledge:delete', (_, knowledgeId: string) => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/knowledge.repository').KnowledgeRepository)(db);
      return repo.deleteKnowledge(knowledgeId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to delete knowledge item:', err);
      throw err;
    }
  });

  /**
   * Reading Session & Continuous Location Persistence
   */
  ipcMain.handle('reader:record-session', (_, session) => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/knowledge.repository').KnowledgeRepository)(db);
      return repo.recordReadingSession(session);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to record reading session:', err);
      throw err;
    }
  });

  ipcMain.handle('reader:get-sessions', (_, workId: string) => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/knowledge.repository').KnowledgeRepository)(db);
      return repo.getReadingSessions(workId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to get reading sessions:', err);
      return [];
    }
  });

  ipcMain.handle('reader:update-last-location', (_, workId: string, location: string) => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/knowledge.repository').KnowledgeRepository)(db);
      return repo.updateLastReadLocation(workId, location);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to update last location:', err);
      return false;
    }
  });

  ipcMain.handle('reader:get-last-location', (_, workId: string) => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/knowledge.repository').KnowledgeRepository)(db);
      return repo.getLastReadLocation(workId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to get last location:', err);
      return null;
    }
  });

  /**
   * Fetch category tree
   */
  ipcMain.handle('library:get-category-tree', async () => {
    try {
      const repo = require('../database/repositories/category.repository').categoryRepository;
      return await repo.getCategoryTree();
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to fetch category tree:', err);
      return [];
    }
  });

  /**
   * Fetch category breadcrumbs
   */
  ipcMain.handle('library:get-category-breadcrumbs', async (_, categoryId: string) => {
    try {
      const repo = require('../database/repositories/category.repository').categoryRepository;
      return await repo.getBreadcrumbs(categoryId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to fetch category breadcrumbs:', err);
      return [];
    }
  });

  /**
   * Fetch subtree work ids
   */
  ipcMain.handle('library:get-subtree-work-ids', async (_, categoryId: string) => {
    try {
      const repo = require('../database/repositories/category.repository').categoryRepository;
      return await repo.getSubtreeWorkIds(categoryId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to fetch subtree work ids:', err);
      return [];
    }
  });

  /**
   * Full-Text Search Engine IPC Handlers (KEY-140)
   */
  ipcMain.handle('search:index-book-content', (_, bookId: string, pages: any[]) => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/content-fts.repository').ContentFtsRepository)(db);
      repo.indexBook(bookId, pages);
      return { success: true, count: pages.length };
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to index book content:', err);
      throw err;
    }
  });

  ipcMain.handle('search:delete-book-content', (_, bookId: string) => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/content-fts.repository').ContentFtsRepository)(db);
      repo.deleteBookIndex(bookId);
      return { success: true };
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to delete book content index:', err);
      throw err;
    }
  });

  ipcMain.handle('search:is-book-indexed', (_, bookId: string) => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/content-fts.repository').ContentFtsRepository)(db);
      return repo.isBookIndexed(bookId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to check book index status:', err);
      return false;
    }
  });

  ipcMain.handle('search:library-full-text', (_, query: string, options?: any) => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/content-fts.repository').ContentFtsRepository)(db);
      return repo.searchLibrary(query, options);
    } catch (err) {
      console.error('[baglib/db-ipc] Full-text search error:', err);
      return [];
    }
  });

  ipcMain.handle('search:get-fts-stats', () => {
    try {
      const db = getDatabase();
      const repo = new (require('../database/repositories/content-fts.repository').ContentFtsRepository)(db);
      return {
        booksCount: repo.getIndexedBooksCount(),
        pagesCount: repo.getIndexedPagesCount(),
      };
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to get FTS stats:', err);
      return { booksCount: 0, pagesCount: 0 };
    }
  });
}


