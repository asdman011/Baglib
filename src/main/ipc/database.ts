import { cancelSlashJobs } from '../services/slash-search-jobs';
import { setupAdvancedIPC } from './advanced';
import * as ipcModule0 from '../database/repositories/knowledge.repository';
import * as ipcModule1 from '../database/repositories/annotation.repository';
import * as ipcModule2 from '../database/repositories/category.repository';
import * as ipcModule3 from '../database/repositories/content-fts.repository';
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
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return new Error(String((err).message));
  }
  return new Error(typeof err === 'string' && err ? err : fallbackMessage);
}

export function setupDatabaseIPC() {
  ipcMain.handle('slash:cancel', (_event, id: unknown) => cancelSlashJobs(id));
  setupAdvancedIPC();
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
  ipcMain.handle('library:get-book-source', (_, workId: unknown, sourceId: unknown) => {
    if (typeof workId !== 'string' || typeof sourceId !== 'string' ||
        !/^[^\s\[\]|:#@]{1,180}$/u.test(workId) || !/^[^\s\[\]|:#@]{1,180}$/u.test(sourceId)) throw new Error('invalid-reference');
    const book = new WorkRepository(getDatabase()).getById(workId, sourceId);
    return book && !book.deletedAt ? book : null;
  });

  ipcMain.handle('library:get-detail-summary', (_, workId: unknown) => {
    if (typeof workId !== 'string' || !/^[^\s\[\]|:#@]{1,180}$/u.test(workId)) throw new Error('invalid-reference');
    return new WorkRepository(getDatabase()).getDetailSummary(workId);
  });

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
   * Delete a book from SQLite database by workId (soft-delete by default, permanent if requested - KEY-45)
   */
  ipcMain.handle('library:delete-book', (_, bookId: string, permanent?: boolean) => {
    try {
      const db = getDatabase();
      const repo = new WorkRepository(db);
      if (permanent) {
        return repo.permanentlyDeleteBook(bookId);
      }
      return repo.softDeleteBook(bookId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to delete book:', err);
      throw normalizeIpcError(err, 'Failed to delete book');
    }
  });

  /**
   * Restore a soft-deleted book from the trash bin (KEY-45)
   */
  ipcMain.handle('library:restore-book', (_, bookId: string) => {
    try {
      const db = getDatabase();
      const repo = new WorkRepository(db);
      return repo.restoreBook(bookId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to restore book:', err);
      throw normalizeIpcError(err, 'Failed to restore book');
    }
  });

  /**
   * Permanently delete a book from SQLite database (KEY-45)
   */
  ipcMain.handle('library:permanently-delete', (_, bookId: string) => {
    try {
      const db = getDatabase();
      const repo = new WorkRepository(db);
      return repo.permanentlyDeleteBook(bookId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to permanently delete book:', err);
      throw normalizeIpcError(err, 'Failed to permanently delete book');
    }
  });

  /**
   * Get all books in the trash bin (KEY-45)
   */
  ipcMain.handle('library:get-trash-works', () => {
    try {
      const db = getDatabase();
      const repo = new WorkRepository(db);
      return repo.getTrashWorks();
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to get trash works:', err);
      throw normalizeIpcError(err, 'Failed to get trash works');
    }
  });

  /**
   * Get total count of items in the trash bin (KEY-45)
   */
  ipcMain.handle('library:get-trash-count', () => {
    try {
      const db = getDatabase();
      const repo = new WorkRepository(db);
      return repo.getTrashCount();
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to get trash count:', err);
      throw normalizeIpcError(err, 'Failed to get trash count');
    }
  });

  /**
   * Empty all items from the trash bin permanently (KEY-45)
   */
  ipcMain.handle('library:empty-trash', () => {
    try {
      const db = getDatabase();
      const repo = new WorkRepository(db);
      return repo.emptyTrash();
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to empty trash:', err);
      throw normalizeIpcError(err, 'Failed to empty trash');
    }
  });

  /**
   * Update reading status and progress for a book
   */
  ipcMain.handle('library:update-reading-status', (_, workId: string, status: import('../../shared/types/work').ReadingStatus, progress?: number) => {
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
  ipcMain.handle('library:record-loan', (_, workId: string, loanData: Partial<import('../../shared/types/metadata').LendingRecord>) => {
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
      const repo = new (ipcModule0.KnowledgeRepository)(db);
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
      const repo = new (ipcModule0.KnowledgeRepository)(db);

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
      const repo = new (ipcModule0.KnowledgeRepository)(db);
      const annotRepo = new (ipcModule1.AnnotationRepository)(db);

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
      const repo = new (ipcModule1.AnnotationRepository)(db);
      return repo.getByBookId(bookId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to get annotations:', err);
      return [];
    }
  });

  ipcMain.handle('library:get-all-annotations', () => {
    try {
      const db = getDatabase();
      const repo = new (ipcModule1.AnnotationRepository)(db);
      return repo.getAll();
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to get all annotations:', err);
      return [];
    }
  });

  ipcMain.handle('library:save-annotation', (_, payload) => {
    try {
      const db = getDatabase();
      const repo = new (ipcModule1.AnnotationRepository)(db);
      return repo.save(payload);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to save annotation:', err);
      throw err;
    }
  });

  ipcMain.handle('library:delete-annotation', (_, annotationId: string) => {
    try {
      const db = getDatabase();
      const repo = new (ipcModule1.AnnotationRepository)(db);
      return repo.delete(annotationId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to delete annotation:', err);
      throw err;
    }
  });

  ipcMain.handle('library:get-filtered-annotations', (_, filter) => {
    try {
      const db = getDatabase();
      const repo = new (ipcModule1.AnnotationRepository)(db);
      return repo.getFiltered(filter);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to filter annotations:', err);
      return [];
    }
  });

  /**
   * Core Knowledge Layer IPC (highlights, notes, quotes, bookmarks, questions)
   */
  ipcMain.handle('knowledge:get-by-work', (_, workId: string, type?: import('../../shared/types/knowledge').KnowledgeType) => {
    try {
      const db = getDatabase();
      const repo = new (ipcModule0.KnowledgeRepository)(db);
      return repo.getKnowledgeByWork(workId, type);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to get knowledge by work:', err);
      return [];
    }
  });

  ipcMain.handle('knowledge:get-all', () => {
    try {
      const db = getDatabase();
      const repo = new (ipcModule0.KnowledgeRepository)(db);
      return repo.getAllKnowledge();
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to get all knowledge:', err);
      return [];
    }
  });

  ipcMain.handle('knowledge:save', (_, payload) => {
    try {
      const db = getDatabase();
      const repo = new (ipcModule0.KnowledgeRepository)(db);
      return repo.saveKnowledge(payload);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to save knowledge item:', err);
      throw err;
    }
  });

  ipcMain.handle('knowledge:delete', (_, knowledgeId: string, actor?: 'reader') => {
    try {
      const db = getDatabase();
      const repo = new (ipcModule0.KnowledgeRepository)(db);
      return repo.deleteKnowledge(knowledgeId, actor);
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
      const repo = new (ipcModule0.KnowledgeRepository)(db);
      return repo.recordReadingSession(session);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to record reading session:', err);
      throw err;
    }
  });

  ipcMain.handle('reader:get-recent-activity', () => {
    const db = getDatabase();
    return db.prepare(`
      SELECT workId, MAX(lastOpenedAt) AS lastOpenedAt FROM (
        SELECT work_id AS workId, (julianday(ended_at) - 2440587.5) * 86400000 AS lastOpenedAt
        FROM reading_session WHERE work_id IS NOT NULL AND ended_at IS NOT NULL
        UNION ALL
        SELECT id AS workId, last_open * 1000 AS lastOpenedAt FROM reading_book_stat
      ) WHERE lastOpenedAt > 0 GROUP BY workId
    `).all();
  });

  ipcMain.handle('reader:get-sessions', (_, workId: string) => {
    try {
      const db = getDatabase();
      const repo = new (ipcModule0.KnowledgeRepository)(db);
      return repo.getReadingSessions(workId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to get reading sessions:', err);
      return [];
    }
  });

  ipcMain.handle('reader:update-last-location', (_, workId: string, location: string) => {
    try {
      const db = getDatabase();
      const repo = new (ipcModule0.KnowledgeRepository)(db);
      return repo.updateLastReadLocation(workId, location);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to update last location:', err);
      return false;
    }
  });

  ipcMain.handle('reader:get-last-location', (_, workId: string) => {
    try {
      const db = getDatabase();
      const repo = new (ipcModule0.KnowledgeRepository)(db);
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
      const repo = ipcModule2.categoryRepository;
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
      const repo = ipcModule2.categoryRepository;
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
      const repo = ipcModule2.categoryRepository;
      return await repo.getSubtreeWorkIds(categoryId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to fetch subtree work ids:', err);
      return [];
    }
  });

  /**
   * Full-Text Search Engine IPC Handlers (KEY-140)
   */
  ipcMain.handle('search:index-book-content', (_, bookId: string, pages: import('../../shared/types/full-text-search').IndexedBookPage[]) => {
    try {
      const db = getDatabase();
      const repo = new (ipcModule3.ContentFtsRepository)(db);
      repo.indexBook(bookId, pages);
      return { success: true, count: pages.length };
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to index book content:', err);
      throw err;
    }
  });

  /**
   * Re-indexes a single page's text chunk in FTS5 virtual table (KEY-292).
   * Resolves target to work ID if a source ID is supplied.
   */
  ipcMain.handle('search:reindex-page-content', (_, target: string, page: import('../../shared/types/full-text-search').IndexedBookPage) => {
    try {
      const db = getDatabase();
      let workId = target;
      try {
        const workRow = db.prepare('SELECT id FROM work WHERE id = ? LIMIT 1').get(target) as { id: string } | undefined;
        if (!workRow?.id) {
          const sourceRow = db.prepare(`
            SELECT e.work_id
            FROM source s
            JOIN edition e ON e.id = s.edition_id
            WHERE s.id = ?
            LIMIT 1
          `).get(target) as { work_id: string } | undefined;
          if (sourceRow?.work_id) workId = sourceRow.work_id;
        }
      } catch {}

      const repo = new (ipcModule3.ContentFtsRepository)(db);
      repo.reindexPage(workId, page);
      return { success: true, workId, pageNumber: page.pageNumber };
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to reindex page content:', err);
      throw err;
    }
  });

  ipcMain.handle('search:get-page-content', (_, target: string, pageNumber: number) => {
    try {
      const db = getDatabase();
      let workId = target;
      try {
        const workRow = db.prepare('SELECT id FROM work WHERE id = ? LIMIT 1').get(target) as { id: string } | undefined;
        if (!workRow?.id) {
          const sourceRow = db.prepare(`
            SELECT e.work_id
            FROM source s
            JOIN edition e ON e.id = s.edition_id
            WHERE s.id = ?
            LIMIT 1
          `).get(target) as { work_id: string } | undefined;
          if (sourceRow?.work_id) workId = sourceRow.work_id;
        }
      } catch {}

      const repo = new (ipcModule3.ContentFtsRepository)(db);
      return repo.getPageContent(workId, pageNumber);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to get page content:', err);
      return null;
    }
  });

  ipcMain.handle('search:delete-book-content', (_, bookId: string) => {
    try {
      const db = getDatabase();
      const repo = new (ipcModule3.ContentFtsRepository)(db);
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
      const repo = new (ipcModule3.ContentFtsRepository)(db);
      return repo.isBookIndexed(bookId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to check book index status:', err);
      return false;
    }
  });

  ipcMain.handle('search:library-full-text', (_, query: string, options?: import('../../shared/types/full-text-search').LibraryFtsQuery) => {
    try {
      const db = getDatabase();
      const repo = new (ipcModule3.ContentFtsRepository)(db);
      return repo.searchLibrary(query, options);
    } catch (err) {
      console.error('[baglib/db-ipc] Full-text search error:', err);
      return [];
    }
  });

  ipcMain.handle('search:get-fts-stats', () => {
    let databaseReady = false;
    try {
      const db = getDatabase();
      databaseReady = db.open;
      const repo = new (ipcModule3.ContentFtsRepository)(db);
      return {
        databaseReady,
        indexReady: true,
        booksCount: repo.getIndexedBooksCount(),
        pagesCount: repo.getIndexedPagesCount(),
      };
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to get FTS stats:', err);
      return { databaseReady, indexReady: false, booksCount: 0, pagesCount: 0 };
    }
  });
}


