/**
 * Migration 012 — Offline Dictionaries and Sub-10ms Headword Index (KEY-142)
 */

import type { Migration } from '../migrator';

const migration: Migration = {
  id: 12,
  name: 'dictionaries_and_headwords',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS dictionaries (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        format TEXT NOT NULL,
        source_path TEXT NOT NULL,
        source_lang TEXT,
        target_lang TEXT,
        entry_count INTEGER DEFAULT 0,
        is_enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS headword_index (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dict_id TEXT NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
        headword TEXT NOT NULL,
        normalized_headword TEXT NOT NULL,
        offset INTEGER,
        size INTEGER,
        snippet TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_headword_normalized ON headword_index(normalized_headword, dict_id);
      CREATE INDEX IF NOT EXISTS idx_headword_raw ON headword_index(headword);
      CREATE INDEX IF NOT EXISTS idx_headword_dict ON headword_index(dict_id);
    `);
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_headword_dict;
      DROP INDEX IF EXISTS idx_headword_raw;
      DROP INDEX IF EXISTS idx_headword_normalized;
      DROP TABLE IF EXISTS headword_index;
      DROP TABLE IF EXISTS dictionaries;
    `);
  },
};

export default migration;
