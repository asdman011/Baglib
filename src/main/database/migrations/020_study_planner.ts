import type { Migration } from '../migrator';

const migration: Migration = {
  id: 20,
  name: 'study_planner',
  up(db) {
    db.exec(`
      CREATE TABLE study_task (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL CHECK(length(trim(title)) > 0),
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','cancelled')),
        start_date TEXT,
        due_date TEXT,
        priority INTEGER NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 3),
        sort_order INTEGER NOT NULL DEFAULT 0,
        references_json TEXT NOT NULL DEFAULT '[]',
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK(start_date IS NULL OR due_date IS NULL OR start_date <= due_date)
      );
      CREATE INDEX idx_study_task_due ON study_task(status, due_date);
      CREATE INDEX idx_study_task_start ON study_task(status, start_date);
    `);
  },
  down(db) { db.exec('DROP TABLE study_task;'); },
};

export default migration;
