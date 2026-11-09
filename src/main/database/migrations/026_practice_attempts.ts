import type { Migration } from '../migrator';
const kinds = "'recall','choice','numeric','short','application','explain_back'";
const migration: Migration = {
    id: 26, name: 'practice_attempts',
    up(db) {
        db.exec(`
      CREATE TABLE practice_attempt (
        id TEXT PRIMARY KEY, knowledge_id TEXT, card_revision INTEGER,
        question_kind TEXT NOT NULL CHECK(question_kind IN (${kinds})),
        answer_text TEXT NOT NULL DEFAULT '',
        result TEXT NOT NULL CHECK(result IN ('correct','partial','incorrect','pending')),
        check_method TEXT NOT NULL CHECK(check_method IN ('auto','self','judgment')),
        mistake_category TEXT CHECK(mistake_category IN ('definition','assumption','calculation','recall','reading','method','other')),
        confidence INTEGER CHECK(confidence BETWEEN 1 AND 4),
        duration_ms INTEGER CHECK(duration_ms >= 0), source_ref TEXT,
        context TEXT NOT NULL DEFAULT 'practice' CHECK(context IN ('practice','section_check','challenge')),
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_practice_attempt_card ON practice_attempt(knowledge_id, created_at);
      CREATE INDEX idx_practice_attempt_time ON practice_attempt(created_at);
      CREATE INDEX idx_practice_attempt_source ON practice_attempt(source_ref) WHERE source_ref IS NOT NULL;
      ALTER TABLE card_detail ADD COLUMN question_kind TEXT NOT NULL DEFAULT 'recall' CHECK(question_kind IN (${kinds}));
      ALTER TABLE card_detail ADD COLUMN payload_json TEXT;
    `);
    },
    down(db) {
        db.exec('DROP TABLE practice_attempt; ALTER TABLE card_detail DROP COLUMN payload_json; ALTER TABLE card_detail DROP COLUMN question_kind;');
    },
};
export default migration;
