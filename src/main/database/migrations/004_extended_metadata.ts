import type { Migration } from '../migrator';

const migration: Migration = {
  id: 4,
  name: 'extended_metadata',

  up(db) {
    db.exec(`
      -- 1. Ensure all polymorphic work types exist (including wt-periodical)
      INSERT OR IGNORE INTO work_type (id, name, icon) VALUES
        ('wt-periodical', 'مجلة / دورية', 'layers');

      -- 2. Add metadata_json column to work table for polymorphic metadata storage
      ALTER TABLE work ADD COLUMN metadata_json TEXT;

      -- 3. Add bookcase and shelf_section to physical_source_detail for granular physical location tracking
      ALTER TABLE physical_source_detail ADD COLUMN bookcase TEXT;
      ALTER TABLE physical_source_detail ADD COLUMN shelf_section TEXT;
    `);
  },

  down(db) {
    db.exec(`
      ALTER TABLE physical_source_detail DROP COLUMN shelf_section;
      ALTER TABLE physical_source_detail DROP COLUMN bookcase;
      ALTER TABLE work DROP COLUMN metadata_json;
      DELETE FROM work_type WHERE id = 'wt-periodical';
    `);
  }
};

export default migration;
