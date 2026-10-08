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
   */
  ipcMain.handle('library:add-book', (_, bookData) => {
    try {
      const db = getDatabase();
      const repo = new WorkRepository(db);
      return repo.addBook(bookData);
    } catch (err) {
      console.error('[baglib/db-ipc] Failed to add book:', err);
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
}

