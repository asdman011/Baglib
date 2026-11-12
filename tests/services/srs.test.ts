import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { KnowledgeCardRepository } from '../../src/main/database/repositories/knowledge-card.repository';
import { SrsService } from '../../src/main/services/srs';
import { validateReview } from '../../src/shared/srs';

function fixture(file = ':memory:') {
  const db = new Database(file);
  db.pragma('foreign_keys=ON');
  runMigrations(db, migrations);
  let now = new Date('2026-11-02T12:00:00Z');
  const cards = new KnowledgeCardRepository(db);
  const service = new SrsService(db, () => now);
  const card = cards.save({ front: 'العِلْمُ — Knowledge', back: 'نص محفوظ كما هو', sourceKind: 'note', sourceRef: 'note:test' });
  cards.setMemorizing(card.id, true);
  db.prepare('UPDATE srs_state SET due_at=?').run(now.toISOString());
  return { db, cards, service, card, advance: (value: string) => { now = new Date(value); } };
}

for (const rating of [1, 2, 3, 4] as const) test(`rating ${rating} persists FSRS state and one review without changing text`, () => {
  const { db, service, cards, card } = fixture();
  try {
    const first = service.queue().cards[0];
    const result = service.grade({ id: first.id, revision: first.revision, rating, durationMs: 1234 });
    assert.equal(result.reviewedToday, 1);
    assert.equal(result.due, 0);
    assert.equal(cards.list()[0].front, card.front);
    const state = db.prepare('SELECT * FROM srs_state').get() as { reps: number; due_at: string; stability: number };
    assert.equal(state.reps, 1); assert.ok(state.stability > 0);
    assert.ok(state.due_at > '2026-11-02T12:00:00.000Z');
    assert.equal((db.prepare('SELECT rating FROM srs_review_log').get() as { rating: number }).rating, rating);
    assert.throws(() => service.grade({ id: first.id, revision: first.revision, rating, durationMs: 0 }), /review-changed/);
  } finally { db.close(); }
});

test('suspended and future cards cannot be graded; resume preserves history', () => {
  const { db, service, cards, card, advance } = fixture();
  try {
    const first = service.queue().cards[0];
    cards.setMemorizing(card.id, false);
    assert.equal(service.queue().due, 0);
    assert.throws(() => service.grade({ id: first.id, revision: first.revision, rating: 3, durationMs: 0 }), /review-changed/);
    cards.setMemorizing(card.id, true);
    const resumed = service.queue().cards[0];
    service.grade({ id: resumed.id, revision: resumed.revision, rating: 1, durationMs: 1 });
    const beforePause = db.prepare('SELECT state FROM srs_state').get() as { state: string };
    cards.setMemorizing(card.id, false);
    cards.setMemorizing(card.id, true);
    assert.equal((db.prepare('SELECT state FROM srs_state').get() as { state: string }).state, beforePause.state);
    const due = (db.prepare('SELECT due_at FROM srs_state').get() as { due_at: string }).due_at;
    advance(due);
    const next = service.queue().cards[0];
    assert.ok(next);
    service.grade({ id: next.id, revision: next.revision, rating: 3, durationMs: 10 });
    assert.equal((db.prepare('SELECT reps FROM srs_state').get() as { reps: number }).reps, 2);
  } finally { db.close(); }
});

test('review and schedule survive reopening the database', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-srs-'));
  const file = path.join(directory, 'test.db');
  try {
    const first = fixture(file);
    const item = first.service.queue().cards[0];
    first.service.grade({ id: item.id, revision: item.revision, rating: 3, durationMs: 10 });
    const before = first.db.prepare('SELECT * FROM srs_state').get();
    first.db.close();
    const db = new Database(file);
    try {
      assert.deepEqual(db.prepare('SELECT * FROM srs_state').get(), before);
      assert.equal(new SrsService(db, () => new Date('2026-11-02T12:01:00Z')).queue().reviewedToday, 1);
    } finally { db.close(); }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('schedule and log roll back together if the state update fails', () => {
  const { db, service } = fixture();
  try {
    db.exec("CREATE TRIGGER fail_review BEFORE UPDATE ON srs_state BEGIN SELECT RAISE(ABORT,'test-failure'); END");
    const item = service.queue().cards[0];
    assert.throws(() => service.grade({ id: item.id, revision: item.revision, rating: 3, durationMs: 0 }), /test-failure/);
    assert.equal(service.queue().reviewedToday, 0);
    assert.equal(service.queue().cards[0].revision, item.revision);
  } finally { db.close(); }
});

test('deleted-book preservation retains the scheduled card', () => {
  const { db, service, card } = fixture();
  try {
    db.prepare("INSERT INTO work(id,title) VALUES('book','كتاب')").run();
    db.prepare("UPDATE knowledge SET work_id='book' WHERE id=?").run(card.id);
    db.prepare("DELETE FROM work WHERE id='book'").run();
    assert.equal(service.queue().cards[0].workId, null);
    assert.equal(service.queue().cards[0].front, card.front);
  } finally { db.close(); }
});

test('bad review input is rejected', () => {
  for (const value of [null, {}, { id: 'a', revision: 'b', rating: 0, durationMs: 0 }, { id: 'a', revision: 'b', rating: 3, durationMs: -1 }]) assert.throws(() => validateReview(value), /invalid-request/);
});

test('review queue is bounded while the due count covers every scheduled card', () => {
  const { db, service, cards } = fixture();
  try {
    for (let index = 0; index < 55; index++) {
      const card = cards.save({ front: `Card ${index}`, back: '', sourceKind: 'term' });
      cards.setMemorizing(card.id, true);
    }
    db.prepare('UPDATE srs_state SET due_at=?').run('2026-11-02T11:00:00.000Z');
    assert.equal(service.queue().cards.length, 50);
    assert.equal(service.queue().due, 56);
  } finally { db.close(); }
});

test('daily review count rolls over without discarding review history', () => {
  const { db, service, advance } = fixture();
  try {
    const item = service.queue().cards[0];
    service.grade({ id: item.id, revision: item.revision, rating: 3, durationMs: 100 });
    advance('2026-11-04T12:00:00Z');
    assert.equal(service.queue().reviewedToday, 0);
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM srs_review_log').get() as { count: number }).count, 1);
  } finally { db.close(); }
});

// The review screen's interval labels come from these previews, so each must match what grading then schedules.
for (const rating of [1, 2, 3, 4] as const) test(`interval preview for rating ${rating} equals the scheduled due time`, () => {
  const { db, service } = fixture();
  try {
    const first = service.queue().cards[0];
    const preview = first.intervals?.[rating];
    assert.ok(preview && preview > 0, 'preview present');
    service.grade({ id: first.id, revision: first.revision, rating, durationMs: 10 });
    const due = Date.parse((db.prepare('SELECT due_at FROM srs_state').get() as { due_at: string }).due_at);
    assert.equal(Math.max(1, Math.round((due - Date.parse('2026-11-02T12:00:00Z')) / 60000)), preview);
  } finally { db.close(); }
});

test('previews grow with the rating', () => {
  const { db, service } = fixture();
  try {
    const intervals = service.queue().cards[0].intervals!;
    assert.ok(intervals[1]! <= intervals[2]! && intervals[2]! <= intervals[3]! && intervals[3]! <= intervals[4]!, JSON.stringify(intervals));
  } finally { db.close(); }
});
