/**
 * Baglib — Migration 017: Al-Bayan human poem narrations
 *
 * Stores user-provided human narrations (microphone recordings, attached local
 * audio files and online provider links) for Ashaar corpus poems. The corpus
 * lives in its own read-only partition, so `poem_id` is a stable external
 * reference rather than a foreign key. Audio bytes live as managed files under
 * `userData/poetry-narrations/`; only the managed file name is stored here.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrator';

const migration: Migration = {
  id: 17,
  name: 'poetry_narration',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS poetry_narration (
        id TEXT PRIMARY KEY,
        poem_id INTEGER NOT NULL CHECK (poem_id > 0),
        kind TEXT NOT NULL CHECK (kind IN ('recording', 'file', 'online')),
        provider TEXT NOT NULL CHECK (provider IN ('local', 'youtube', 'soundcloud', 'vimeo', 'url')),
        label TEXT,
        file_name TEXT,
        url TEXT,
        mime_type TEXT,
        duration_seconds REAL,
        created_at TEXT NOT NULL,
        CHECK ((kind = 'online' AND provider <> 'local' AND url IS NOT NULL AND file_name IS NULL)
          OR (kind <> 'online' AND provider = 'local' AND file_name IS NOT NULL AND url IS NULL))
      );
      CREATE INDEX IF NOT EXISTS idx_poetry_narration_poem ON poetry_narration(poem_id, created_at);
    `);
  },
  down: (db: Database) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_poetry_narration_poem;
      DROP TABLE IF EXISTS poetry_narration;
    `);
  },
};

export default migration;
