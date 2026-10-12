import type { Migration } from '../migrator';

const migration: Migration = {
  id: 7,
  name: 'app_settings',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key         TEXT PRIMARY KEY,
        value       TEXT NOT NULL,
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);
    `);
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_app_settings_key;
      DROP TABLE IF EXISTS app_settings;
    `);
  }
};

export default migration;
