import type { Migration } from '../migrator';

const migration: Migration = {
  id: 8,
  name: 'file_path_index_and_storage',

  up(db) {
    // 1. Ensure storage state and verification columns exist on file_source_detail
    const columns = db.prepare(`PRAGMA table_info(file_source_detail)`).all() as Array<{ name: string }>;
    const colNames = new Set(columns.map((c) => c.name));

    if (!colNames.has('storage_state')) {
      db.exec(`ALTER TABLE file_source_detail ADD COLUMN storage_state TEXT DEFAULT 'available';`);
    }

    if (!colNames.has('last_verified_at')) {
      db.exec(`ALTER TABLE file_source_detail ADD COLUMN last_verified_at TEXT;`);
    }

    // 2. High-performance indices for file path lookup, hash deduplication, and ISBN matching
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_file_source_detail_path ON file_source_detail(file_path);
      CREATE INDEX IF NOT EXISTS idx_file_source_detail_hash ON file_source_detail(file_hash);
      CREATE INDEX IF NOT EXISTS idx_edition_isbn ON edition(isbn);
    `);
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_file_source_detail_path;
      DROP INDEX IF EXISTS idx_file_source_detail_hash;
      DROP INDEX IF EXISTS idx_edition_isbn;
    `);
  },
};

export default migration;
