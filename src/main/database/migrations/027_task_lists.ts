import type { Migration } from '../migrator';

const migration: Migration = {
  id: 27,
  name: 'task_lists',
  up(db) {
    db.exec(`
      CREATE TABLE task_list (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL CHECK(length(trim(name)) > 0),
        icon TEXT,
        group_name TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO task_list VALUES ('tasks', 'Tasks', NULL, NULL, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));
      CREATE TABLE study_task_next (
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
        list_id TEXT NOT NULL DEFAULT 'tasks' REFERENCES task_list(id),
        recurrence TEXT,
        reminder_at TEXT,
        subject TEXT NOT NULL DEFAULT '',
        CHECK(start_date IS NULL OR due_date IS NULL OR start_date <= due_date)
      );
      INSERT INTO study_task_next (id,title,description,status,start_date,due_date,priority,sort_order,references_json,completed_at,created_at,updated_at)
        SELECT id,title,description,status,start_date,due_date,priority,sort_order,references_json,completed_at,created_at,updated_at FROM study_task;
      DROP TABLE study_task;
      ALTER TABLE study_task_next RENAME TO study_task;
      CREATE INDEX idx_study_task_due ON study_task(status, due_date);
      CREATE INDEX idx_study_task_start ON study_task(status, start_date);
      CREATE INDEX idx_study_task_list ON study_task(list_id, sort_order);
      CREATE INDEX idx_study_task_reminder ON study_task(reminder_at) WHERE status='open' AND reminder_at IS NOT NULL;
    `);
  },
  down(db) {
    db.exec(`DROP INDEX idx_study_task_reminder; DROP INDEX idx_study_task_list;
      ALTER TABLE study_task DROP COLUMN subject;
      ALTER TABLE study_task DROP COLUMN reminder_at;
      ALTER TABLE study_task DROP COLUMN recurrence;
      ALTER TABLE study_task DROP COLUMN list_id;
      DROP TABLE task_list;`);
  },
};
export default migration;
