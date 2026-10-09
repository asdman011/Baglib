import type { Migration } from '../migrator';

const migration: Migration = {
  id: 3,
  name: 'add_reading_status',

  up(db) {
    db.exec(`
      ALTER TABLE work ADD COLUMN reading_status TEXT DEFAULT 'unread';
      ALTER TABLE work ADD COLUMN reading_progress INTEGER DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_work_reading_status ON work(reading_status);
    `);
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_work_reading_status;
      ALTER TABLE work DROP COLUMN reading_progress;
      ALTER TABLE work DROP COLUMN reading_status;
    `);
  }
};

export default migration;
