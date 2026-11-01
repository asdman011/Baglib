/**
 * Baglib — Migration 019: Knowledge outlives its book (ADR-006)
 *
 * A trigger detaches knowledge before a Work is deleted and keeps the title, so
 * every delete path is covered. `annotations.book_id` was NOT NULL with a cascade,
 * and SQLite cannot alter either, so that table is rebuilt with its rows unchanged.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrator';

const migration: Migration = {
  id: 19,
  name: 'knowledge_preservation',
  up: (db: Database) => {
    db.exec(`
      ALTER TABLE knowledge ADD COLUMN former_work_title TEXT;

      CREATE TABLE annotations_preserved (
        id                   TEXT PRIMARY KEY,
        book_id              TEXT REFERENCES work(id) ON DELETE SET NULL,
        type                 TEXT NOT NULL,
        location_cfi_or_page TEXT NOT NULL,
        selected_text        TEXT,
        note_content         TEXT,
        color                TEXT,
        stroke_data          TEXT,
        tags                 TEXT,
        created_at           TEXT NOT NULL,
        updated_at           TEXT NOT NULL,
        former_work_title    TEXT
      );
      INSERT INTO annotations_preserved (id, book_id, type, location_cfi_or_page, selected_text, note_content, color, stroke_data, tags, created_at, updated_at)
        SELECT id, book_id, type, location_cfi_or_page, selected_text, note_content, color, stroke_data, tags, created_at, updated_at FROM annotations;
      DROP TABLE annotations;
      ALTER TABLE annotations_preserved RENAME TO annotations;
      CREATE INDEX idx_annotations_book_id  ON annotations(book_id);
      CREATE INDEX idx_annotations_type     ON annotations(type);
      CREATE INDEX idx_annotations_location ON annotations(book_id, location_cfi_or_page);

      CREATE TRIGGER preserve_knowledge_on_work_delete BEFORE DELETE ON work
      BEGIN
        UPDATE knowledge SET former_work_title = OLD.title, work_id = NULL WHERE work_id = OLD.id;
        UPDATE annotations SET former_work_title = OLD.title, book_id = NULL WHERE book_id = OLD.id;
      END;
    `);
  },
  // Rows without a book cannot go back under the old NOT NULL rule, so only the trigger is removed.
  down: (db: Database) => {
    db.exec('DROP TRIGGER IF EXISTS preserve_knowledge_on_work_delete;');
  },
};

export default migration;
