import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { KnowledgeCardRepository } from '../../src/main/database/repositories/knowledge-card.repository';
import { SqliteKnowledgeRepository } from '../../src/main/database/repositories/knowledge.repository';
import { validateCardInput } from '../../src/shared/types/knowledge-cards';
import { cardPosition, selectionCardText } from '../../src/renderer/libs/knowledge-card-context';

const open = () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  return { db, cards: new KnowledgeCardRepository(db) };
};
const ayah = { front: 'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ', back: '', sourceKind: 'quran' as const, sourceRef: 'quran:2:255', sourceLabel: '2:255', language: 'ar' };

test('a Quran card saves verbatim with no Work', () => {
  const { cards } = open();
  const card = cards.save(ayah);
  assert.equal(card.front, ayah.front);
  assert.equal(card.workId, null);
  assert.equal(card.sourceRef, 'quran:2:255');
  assert.equal(card.memorizing, false);
});

test('saving does not schedule a card, and adding to memorization does', () => {
  const { db, cards } = open();
  const card = cards.save(ayah);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM srs_state').get().n, 0);
  assert.equal(cards.setMemorizing(card.id, true), true);
  assert.equal(db.prepare('SELECT state FROM srs_state').get().state, 'new');
  assert.equal(cards.list()[0].memorizing, true);
});

test('taking a card out of memorization keeps its progress', () => {
  const { db, cards } = open();
  const card = cards.save(ayah);
  cards.setMemorizing(card.id, true);
  db.prepare(`UPDATE srs_state SET state = 'review', reps = 4, lapses = 1 WHERE knowledge_id = ?`).run(card.id);
  cards.setMemorizing(card.id, false);
  assert.equal(cards.list()[0].memorizing, false);
  cards.setMemorizing(card.id, true);
  const state = db.prepare('SELECT state, reps, lapses FROM srs_state').get();
  assert.deepEqual({ ...state }, { state: 'review', reps: 4, lapses: 1 });
});

test('saving the same text from the same source returns the same card', () => {
  const { cards } = open();
  assert.equal(cards.save(ayah).id, cards.save(ayah).id);
  assert.notEqual(cards.save(ayah).id, cards.save({ ...ayah, sourceRef: 'quran:2:256' }).id);
  assert.equal(cards.list().length, 2);
});

test('deleting removes the card and its review history', () => {
  const { db, cards } = open();
  const card = cards.save(ayah);
  cards.setMemorizing(card.id, true);
  db.prepare(`INSERT INTO srs_review_log (id, knowledge_id, reviewed_at, rating) VALUES ('r', ?, 'now', 3)`).run(card.id);
  assert.equal(cards.remove(card.id), true);
  for (const table of ['knowledge', 'card_detail', 'srs_state', 'srs_review_log']) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
});

test('a card cannot delete another kind of knowledge', () => {
  const { db, cards } = open();
  db.prepare(`INSERT INTO knowledge (id, knowledge_type) VALUES ('note-1', 'note')`).run();
  assert.equal(cards.remove('note-1'), false);
  assert.equal(cards.setMemorizing('note-1', true), false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM knowledge').get().n, 1);
});

test('search matches Arabic text and treats wildcards literally', () => {
  const { cards } = open();
  cards.save({ ...ayah, front: 'تقوى', sourceRef: 'a' });
  cards.save({ ...ayah, front: '100% علم', sourceRef: 'b' });
  assert.equal(cards.list({ search: 'تقوى' }).length, 1);
  assert.equal(cards.list({ search: '%' })[0].front, '100% علم');
  assert.equal(cards.list({ search: '%' }).length, 1);
});

test('an unknown Work is dropped rather than failing the save', () => {
  const { cards } = open();
  assert.equal(cards.save({ ...ayah, sourceKind: 'book', workId: 'missing' }).workId, null);
});

test('cards stay out of the annotation listing', () => {
  const { db, cards } = open();
  cards.save(ayah);
  assert.equal(new SqliteKnowledgeRepository(db).getAllKnowledge().length, 0);
});

test('input validation keeps text exact and rejects bad requests', () => {
  assert.equal(validateCardInput({ front: '  بِسْمِ ٱللَّهِ ', back: '', sourceKind: 'quran' }).front, '  بِسْمِ ٱللَّهِ ');
  for (const bad of [null, {}, { front: '', back: '', sourceKind: 'quran' }, { front: 'a', back: '', sourceKind: 'other' }, { front: 'a', back: 1, sourceKind: 'term' }, { front: 'a', back: '', sourceKind: 'term', sourceRef: 'x'.repeat(501) }]) {
    assert.throws(() => validateCardInput(bad), /invalid-request/u);
  }
});

test('selections must be short enough for a card', () => {
  assert.equal(selectionCardText('  علم  '), 'علم');
  assert.equal(selectionCardText('ا'), null);
  assert.equal(selectionCardText('ا'.repeat(301)), null);
});

test('the popup stays inside the window at phone width', () => {
  assert.deepEqual(cardPosition(10, 100, 300, 200, 375, 800), { left: 16, top: 112 });
  assert.deepEqual(cardPosition(370, 100, 300, 200, 375, 800), { left: 59, top: 112 });
  assert.equal(cardPosition(100, 780, 300, 200, 375, 800).top, 568);
});
