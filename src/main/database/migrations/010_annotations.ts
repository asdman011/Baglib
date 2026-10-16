/**
 * Migration 010 — Annotations, Bookmarks, Highlights, and Freehand Ink System (KEY-137)
 */

import type { Migration } from '../migrator';

const migration: Migration = {
  id: 10,
  name: 'annotations',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS annotations (
        id                   TEXT PRIMARY KEY,
        book_id              TEXT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
        type                 TEXT NOT NULL,
        location_cfi_or_page TEXT NOT NULL,
        selected_text        TEXT,
        note_content         TEXT,
        color                TEXT,
        stroke_data          TEXT,
        tags                 TEXT,
        created_at           TEXT NOT NULL,
        updated_at           TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_annotations_book_id  ON annotations(book_id);
      CREATE INDEX IF NOT EXISTS idx_annotations_type     ON annotations(type);
      CREATE INDEX IF NOT EXISTS idx_annotations_location ON annotations(book_id, location_cfi_or_page);
    `);
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_annotations_location;
      DROP INDEX IF EXISTS idx_annotations_type;
      DROP INDEX IF EXISTS idx_annotations_book_id;
      DROP TABLE IF EXISTS annotations;
    `);
  },
};

export default migration;
