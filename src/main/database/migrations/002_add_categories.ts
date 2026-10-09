import type { Migration } from '../migrator';

const migration: Migration = {
  id: 2,
  name: 'add_categories',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS category (
        id            TEXT PRIMARY KEY,
        parent_id     TEXT REFERENCES category(id) ON DELETE CASCADE,
        name_ar       TEXT NOT NULL,
        name_en       TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_category_parent_id ON category(parent_id);

      ALTER TABLE work ADD COLUMN primary_category_id TEXT REFERENCES category(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_work_primary_category_id ON work(primary_category_id);
    `);
  },
  
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_work_primary_category_id;
      ALTER TABLE work DROP COLUMN primary_category_id;
      
      DROP INDEX IF EXISTS idx_category_parent_id;
      DROP TABLE IF EXISTS category;
    `);
  }
};

export default migration;
