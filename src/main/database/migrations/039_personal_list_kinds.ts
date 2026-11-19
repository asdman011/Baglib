/**
 * Baglib — Migration 039: personal lists hold lecture moments, notes and book pages (KEY-415,
 * approved by the user on 2026-11-19).
 *
 * `personal_list_item.item_kind` gains three kinds:
 *   lecture  `media:<lectureId>:<seconds>`   a moment in a lecture
 *   note     `note:<id>`                     a whole note
 *   page     `book:<id>[@source]#p=N` / `#cfi=…`  an exact place in a book
 * SQLite can't change a CHECK constraint in place, so the table is rebuilt: a copy with the wider
 * CHECK, every row copied, the old table dropped and the copy renamed, then both indexes recreated.
 * No column changes. The migrator runs this inside one transaction.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrator';

const table = (name: string, kinds: string) => `
  CREATE TABLE ${name} (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL REFERENCES personal_list(id) ON DELETE CASCADE,
    item_kind TEXT NOT NULL CHECK (item_kind IN (${kinds})),
    item_ref TEXT NOT NULL,                              -- study-link reference, see src/shared/personal-lists.ts
    label TEXT NOT NULL DEFAULT '',                      -- short preview kept when added
    position INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (list_id, item_kind, item_ref)
  );`;

const rebuild = (db: Database, kinds: string, keep: string) => {
  db.exec(`
    ${table('personal_list_item_new', kinds)}
    INSERT INTO personal_list_item_new (id, list_id, item_kind, item_ref, label, position, added_at)
      SELECT id, list_id, item_kind, item_ref, label, position, added_at FROM personal_list_item WHERE item_kind IN (${keep});
    DROP INDEX IF EXISTS idx_personal_list_item_list;
    DROP INDEX IF EXISTS idx_personal_list_item_item;
    DROP TABLE personal_list_item;
    ALTER TABLE personal_list_item_new RENAME TO personal_list_item;
    CREATE INDEX IF NOT EXISTS idx_personal_list_item_item ON personal_list_item(item_kind, item_ref);
    CREATE INDEX IF NOT EXISTS idx_personal_list_item_list ON personal_list_item(list_id, position);
  `);
};

const OLD = `'book', 'ayah', 'hadith', 'poem'`;
const NEW = `'book', 'ayah', 'hadith', 'poem', 'lecture', 'note', 'page'`;

const migration: Migration = {
  id: 39,
  name: 'personal_list_kinds',
  up: (db: Database) => rebuild(db, NEW, OLD + `, 'lecture', 'note', 'page'`),
  // Going back drops lecture, note and page items: the old CHECK can't hold them.
  down: (db: Database) => rebuild(db, OLD, OLD),
};

export default migration;
