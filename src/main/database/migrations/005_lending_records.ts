import type { Migration } from '../migrator';

const migration: Migration = {
  id: 5,
  name: 'lending_records',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS lending_record (
        id                   TEXT PRIMARY KEY,
        work_id              TEXT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
        borrower_name        TEXT NOT NULL,
        borrower_contact     TEXT,
        borrow_date          TEXT NOT NULL,
        expected_return_date TEXT,
        actual_return_date   TEXT,
        is_returned          INTEGER NOT NULL DEFAULT 0,
        status               TEXT NOT NULL DEFAULT 'active',
        condition_out        TEXT,
        condition_return     TEXT,
        notes                TEXT,
        created_at           TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_lending_work_id ON lending_record(work_id);
      CREATE INDEX IF NOT EXISTS idx_lending_status  ON lending_record(status);
    `);
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_lending_status;
      DROP INDEX IF EXISTS idx_lending_work_id;
      DROP TABLE IF EXISTS lending_record;
    `);
  }
};

export default migration;
