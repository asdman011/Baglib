import type { Migration } from '../migrator';

const migration: Migration = {
  id: 22,
  name: 'pathways',
  up(db) {
    db.exec(`
      CREATE TABLE pathway_item (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL REFERENCES collection(id) ON DELETE CASCADE,
        section TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL CHECK(kind IN ('resource','link','step')),
        reference TEXT,
        title TEXT NOT NULL CHECK(length(trim(title)) > 0),
        url TEXT,
        pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_pathway_item_order ON pathway_item(collection_id, sort_order);
    `);
  },
  down(db) { db.exec('DROP TABLE pathway_item;'); },
};

export default migration;
