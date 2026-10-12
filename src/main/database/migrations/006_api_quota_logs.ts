import type { Migration } from '../migrator';

const migration: Migration = {
  id: 6,
  name: 'api_quota_logs',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS api_quota_logs (
        date          TEXT PRIMARY KEY,
        request_count INTEGER NOT NULL DEFAULT 0,
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_api_quota_date ON api_quota_logs(date);
    `);
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_api_quota_date;
      DROP TABLE IF EXISTS api_quota_logs;
    `);
  }
};

export default migration;
