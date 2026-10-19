/**
 * Baglib — Migration 015: Reading Location & Knowledge Indices
 *
 * Adds last_read_location to work table and composite indexes for high-speed
 * knowledge layer queries (highlights, notes, quotes, bookmarks, questions).
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrator';

const migration: Migration = {
  id: 15,
  name: 'reading_location_and_knowledge_enhancements',
  up: (db: Database) => {
    // 1. Ensure last_read_location exists on work
    const workColumns = db.prepare(`PRAGMA table_info(work)`).all() as Array<{ name: string }>;
    const colNames = new Set(workColumns.map((c) => c.name));

    if (!colNames.has('last_read_location')) {
      db.exec(`ALTER TABLE work ADD COLUMN last_read_location TEXT;`);
    }

    // 2. High performance composite indices for knowledge lookups
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_work_type ON knowledge(work_id, knowledge_type);
      CREATE INDEX IF NOT EXISTS idx_knowledge_location ON knowledge(work_id, location);
      CREATE INDEX IF NOT EXISTS idx_reading_session_work_ended ON reading_session(work_id, ended_at);
    `);
  },
  down: (db: Database) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_reading_session_work_ended;
      DROP INDEX IF EXISTS idx_knowledge_location;
      DROP INDEX IF EXISTS idx_knowledge_work_type;
    `);
  },
};

export default migration;
