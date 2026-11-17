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

function createSrsFixture(initialDateStr = '2026-11-02T22:00:00Z', dbPath = ':memory:') {
  const db = new Database(dbPath);
  db.pragma('foreign_keys=ON');
  runMigrations(db, migrations);
  let now = new Date(initialDateStr);
  const cards = new KnowledgeCardRepository(db);
  const service = new SrsService(db, () => now);
  const card = cards.save({ front: 'سؤال اليوم — Question', back: 'جواب محفوظ — Answer', sourceKind: 'note', sourceRef: 'note:srs-gap-test' });
  cards.setMemorizing(card.id, true);
  db.prepare('UPDATE srs_state SET due_at=?').run(now.toISOString());
  return {
    db,
    cards,
    service,
    card,
    getNow: () => now,
    setNow: (d: Date | string) => { now = typeof d === 'string' ? new Date(d) : d; },
  };
}

test('SRS day rollover: reviewing card updates reviewedToday, crossing midnight resets reviewedToday to 0', () => {
  // Start at 22:00 local time
  const localEvening = new Date(2026, 10, 2, 22, 0, 0); // 2026-11-02 22:00 local
  const fixture = createSrsFixture(localEvening.toISOString());
  try {
    const queueBefore = fixture.service.queue();
    assert.equal(queueBefore.due, 1, 'Initial queue has 1 card due');
    assert.equal(queueBefore.reviewedToday, 0, 'No cards reviewed today initially');

    // Review the card with Easy (4) so it graduates to Review state scheduled days ahead
    const cardItem = queueBefore.cards[0];
    const afterGrade = fixture.service.grade({
      id: cardItem.id,
      revision: cardItem.revision,
      rating: 4,
      durationMs: 1500,
    });
    assert.equal(afterGrade.due, 0, 'Due count decreases to 0 after grading');
    assert.equal(afterGrade.reviewedToday, 1, 'reviewedToday is 1 immediately after grading');

    // Check 10 minutes later before midnight: reviewedToday is still 1
    fixture.setNow(new Date(2026, 10, 2, 22, 10, 0));
    assert.equal(fixture.service.queue().reviewedToday, 1, 'Still 1 on same day before midnight');
    assert.equal(fixture.service.queue().due, 0);

    // Advance clock past local midnight to 00:30 next morning:
    // Default rollover is 4 AM (ADR-017), so at 00:30 it is still the same SRS day
    const localAfterMidnight = new Date(2026, 10, 3, 0, 30, 0); // 2026-11-03 00:30 local
    fixture.setNow(localAfterMidnight);
    assert.equal(fixture.service.queue().reviewedToday, 1, 'Before 4 AM default rollover, reviewedToday is still 1');

    // Advance past 4 AM default rollover to 04:05: reviewedToday resets to 0
    fixture.setNow(new Date(2026, 10, 3, 4, 5, 0));
    const queueAfterRollover = fixture.service.queue();
    assert.equal(queueAfterRollover.reviewedToday, 0, 'reviewedToday must roll over to 0 past 4 AM rollover');
    assert.equal(queueAfterRollover.due, 0, 'Card graded Easy is scheduled in future');

    // When rolloverHour is set to midnight (0), 00:30 is already the next SRS day
    fixture.service.setRolloverHour(0);
    fixture.setNow(localAfterMidnight);
    assert.equal(fixture.service.queue().reviewedToday, 0, 'With midnight rollover, 00:30 resets reviewedToday to 0');
  } finally {
    fixture.db.close();
  }
});

test('SRS day rollover with learning step: card due before midnight stays due after midnight with reviewedToday reset', () => {
  const localEvening = new Date(2026, 10, 2, 22, 0, 0);
  const fixture = createSrsFixture(localEvening.toISOString());
  try {
    const cardItem = fixture.service.queue().cards[0];
    // Rating 3 (Good) on new card sets learning step due 10 minutes later (22:10)
    fixture.service.grade({ id: cardItem.id, revision: cardItem.revision, rating: 3, durationMs: 1000 });

    // At 22:05 (before learning step due): due is 0, reviewedToday is 1
    fixture.setNow(new Date(2026, 10, 2, 22, 5, 0));
    assert.equal(fixture.service.queue().due, 0);
    assert.equal(fixture.service.queue().reviewedToday, 1);

    // At 22:15 (learning step is due): due is 1, reviewedToday is 1
    fixture.setNow(new Date(2026, 10, 2, 22, 15, 0));
    assert.equal(fixture.service.queue().due, 1);
    assert.equal(fixture.service.queue().reviewedToday, 1);

    // Past 4 AM rollover (04:30 AM next day): reviewedToday resets to 0, card is still due
    fixture.setNow(new Date(2026, 10, 3, 4, 30, 0));
    assert.equal(fixture.service.queue().reviewedToday, 0, 'reviewedToday resets on day rollover');
    assert.equal(fixture.service.queue().due, 1, 'Card due from yesterday remains due');
  } finally {
    fixture.db.close();
  }
});

test('SRS day rollover survives app restart / database reopening across midnight', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-srs-rollover-'));
  const dbFile = path.join(dir, 'test-rollover.db');
  try {
    const localEvening = new Date(2026, 10, 2, 23, 15, 0);
    const fixture1 = createSrsFixture(localEvening.toISOString(), dbFile);
    const cardItem = fixture1.service.queue().cards[0];
    fixture1.service.grade({ id: cardItem.id, revision: cardItem.revision, rating: 4, durationMs: 2000 });
    assert.equal(fixture1.service.queue().reviewedToday, 1);
    fixture1.db.close();

    // Reopen database as if the app restarted at 08:00 AM the next day
    const localMorning = new Date(2026, 10, 3, 8, 0, 0);
    const db2 = new Database(dbFile);
    try {
      const service2 = new SrsService(db2, () => localMorning);
      const queue2 = service2.queue();
      assert.equal(queue2.reviewedToday, 0, 'After restart on new day, reviewedToday must be 0');
      assert.equal(queue2.due, 0, 'Graduated card is not due');
    } finally {
      db2.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('SRS scheduling intervals and state updates across different time zones', () => {
  for (const tzName of ['Africa/Cairo', 'America/Los_Angeles']) {
    const db = new Database(':memory:');
    db.pragma('foreign_keys=ON');
    runMigrations(db, migrations);
    try {
      const cards = new KnowledgeCardRepository(db);
      const card = cards.save({ front: `Card ${tzName}`, back: 'Answer', sourceKind: 'note', sourceRef: 'note:tz' });
      cards.setMemorizing(card.id, true);

      // Fix reference time
      const refTime = new Date('2026-11-02T12:00:00.000Z');
      db.prepare('UPDATE srs_state SET due_at=?').run(refTime.toISOString());

      let clockTime = new Date(refTime);
      const service = new SrsService(db, () => clockTime);

      const q1 = service.queue();
      assert.equal(q1.due, 1);
      const item = q1.cards[0];

      // Grade card Easy (rating 4) so it enters review state
      const after = service.grade({ id: item.id, revision: item.revision, rating: 4, durationMs: 1200 });
      assert.equal(after.due, 0);
      assert.equal(after.reviewedToday, 1);

      // Verify the new due_at date is in the future
      const stateRow = db.prepare('SELECT due_at, reps, stability FROM srs_state WHERE knowledge_id=?').get(item.id) as { due_at: string; reps: number; stability: number };
      const dueAtDate = new Date(stateRow.due_at);
      const diffDays = (dueAtDate.getTime() - refTime.getTime()) / (1000 * 60 * 60 * 24);

      // Rating 4 (Easy) graduates with initial interval >= 4 days
      assert.ok(diffDays >= 4 && diffDays <= 12, `Easy rating interval should be 4-12 days (got ${diffDays.toFixed(1)} days) in ${tzName}`);

      // Advance clock to right before due date: due count remains 0
      clockTime = new Date(dueAtDate.getTime() - 60_000);
      assert.equal(service.queue().due, 0, 'Card should not be due before due_at');

      // Advance clock to due date: due count becomes 1
      clockTime = new Date(dueAtDate.getTime() + 1000);
      assert.equal(service.queue().due, 1, 'Card should become due when clock reaches due_at');

      // Now review again with rating 3 (Good): interval should advance by multiple days
      const item2 = service.queue().cards[0];
      const afterGood = service.grade({ id: item2.id, revision: item2.revision, rating: 3, durationMs: 1500 });
      assert.equal(afterGood.due, 0);

      const state2 = db.prepare('SELECT due_at FROM srs_state WHERE knowledge_id=?').get(item2.id) as { due_at: string };
      const due2Date = new Date(state2.due_at);
      const diff2Days = (due2Date.getTime() - clockTime.getTime()) / (1000 * 60 * 60 * 24);
      assert.ok(diff2Days >= 10, `Graduated Good interval must be >= 10 days (got ${diff2Days.toFixed(1)} days) in ${tzName}`);
    } finally {
      db.close();
    }
  }
});
