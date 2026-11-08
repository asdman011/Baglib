import type { Migration } from '../migrator';

/**
 * ADR-012: per-file save state. The file belongs to a Source (Work → Edition → Source), so the state does too.
 * One row per file BagLib has written to; nothing is created by opening a file.
 */
const migration: Migration = {
  id: 25,
  name: 'material_save_state',
  up(db) {
    db.exec(`
      CREATE TABLE material_save_state (
        source_id         TEXT PRIMARY KEY REFERENCES source(id) ON DELETE CASCADE,
        file_sha256       TEXT,
        written_digest    TEXT,
        last_saved_at     TEXT,
        backup_path       TEXT,
        backup_expires_at TEXT,
        incident          TEXT CHECK(incident IN ('interrupted','corrupt','external-change')),
        incident_at       TEXT,
        redo_json         TEXT,
        updated_at        TEXT NOT NULL
      );
      CREATE INDEX idx_material_save_backup_expiry ON material_save_state(backup_expires_at) WHERE backup_path IS NOT NULL;
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_material_save_backup_expiry;
      DROP TABLE IF EXISTS material_save_state;
    `);
  },
};

export default migration;
