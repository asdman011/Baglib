import type { Migration } from '../migrator';
const migration: Migration = {
  id: 29,
  name: 'manuscripts',
  up(db) {
    db.exec(`
      CREATE TABLE manuscript (
        id TEXT PRIMARY KEY, title TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('research','book')),
        settings_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, deleted_at TEXT
      );
      CREATE TABLE manuscript_document (
        id TEXT PRIMARY KEY,
        manuscript_id TEXT NOT NULL REFERENCES manuscript(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES manuscript_document(id) ON DELETE CASCADE,
        title TEXT NOT NULL, position INTEGER NOT NULL, snapshot TEXT NOT NULL,
        plain_text TEXT NOT NULL DEFAULT '',
        primary_mode TEXT NOT NULL DEFAULT 'page' CHECK(primary_mode IN ('page','edgeless')),
        updated_at TEXT NOT NULL, deleted_at TEXT
      );
      CREATE TABLE manuscript_link (
        document_id TEXT NOT NULL REFERENCES manuscript_document(id) ON DELETE CASCADE,
        target_scheme TEXT NOT NULL CHECK(target_scheme IN ('quran','sunnah','poetry','book','note')),
        target_id TEXT NOT NULL, block_id TEXT NOT NULL,
        PRIMARY KEY(document_id,block_id,target_scheme,target_id)
      );
      CREATE INDEX idx_manuscript_link_target ON manuscript_link(target_scheme,target_id);
      CREATE VIRTUAL TABLE manuscript_document_fts USING fts5(
        document_id UNINDEXED, title, plain_text, tokenize='unicode61'
      );
      CREATE TRIGGER manuscript_document_fts_delete AFTER DELETE ON manuscript_document BEGIN
        DELETE FROM manuscript_document_fts WHERE document_id=OLD.id;
      END;
    `);
  },
  down(db) {
    db.exec(`DROP TRIGGER manuscript_document_fts_delete;
      DROP TABLE manuscript_document_fts; DROP TABLE manuscript_link;
      DROP TABLE manuscript_document; DROP TABLE manuscript;`);
  },
};
export default migration;
