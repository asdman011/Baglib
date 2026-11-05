import type { Migration } from '../migrator';

// ADR-011: questions gain an Investigating status between Open and Answered. SQLite cannot change a CHECK
// constraint in place, so the table is rebuilt with the same columns, data and index.
const columns = 'knowledge_id, question_text, status, answered_at, source_ref, capture_hash';
const table = (statuses: string) => `
  CREATE TABLE question_detail_rebuild (
    knowledge_id  TEXT PRIMARY KEY REFERENCES knowledge(id) ON DELETE CASCADE,
    question_text TEXT,
    status        TEXT NOT NULL DEFAULT 'open' CHECK(status IN(${statuses})),
    answered_at   TEXT,
    source_ref    TEXT,
    capture_hash  TEXT
  );`;
const finish = `
  DROP TABLE question_detail;
  ALTER TABLE question_detail_rebuild RENAME TO question_detail;
  CREATE UNIQUE INDEX idx_question_capture ON question_detail(source_ref,capture_hash) WHERE source_ref IS NOT NULL AND capture_hash IS NOT NULL;`;

const migration: Migration = {
  id: 24,
  name: 'question_investigating',
  up(db) {
    db.exec(`${table("'open','investigating','answered','dismissed'")}
      INSERT INTO question_detail_rebuild(${columns}) SELECT ${columns} FROM question_detail;
      ${finish}`);
  },
  down(db) {
    // Investigating questions go back to Open, the nearest older status.
    db.exec(`${table("'open','answered','dismissed'")}
      INSERT INTO question_detail_rebuild(${columns}) SELECT knowledge_id, question_text, CASE status WHEN 'investigating' THEN 'open' ELSE status END, answered_at, source_ref, capture_hash FROM question_detail;
      ${finish}`);
  },
};

export default migration;
