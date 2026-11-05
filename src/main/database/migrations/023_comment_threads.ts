import type { Migration } from '../migrator';

/** ADR-010: resolve state and a position inside the item for comment threads. */
const migration: Migration = {
  id: 23,
  name: 'comment_threads',
  up(db) {
    db.exec(`
      ALTER TABLE comment ADD COLUMN resolved_at TEXT;
      ALTER TABLE comment ADD COLUMN anchor_json TEXT;
      CREATE INDEX idx_comment_open ON comment(knowledge_id) WHERE resolved_at IS NULL;
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_comment_open;
      ALTER TABLE comment DROP COLUMN anchor_json;
      ALTER TABLE comment DROP COLUMN resolved_at;
    `);
  },
};

export default migration;
