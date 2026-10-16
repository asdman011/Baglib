/**
 * Migration 011 — Full-Text Search Engine with SQLite FTS5 (KEY-140)
 */

import type { Migration } from '../migrator';

const migration: Migration = {
  id: 11,
  name: 'book_content_fts',

  up(db) {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS book_content_fts USING fts5(
        book_id UNINDEXED,
        page_number UNINDEXED,
        location_cfi_or_page UNINDEXED,
        chapter_title,
        content,
        normalized_content,
        tokenize = 'unicode61'
      );
    `);
  },

  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS book_content_fts;
    `);
  },
};

export default migration;
