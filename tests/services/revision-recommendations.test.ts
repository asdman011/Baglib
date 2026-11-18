/**
 * KEY-412 "Revise next": the rule-based recommendations (backlog, leeches, coverage gaps) and dismissals.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { RevisionRecommendationService } from '../../src/main/services/revision-recommendations';
import { activeDismissals, validateRecommendationId, RECOMMENDATIONS_DISMISSED_SETTING } from '../../src/shared/revision-recommendations';

const NOW = '2026-11-18T12:00:00.000Z';
const OLD = '2026-10-01T00:00:00.000Z';

function fixture(clockIso = NOW) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  db.prepare(`INSERT INTO deck (id, name, kind, created_at, updated_at) VALUES ('d1', 'الشعر', 'normal', ?, ?)`).run(OLD, OLD);
  db.prepare(`INSERT INTO deck (id, name, kind, created_at, updated_at) VALUES ('d2', 'Hadith', 'normal', ?, ?)`).run(OLD, OLD);
  let clock = new Date(clockIso);
  const service = new RevisionRecommendationService(db, () => clock);
  return { db, service, setClock: (iso: string) => { clock = new Date(iso); } };
}

type Card = { id: string; deck?: string; state?: string; due?: string; stability?: number; lastReview?: string; ref?: string };
function card(db: Database.Database, c: Card) {
  db.prepare(`INSERT INTO knowledge (id, knowledge_type, created_at, updated_at) VALUES (?, 'card', ?, ?)`).run(c.id, OLD, OLD);
  db.prepare(`INSERT INTO card_detail (knowledge_id, front, back, source_kind, source_ref) VALUES (?, 'f', 'b', 'note', ?)`).run(c.id, c.ref ?? null);
  db.prepare(`INSERT INTO srs_state (knowledge_id, state, due_at, stability, last_review) VALUES (?, ?, ?, ?, ?)`)
    .run(c.id, c.state ?? 'review', c.due ?? '2026-11-30T00:00:00.000Z', c.stability ?? null, c.lastReview ?? null);
  if (c.deck) db.prepare(`INSERT INTO deck_card (deck_id, knowledge_id, position, added_at) VALUES (?, ?, 0, ?)`).run(c.deck, c.id, OLD);
}

test('backlog: overdue cards from earlier days per deck, likely-forgotten counted, chunk of 20', () => {
  const { db, service } = fixture();
  // 25 overdue in d1; 10 long-forgotten (stability 1 day, last review 40 days ago), 15 still fresh.
  for (let i = 0; i < 25; i++) {
    card(db, { id: `p${i}`, deck: 'd1', due: '2026-11-10T00:00:00.000Z', stability: i < 10 ? 1 : 500, lastReview: '2026-10-09T00:00:00.000Z' });
  }
  // Due later today (not a backlog) and a suspended card.
  card(db, { id: 'today', deck: 'd2', due: '2026-11-18T11:00:00.000Z', stability: 5, lastReview: '2026-11-13T00:00:00.000Z' });
  card(db, { id: 'susp', deck: 'd2', state: 'suspended', due: '2026-11-01T00:00:00.000Z' });
  const items = service.list();
  const backlog = items.filter(i => i.kind === 'backlog');
  assert.equal(backlog.length, 1);
  assert.deepEqual(
    { id: backlog[0].id, count: backlog[0].count, weak: backlog[0].weak, suggested: backlog[0].suggested, deckName: backlog[0].deckName },
    { id: 'backlog:d1', count: 25, weak: 10, suggested: 20, deckName: 'الشعر' }
  );
  assert.equal(items[0].id, 'backlog:d1', 'a backlog with forgotten cards comes first');
});

test('leeches: tagged or repeatedly forgotten in the last two weeks, pointing at their deck', () => {
  const { db, service } = fixture();
  card(db, { id: 'l1', deck: 'd2' });
  card(db, { id: 'l2', deck: 'd2' });
  card(db, { id: 'ok', deck: 'd1' });
  db.prepare(`INSERT OR IGNORE INTO tag (id, name, origin) VALUES ('tag-leech', 'leech', 'system')`).run();
  db.prepare(`INSERT INTO knowledge_tag (knowledge_id, tag_id) VALUES ('l1', 'tag-leech')`).run();
  const log = db.prepare(`INSERT INTO srs_review_log (id, knowledge_id, reviewed_at, rating, state_before) VALUES (?, ?, ?, ?, 'review')`);
  log.run('r1', 'l2', '2026-11-15T00:00:00.000Z', 1);
  log.run('r2', 'l2', '2026-11-16T00:00:00.000Z', 1);
  log.run('r3', 'ok', '2026-11-16T00:00:00.000Z', 1);
  log.run('r4', 'ok', '2026-10-01T00:00:00.000Z', 1); // outside the window
  const leech = service.list().find(i => i.kind === 'leeches');
  assert.ok(leech);
  assert.equal(leech.count, 2);
  assert.equal(leech.deckId, 'd2');
});

test('coverage gaps: finished book without a deck, highlights without questions, narrators, idle new cards', () => {
  const { db, service } = fixture();
  db.prepare(`INSERT INTO work (id, title, reading_status) VALUES ('w1', 'مقدمة ابن خلدون', 'completed')`).run();
  db.prepare(`INSERT INTO work (id, title, reading_status) VALUES ('w2', 'The Histories', 'reading')`).run();
  db.prepare(`INSERT INTO work (id, title, reading_status) VALUES ('w3', 'Unannotated', 'completed')`).run();
  const ann = db.prepare(`INSERT INTO annotations (id, book_id, type, location_cfi_or_page, selected_text, note_content, created_at, updated_at) VALUES (?, ?, 'highlight', '1', ?, NULL, ?, ?)`);
  ann.run('a1', 'w1', 'العصبية', OLD, OLD);
  for (let i = 0; i < 4; i++) ann.run(`b${i}`, 'w2', `passage ${i}`, OLD, OLD);
  ann.run('b-empty', 'w2', '  ', OLD, OLD);
  // w2 already has a book deck; one highlight already has an accepted question.
  const noteType = (db.prepare(`SELECT id FROM card_note_type LIMIT 1`).get() as { id: string }).id;
  db.prepare(`INSERT INTO deck_subscription (id, deck_id, source_kind, source_ref, note_type_id) VALUES ('s1', 'd2', 'book_highlights', 'w2', ?)`).run(noteType);
  db.prepare(`INSERT INTO card_note (id, note_type_id, fields_json, guid, source_ref, created_at, updated_at) VALUES ('n1', ?, '{}', 'g1', 'ai-question:w2/b0/1', ?, ?)`).run(noteType, OLD, OLD);
  // Six mastered hadith and no narrator cards.
  for (let i = 0; i < 6; i++) card(db, { id: `h${i}`, ref: `sunnah-hadith:bukhari:1:${i}`, stability: 40, lastReview: '2026-11-01T00:00:00.000Z' });
  // New cards in d1, untouched.
  for (let i = 0; i < 3; i++) card(db, { id: `n${i}`, deck: 'd1', state: 'new' });

  const byKind = new Map(service.list().map(i => [i.kind, i]));
  assert.deepEqual([byKind.get('finished-book')?.workId, byKind.get('finished-book')?.count], ['w1', 1]);
  assert.deepEqual([byKind.get('book-questions')?.workId, byKind.get('book-questions')?.count], ['w2', 3]);
  assert.equal(byKind.get('narrators')?.count, 6);
  assert.deepEqual([byKind.get('new-waiting')?.deckId, byKind.get('new-waiting')?.count], ['d1', 3]);

  // Once a narrator card exists, or a new card was introduced recently, those items go away.
  db.prepare(`UPDATE card_detail SET source_ref = 'narrator:42' WHERE knowledge_id = 'h0'`).run();
  db.prepare(`INSERT INTO srs_review_log (id, knowledge_id, reviewed_at, rating, state_before) VALUES ('rn', 'n0', '2026-11-17T00:00:00.000Z', 3, 'new')`).run();
  const kinds = service.list().map(i => i.kind);
  assert.ok(!kinds.includes('narrators'));
  assert.ok(!kinds.includes('new-waiting'));
});

test('dismiss: hidden for 7 days, then back; ids are validated', () => {
  const f = fixture();
  card(f.db, { id: 'x', deck: 'd1', due: '2026-11-01T00:00:00.000Z', stability: 1, lastReview: '2026-10-01T00:00:00.000Z' });
  assert.equal(f.service.list().length, 1);
  f.service.dismiss('backlog:d1');
  assert.equal(f.service.list().length, 0);
  f.setClock('2026-11-25T12:00:01.000Z');
  assert.equal(f.service.list().length, 1, 'back after 7 days');
  assert.throws(() => f.service.dismiss('drop table'), /invalid-request/u);
  assert.throws(() => validateRecommendationId(42), /invalid-request/u);
  // Expired and malformed entries are pruned from the stored setting.
  const stored = JSON.parse((f.db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(RECOMMENDATIONS_DISMISSED_SETTING) as { value: string }).value);
  assert.deepEqual(Object.keys(activeDismissals({ ...stored, bogus: 'x', 'backlog:old': '2020-01-01T00:00:00.000Z' }, new Date(NOW))), ['backlog:d1']);
});
