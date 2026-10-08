/**
 * Baglib — SQLite Database Connection
 *
 * Manages a singleton connection to the local SQLite database file.
 * The database is stored in Electron's `app.getPath('userData')` directory,
 * ensuring it persists across updates and is scoped to the current user.
 *
 * Connection settings:
 *   - WAL journal mode for concurrent read/write performance
 *   - Foreign keys enforced at the engine level
 *   - Busy timeout to handle brief write contention gracefully
 */

import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

/**
 * Returns the absolute path to the SQLite database file.
 * Creates the parent directory if it doesn't exist.
 */
export function getDatabasePath(): string {
  const userDataDir = app.getPath('userData');
  const dbDir = path.join(userDataDir, 'data');

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  return path.join(dbDir, 'baglib.db');
}

/**
 * Opens (or creates) the SQLite database and applies performance pragmas.
 * Returns the same instance on subsequent calls (singleton).
 */
export function getDatabase(): Database.Database {
  if (db) return db;

  const dbPath = getDatabasePath();

  db = new Database(dbPath);

  // --- Performance & Safety Pragmas ---
  db.pragma('journal_mode = WAL');       // Write-Ahead Logging for concurrency
  db.pragma('foreign_keys = ON');        // Enforce FK constraints
  db.pragma('busy_timeout = 5000');      // Wait up to 5s on lock contention
  db.pragma('synchronous = NORMAL');     // Good durability/performance balance

  console.log(`[baglib/db] Opened database at: ${dbPath}`);

  return db;
}

/**
 * Gracefully closes the database connection.
 * Call this on `app.on('will-quit')` to ensure WAL is checkpointed.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[baglib/db] Database connection closed.');
  }
}
