import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { SqliteKnowledgeRepository } from '../../src/main/database/repositories/knowledge.repository';
import { KnowledgeHistoryService, headRevision } from '../../src/main/services/knowledge-history';
import { CommentThreadService } from '../../src/main/services/comment-threads';
import { buildCommentThreads, filterCommentThreads, validateCommentAnchor } from '../../src/shared/comment-threads';

function fixture() {
  const db = new Database(':memory:'); db.pragma('foreign_keys=ON'); runMigrations(db, migrations);
  db.prepare("INSERT INTO work(id,title) VALUES('book','كتاب — Book')").run();
  new SqliteKnowledgeRepository(db).addNote({ id: 'note', bookId: 'book', pageNumber: 2, content: 'الأصل', createdAt: '2026-01-01' });
  let tick = 0;
  const clock = () => new Date(Date.UTC(2026, 10, 5, 0, 0, tick++));
  return { db, comments: new CommentThreadService(db, clock), history: new KnowledgeHistoryService(db) };
}

test('migration 023 adds resolve and anchor columns and the open-thread index, and rolls back', () => {
  const db = new Database(':memory:'); runMigrations(db, migrations);
  const columns = (db.prepare('PRAGMA table_info(comment)').all() as { name: string }[]).map(column => column.name);
  assert.ok(columns.includes('resolved_at') && columns.includes('anchor_json'));
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_comment_open'").get());
  migrations.find(migration => migration.id === 23)!.down!(db);
  const after = (db.prepare('PRAGMA table_info(comment)').all() as { name: string }[]).map(column => column.name);
  assert.ok(!after.includes('resolved_at') && !after.includes('anchor_json'));
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name='idx_comment_open'").get(), undefined);
});

test('threads, replies, resolve and reopen are versioned with the item', () => {
  const { db, comments, history } = fixture();
  const before = headRevision(db, 'note');
  const root = comments.add({ knowledgeId: 'note', text: 'هل هذا صحيح؟ — Is this right?', anchor: { kind: 'page', page: 2, rect: [0.1, 0.2, 0.3, 0.05] } });
  const reply = comments.add({ knowledgeId: 'note', text: 'Yes, see p. 3', parentId: root });
  comments.add({ knowledgeId: 'note', text: 'nested', parentId: reply });
  let [thread] = comments.list('note');
  assert.equal(thread.id, root);
  assert.deepEqual(thread.anchor, { kind: 'page', page: 2, rect: [0.1, 0.2, 0.3, 0.05] });
  assert.deepEqual(thread.replies.map(entry => entry.content), ['Yes, see p. 3', 'nested']);
  assert.deepEqual(comments.openCounts(), { note: 1 });
  comments.setResolved(reply, true); // resolving through a reply resolves the root
  [thread] = comments.list('note');
  assert.ok(thread.resolvedAt);
  assert.deepEqual(comments.openCounts(), {});
  comments.add({ knowledgeId: 'note', text: 'one more thing', parentId: root }); // a reply reopens
  assert.equal(comments.list('note')[0].resolvedAt, null);
  comments.edit(root, 'هل هذا صحيح؟');
  assert.equal(comments.list('note')[0].edited, true);
  assert.equal(headRevision(db, 'note'), before + 6);
  // Restoring the version before any comment removes them; history keeps them.
  history.restore('note', before, headRevision(db, 'note'));
  assert.deepEqual(comments.list('note'), []);
  const restored = history.read('note', before + 2);
  assert.equal(restored.comments.length, 2);
});

test('rejects bad input: anchors on replies, foreign parents, trashed items, empty text, bad anchors', () => {
  const { db, comments } = fixture();
  const root = comments.add({ knowledgeId: 'note', text: 'root' });
  assert.throws(() => comments.add({ knowledgeId: 'note', text: 'x', parentId: root, anchor: { kind: 'page', page: 1 } }), /invalid-request/);
  assert.throws(() => comments.add({ knowledgeId: 'note', text: 'x', parentId: 'missing' }), /invalid-request/);
  assert.throws(() => comments.add({ knowledgeId: 'note', text: '   ' }), /invalid-request/);
  assert.throws(() => comments.add({ knowledgeId: 'note', text: 'x', anchor: { kind: 'page', page: 0 } as never }), /invalid-request/);
  db.prepare("UPDATE knowledge SET deleted_at='2026-11-05' WHERE id='note'").run();
  assert.throws(() => comments.add({ knowledgeId: 'note', text: 'x' }), /invalid-request/);
  assert.throws(() => comments.setResolved(root, true), /invalid-request/);
});

test('anchor validation and thread building', () => {
  assert.deepEqual(validateCommentAnchor({ kind: 'paragraph', anchor: '^a1b2' }), { kind: 'paragraph', anchor: '^a1b2' });
  assert.deepEqual(validateCommentAnchor({ kind: 'ref', target: 'quran:hafs:2:255' }), { kind: 'ref', target: 'quran:hafs:2:255' });
  for (const bad of [null, [], { kind: 'ref', target: 'quran:hafs:200:1' }, { kind: 'paragraph', anchor: 'no-caret' }, { kind: 'page', page: 1, rect: [0, 0, 2, 0] }, { kind: 'page', page: 1, extra: true }]) assert.throws(() => validateCommentAnchor(bad), /invalid-request/);
  const rows = [
    { id: 'b', knowledge_id: 'k', parent_comment_id: 'a', content: 'reply', created_at: '2', updated_at: '2' },
    { id: 'a', knowledge_id: 'k', parent_comment_id: null, content: 'root', created_at: '1', updated_at: '1', resolved_at: '3' },
    { id: 'c', knowledge_id: 'k', parent_comment_id: 'gone', content: 'orphan', created_at: '4', updated_at: '4', anchor_json: '{bad' },
  ];
  const threads = buildCommentThreads(rows);
  assert.deepEqual(threads.map(thread => [thread.id, thread.replies.length]), [['a', 1], ['c', 0]]);
  assert.equal(threads[1].anchor, null);
  assert.deepEqual(filterCommentThreads(threads, 'open').map(thread => thread.id), ['c']);
  assert.deepEqual(filterCommentThreads(threads, 'resolved').map(thread => thread.id), ['a']);
});
