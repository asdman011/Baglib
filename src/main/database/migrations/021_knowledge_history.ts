import type { Migration } from '../migrator';

const migration: Migration = {
  id: 21,
  name: 'knowledge_history',
  up(db) {
    db.exec(`
      CREATE TABLE history_blob(hash TEXT PRIMARY KEY, content TEXT NOT NULL, byte_length INTEGER NOT NULL CHECK(byte_length>=0), created_at TEXT NOT NULL);
      CREATE TABLE entity_version(
        id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK(revision>0), snapshot_hash TEXT NOT NULL REFERENCES history_blob(hash) ON DELETE RESTRICT,
        action TEXT NOT NULL, actor TEXT, batch_id TEXT, restored_from_revision INTEGER, schema_version INTEGER NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(entity_type,entity_id,revision));
      CREATE INDEX idx_entity_version_time ON entity_version(entity_type,entity_id,created_at);
      CREATE INDEX idx_entity_version_blob ON entity_version(snapshot_hash);
      CREATE INDEX idx_entity_version_batch ON entity_version(batch_id);
      ALTER TABLE knowledge ADD COLUMN deleted_at TEXT;
      CREATE TABLE study_note_detail(knowledge_id TEXT PRIMARY KEY REFERENCES knowledge(id) ON DELETE CASCADE, title TEXT NOT NULL, content TEXT NOT NULL, aliases_json TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE reading_reflection_detail(knowledge_id TEXT PRIMARY KEY REFERENCES knowledge(id) ON DELETE CASCADE,
        entry_date TEXT NOT NULL, mood TEXT, difficulty INTEGER CHECK(difficulty BETWEEN 1 AND 5), rating INTEGER CHECK(rating BETWEEN 1 AND 5),
        review TEXT NOT NULL DEFAULT '', recommendations TEXT NOT NULL DEFAULT '', lessons TEXT NOT NULL DEFAULT '');
      CREATE INDEX idx_reading_reflection_date ON reading_reflection_detail(entry_date);
      ALTER TABLE question_detail ADD COLUMN status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','answered','dismissed'));
      ALTER TABLE question_detail ADD COLUMN answered_at TEXT;
      ALTER TABLE question_detail ADD COLUMN source_ref TEXT;
      ALTER TABLE question_detail ADD COLUMN capture_hash TEXT;
      CREATE UNIQUE INDEX idx_question_capture ON question_detail(source_ref,capture_hash) WHERE source_ref IS NOT NULL AND capture_hash IS NOT NULL;
      CREATE TABLE reading_session_retained(id TEXT PRIMARY KEY,work_id TEXT REFERENCES work(id) ON DELETE SET NULL,
        edition_id TEXT REFERENCES edition(id) ON DELETE SET NULL,started_at TEXT,ended_at TEXT,pages_read INTEGER,mood TEXT,original_work_id TEXT,former_work_title TEXT);
      INSERT INTO reading_session_retained(id,work_id,edition_id,started_at,ended_at,pages_read,mood,original_work_id)
        SELECT id,work_id,edition_id,started_at,ended_at,pages_read,mood,work_id FROM reading_session;
      DROP TABLE reading_session;
      ALTER TABLE reading_session_retained RENAME TO reading_session;
      CREATE INDEX idx_reading_session_work_id ON reading_session(work_id);
      CREATE INDEX idx_reading_session_work_ended ON reading_session(work_id,ended_at);
      CREATE INDEX idx_reading_session_original ON reading_session(original_work_id,started_at);
      DROP TRIGGER preserve_knowledge_on_work_delete;
      CREATE TRIGGER preserve_knowledge_on_work_delete BEFORE DELETE ON work BEGIN
        UPDATE knowledge SET former_work_title=OLD.title,work_id=NULL WHERE work_id=OLD.id;
        UPDATE annotations SET former_work_title=OLD.title,book_id=NULL WHERE book_id=OLD.id;
        UPDATE reading_session SET original_work_id=COALESCE(original_work_id,OLD.id),former_work_title=OLD.title,work_id=NULL WHERE work_id=OLD.id;
      END;
      CREATE TRIGGER record_reading_completion AFTER UPDATE OF reading_status ON work
      WHEN NEW.reading_status='completed' AND COALESCE(OLD.reading_status,'')<>'completed'
      BEGIN
        INSERT INTO app_settings(key,value,updated_at) VALUES('reading.log.completed:'||NEW.id,strftime('%Y-%m-%dT%H:%M:%fZ','now'),datetime('now'))
          ON CONFLICT(key) DO NOTHING;
      END;
    `);
  },
};
export default migration;
