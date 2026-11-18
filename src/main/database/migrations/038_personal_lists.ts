/**
 * Baglib — Migration 038: personal lists (KEY-386, approved by the user on 2026-11-18).
 *
 * `personal_list` holds the built-in "Starred" list and the user's own named lists.
 * `personal_list_item` holds any mix of books, ayahs, hadith and poems, ordered within a list.
 * Ayahs, hadith and poems are not catalog rows, so items are referenced by kind plus a study-link
 * reference (see `src/shared/personal-lists.ts`), not by foreign key. Items are indexed by item
 * (for list chips and section filters) and by list (for the list view and its order).
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrator';

const migration: Migration = {
  id: 38,
  name: 'personal_lists',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS personal_list (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,                                  -- kept exactly as the user typed it
        kind TEXT NOT NULL DEFAULT 'custom' CHECK (kind IN ('starred', 'custom')),
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE IF NOT EXISTS personal_list_item (
        id TEXT PRIMARY KEY,
        list_id TEXT NOT NULL REFERENCES personal_list(id) ON DELETE CASCADE,
        item_kind TEXT NOT NULL CHECK (item_kind IN ('book', 'ayah', 'hadith', 'poem')),
        item_ref TEXT NOT NULL,                              -- book:<id>, quran:…, sunnah:…, poetry:ashaar:<id>:0:0
        label TEXT NOT NULL DEFAULT '',                      -- short preview kept when added
        position INTEGER NOT NULL DEFAULT 0,
        added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (list_id, item_kind, item_ref)
      );
      CREATE INDEX IF NOT EXISTS idx_personal_list_item_item ON personal_list_item(item_kind, item_ref);
      CREATE INDEX IF NOT EXISTS idx_personal_list_item_list ON personal_list_item(list_id, position);
      INSERT OR IGNORE INTO personal_list (id, name, kind, position) VALUES ('starred', 'Starred', 'starred', 0);
    `);
  },
  down: (db: Database) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_personal_list_item_list;
      DROP INDEX IF EXISTS idx_personal_list_item_item;
      DROP TABLE IF EXISTS personal_list_item;
      DROP TABLE IF EXISTS personal_list;
    `);
  },
};

export default migration;
