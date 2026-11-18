/**
 * Baglib — Migration 037: `anki_orphan_revlog` (KEY-392; ADR-017 sections 3.6 and 3.9).
 *
 * Anki keeps review history for cards that no longer exist: in the user's collection, 31,732 rows,
 * mostly from one bulk reset in 2024. BagLib has no card to attach them to, so they are archived
 * here exactly as Anki stored them. They never show in BagLib, but an `.apkg` export of the whole
 * collection writes them back, so a round-trip loses no history. Approved with ADR-017 on
 * 2026-11-17; KEY-389 left this table to KEY-392.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrator';

const migration: Migration = {
  id: 37,
  name: 'anki_orphan_revlog',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS anki_orphan_revlog (
        id INTEGER PRIMARY KEY,           -- Anki revlog.id (milliseconds), so re-import never duplicates
        cid INTEGER NOT NULL,             -- the Anki card id it belonged to
        ease INTEGER NOT NULL,
        ivl INTEGER NOT NULL,
        last_ivl INTEGER NOT NULL,
        factor INTEGER NOT NULL,
        time INTEGER NOT NULL,
        type INTEGER NOT NULL,
        imported_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_anki_orphan_revlog_cid ON anki_orphan_revlog(cid);
    `);
  },
  down: (db: Database) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_anki_orphan_revlog_cid;
      DROP TABLE IF EXISTS anki_orphan_revlog;
    `);
  },
};

export default migration;
