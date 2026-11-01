/**
 * Baglib — Migration 018: Knowledge cards and spaced repetition (ADR-006)
 *
 * A card is a `knowledge` row with `knowledge_type = 'card'`. Quran, hadith and
 * poetry cards have no Work, so `source_ref` is a stable external reference.
 * `srs_state` exists only for cards added to memorization.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrator';

const migration: Migration = {
  id: 18,
  name: 'knowledge_cards',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS card_detail (
        knowledge_id TEXT PRIMARY KEY REFERENCES knowledge(id) ON DELETE CASCADE,
        front TEXT NOT NULL,
        back TEXT NOT NULL,
        source_kind TEXT NOT NULL CHECK (source_kind IN ('book', 'quran', 'hadith', 'poetry', 'note', 'term', 'person')),
        source_ref TEXT,
        source_label TEXT,
        language TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_card_detail_source ON card_detail(source_ref);

      CREATE TABLE IF NOT EXISTS srs_state (
        knowledge_id TEXT PRIMARY KEY REFERENCES knowledge(id) ON DELETE CASCADE,
        state TEXT NOT NULL CHECK (state IN ('new', 'learning', 'review', 'relearning', 'suspended')),
        due_at TEXT NOT NULL,
        stability REAL,
        difficulty REAL,
        reps INTEGER NOT NULL DEFAULT 0,
        lapses INTEGER NOT NULL DEFAULT 0,
        last_review TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_srs_state_due ON srs_state(due_at);

      CREATE TABLE IF NOT EXISTS srs_review_log (
        id TEXT PRIMARY KEY,
        knowledge_id TEXT NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
        reviewed_at TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
        duration_ms INTEGER,
        state_before TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_srs_review_log_card ON srs_review_log(knowledge_id, reviewed_at);
    `);
  },
  down: (db: Database) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_srs_review_log_card;
      DROP TABLE IF EXISTS srs_review_log;
      DROP INDEX IF EXISTS idx_srs_state_due;
      DROP TABLE IF EXISTS srs_state;
      DROP INDEX IF EXISTS idx_card_detail_source;
      DROP TABLE IF EXISTS card_detail;
    `);
  },
};

export default migration;
