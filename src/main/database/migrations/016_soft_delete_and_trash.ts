/**
 * Baglib — Migration 016: Soft Delete & Trash Bin (KEY-45)
 *
 * Adds deleted_at timestamp column to work table and index for high-speed
 * active library vs recycle bin queries.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrator';

const migration: Migration = {
  id: 16,
  name: 'soft_delete_and_trash',
  up: (db: Database) => {
    // 1. Ensure deleted_at column exists on work table
    const workColumns = db.prepare(`PRAGMA table_info(work)`).all() as Array<{ name: string }>;
    const colNames = new Set(workColumns.map((c) => c.name));

    if (!colNames.has('deleted_at')) {
      db.exec(`ALTER TABLE work ADD COLUMN deleted_at TEXT;`);
    }

    // 2. Index for filtering active vs soft-deleted records efficiently
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_work_deleted_at ON work(deleted_at);
    `);
  },
  down: (db: Database) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_work_deleted_at;
    `);
  },
};

export default migration;
