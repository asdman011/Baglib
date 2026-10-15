import type { Migration } from '../migrator';
import fs from 'fs';

const migration: Migration = {
  id: 9,
  name: 'storage_management',

  up(db) {
    // 1. Add file_size_bytes to file_source_detail if not present
    const columns = db.prepare(`PRAGMA table_info(file_source_detail)`).all() as Array<{ name: string }>;
    const colNames = new Set(columns.map((c) => c.name));

    if (!colNames.has('file_size_bytes')) {
      db.exec(`ALTER TABLE file_source_detail ADD COLUMN file_size_bytes INTEGER;`);
    }

    // 2. High-performance index for filtering by storage health
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_file_source_detail_state ON file_source_detail(storage_state);
    `);

    // 3. Backfill file_size_bytes for records where it is currently NULL
    try {
      const rows = db.prepare(`
        SELECT source_id, file_path 
        FROM file_source_detail 
        WHERE file_size_bytes IS NULL AND file_path IS NOT NULL
      `).all() as Array<{ source_id: string; file_path: string }>;

      const updateStmt = db.prepare(`UPDATE file_source_detail SET file_size_bytes = ? WHERE source_id = ?`);
      for (const row of rows) {
        if (row.file_path && fs.existsSync(row.file_path)) {
          try {
            const stat = fs.statSync(row.file_path);
            updateStmt.run(stat.size, row.source_id);
          } catch {
            // Ignore if file cannot be read
          }
        }
      }
    } catch {
      // Ignore backfill errors
    }
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_file_source_detail_state;
    `);
  },
};

export default migration;
