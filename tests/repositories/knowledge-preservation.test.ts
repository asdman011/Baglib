import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { createTestDatabase } from '../helpers/test-db';
import { KnowledgeCardRepository } from '../../src/main/database/repositories/knowledge-card.repository';
import { SqliteKnowledgeRepository } from '../../src/main/database/repositories/knowledge.repository';
import { AnnotationRepository } from '../../src/main/database/repositories/annotation.repository';

const NOW = '2026-11-01T00:00:00.000Z';

function seedBook(db: Database.Database) {
  db.prepare(`INSERT INTO work (id, title) VALUES ('w1', 'رياض الصالحين')`).run();
  db.prepare(`INSERT INTO knowledge (id, work_id, knowledge_type, location) VALUES ('k1', 'w1', 'note', '12')`).run();
  db.prepare(`INSERT INTO note_detail (knowledge_id, content) VALUES ('k1', 'فائدة')`).run();
  db.prepare(`INSERT INTO annotations (id, book_id, type, location_cfi_or_page, selected_text, created_at, updated_at) VALUES ('a1', 'w1', 'highlight', '5', 'نص', ?, ?)`).run(NOW, NOW);
}

test('migrating an existing database keeps annotations and lets knowledge outlive its book', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations.filter(migration => migration.id < 19));
  seedBook(db);
  runMigrations(db, migrations);

  assert.equal(db.prepare(`SELECT selected_text FROM annotations WHERE id = 'a1'`).pluck().get(), 'نص');
  db.prepare(`DELETE FROM work WHERE id = 'w1'`).run();

  const note = db.prepare(`SELECT work_id, former_work_title FROM knowledge WHERE id = 'k1'`).get() as Record<string, unknown>;
  assert.deepEqual({ ...note }, { work_id: null, former_work_title: 'رياض الصالحين' });
  assert.equal(db.prepare(`SELECT content FROM note_detail WHERE knowledge_id = 'k1'`).pluck().get(), 'فائدة');
  const highlight = db.prepare(`SELECT book_id, former_work_title, selected_text FROM annotations WHERE id = 'a1'`).get() as Record<string, unknown>;
  assert.deepEqual({ ...highlight }, { book_id: null, former_work_title: 'رياض الصالحين', selected_text: 'نص' });
});

test('notes and highlights from deleted books are listed, and left out of book listings', () => {
  const db = createTestDatabase();
  db.pragma('foreign_keys = ON');
  seedBook(db);
  db.prepare(`DELETE FROM work WHERE id = 'w1'`).run();
  const preserved = new KnowledgeCardRepository(db).listPreserved();
  assert.deepEqual(preserved.map(item => [item.bookTitle, item.type, item.text]).sort(), [['رياض الصالحين', 'highlight', 'نص'], ['رياض الصالحين', 'note', 'فائدة']]);
  assert.equal(new AnnotationRepository(db).getAll().length, 0);
  assert.equal(new SqliteKnowledgeRepository(db).getAllKnowledge().length, 0);
});

test('a note saved through the app is listed once after its book is deleted', () => {
  const db = createTestDatabase();
  db.pragma('foreign_keys = ON');
  db.prepare(`INSERT INTO work (id, title) VALUES ('w3', 'Book')`).run();
  new SqliteKnowledgeRepository(db).saveKnowledge({ workId: 'w3', knowledgeType: 'note', location: '1', noteContent: 'kept' });
  db.prepare(`DELETE FROM work WHERE id = 'w3'`).run();
  assert.deepEqual(new KnowledgeCardRepository(db).listPreserved().map(item => item.text), ['kept']);
});

test('every book delete path keeps knowledge, including emptying the trash', () => {
  const db = createTestDatabase();
  db.pragma('foreign_keys = ON');
  seedBook(db);
  db.prepare(`UPDATE work SET deleted_at = ? WHERE id = 'w1'`).run(NOW);
  db.prepare(`DELETE FROM work WHERE deleted_at IS NOT NULL`).run();
  assert.equal(db.prepare(`SELECT COUNT(*) FROM knowledge`).pluck().get(), 1);
  assert.equal(db.prepare(`SELECT COUNT(*) FROM annotations`).pluck().get(), 1);
});

test('cards and review history stay when their book is deleted', () => {
  const db = createTestDatabase();
  db.pragma('foreign_keys = ON');
  db.prepare(`INSERT INTO work (id, title) VALUES ('w2', 'Book')`).run();
  db.prepare(`INSERT INTO knowledge (id, work_id, knowledge_type) VALUES ('c1', 'w2', 'card')`).run();
  db.prepare(`INSERT INTO card_detail (knowledge_id, front, back, source_kind) VALUES ('c1', 'front', 'back', 'book')`).run();
  db.prepare(`INSERT INTO srs_state (knowledge_id, state, due_at) VALUES ('c1', 'review', ?)`).run(NOW);
  db.prepare(`INSERT INTO srs_review_log (id, knowledge_id, reviewed_at, rating) VALUES ('r1', 'c1', ?, 3)`).run(NOW);

  db.prepare(`DELETE FROM work WHERE id = 'w2'`).run();

  assert.equal(db.prepare(`SELECT front FROM card_detail WHERE knowledge_id = 'c1'`).pluck().get(), 'front');
  assert.equal(db.prepare(`SELECT state FROM srs_state WHERE knowledge_id = 'c1'`).pluck().get(), 'review');
  assert.equal(db.prepare(`SELECT rating FROM srs_review_log WHERE id = 'r1'`).pluck().get(), 3);
  assert.equal(db.prepare(`SELECT former_work_title FROM knowledge WHERE id = 'c1'`).pluck().get(), 'Book');
});

test('deleting a card still removes its schedule and history', () => {
  const db = createTestDatabase();
  db.pragma('foreign_keys = ON');
  db.prepare(`INSERT INTO knowledge (id, knowledge_type) VALUES ('c2', 'card')`).run();
  db.prepare(`INSERT INTO srs_state (knowledge_id, state, due_at) VALUES ('c2', 'new', ?)`).run(NOW);
  db.prepare(`DELETE FROM knowledge WHERE id = 'c2'`).run();
  assert.equal(db.prepare(`SELECT COUNT(*) FROM srs_state`).pluck().get(), 0);
});
