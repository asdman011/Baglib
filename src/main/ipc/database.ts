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
   * Automatically extracts the first PDF image as the cover if a PDF file is linked and no cover exists.
   */
  ipcMain.handle('library:add-book', async (_, bookData) => {
    try {
      if (
        !bookData.coverImage &&
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
      throw err;
    }
  });

  /**
   * Update an existing book (work, edition, metadata) in SQLite database
   * Automatically extracts the first PDF image as the cover if a PDF file is linked and no cover exists.
   */
  ipcMain.handle('library:update-book', async (_, bookData) => {
    try {
      if (
        !bookData.coverImage &&
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
      throw err;
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
      throw err;
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
      throw err;
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
      throw err;
    }
  });

  ipcMain.handle('library:return-loan', (_, loanId: string, returnDate?: string, conditionOnReturn?: string) => {
    try {
      const db = getDatabase();
      const repo = new WorkRepository(db);
      return repo.returnLoan(loanId, returnDate, conditionOnReturn);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to return loan:', err);
      throw err;
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
      return repo.deleteNote(noteId);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to delete note:', err);
      throw err;
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
}


