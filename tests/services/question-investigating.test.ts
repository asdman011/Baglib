import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';

test('migration 024 adds the Investigating status, keeps data and the capture index, and rolls back', () => {
  const db = new Database(':memory:'); db.pragma('foreign_keys=ON');
  // Run up to 023, then add questions in each old status.
  runMigrations(db, migrations.filter(migration => migration.id <= 23));
  db.prepare("INSERT INTO knowledge(id,knowledge_type,created_at,updated_at) VALUES ('q1','question','2026','2026'),('q2','question','2026','2026')").run();
  db.prepare("INSERT INTO question_detail(knowledge_id,question_text,status,source_ref,capture_hash) VALUES ('q1','ما معنى الصبر؟','open','note:n1','h1'),('q2','Why?','answered',NULL,NULL)").run();
  assert.throws(() => db.prepare("UPDATE question_detail SET status='investigating' WHERE knowledge_id='q1'").run(), /CHECK/u);

  runMigrations(db, migrations);
  assert.deepEqual(db.prepare('SELECT knowledge_id,question_text,status,source_ref,capture_hash FROM question_detail ORDER BY knowledge_id').all(), [
    { knowledge_id: 'q1', question_text: 'ما معنى الصبر؟', status: 'open', source_ref: 'note:n1', capture_hash: 'h1' },
    { knowledge_id: 'q2', question_text: 'Why?', status: 'answered', source_ref: null, capture_hash: null },
  ]);
  db.prepare("UPDATE question_detail SET status='investigating' WHERE knowledge_id='q1'").run();
  assert.throws(() => db.prepare("UPDATE question_detail SET status='pending' WHERE knowledge_id='q1'").run(), /CHECK/u);
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_question_capture'").get());
  // The same captured question from the same note is still refused by the unique index.
  db.prepare("INSERT INTO knowledge(id) VALUES ('q3')").run();
  assert.throws(() => db.prepare("INSERT INTO question_detail(knowledge_id,source_ref,capture_hash) VALUES ('q3','note:n1','h1')").run(), /UNIQUE/u);
  db.prepare("DELETE FROM knowledge WHERE id='q3'").run();
  // Deleting the knowledge row still removes its question (foreign key kept).
  db.prepare("DELETE FROM knowledge WHERE id='q2'").run();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM question_detail").get().n, 1);
  assert.deepEqual(db.pragma('foreign_key_check'), []);

  migrations.find(migration => migration.id === 24)!.down!(db);
  assert.equal(db.prepare("SELECT status FROM question_detail WHERE knowledge_id='q1'").get().status, 'open');
  assert.throws(() => db.prepare("UPDATE question_detail SET status='investigating' WHERE knowledge_id='q1'").run(), /CHECK/u);
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_question_capture'").get());
});
