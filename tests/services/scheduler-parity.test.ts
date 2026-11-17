/**
 * Baglib — Scheduler Parity & Migration 031 Unit Tests (ADR-017 / KEY-389)
 *
 * Covers:
 * 1. Migration 031 up & down (deck move, shared cards across multiple decks, srs_state backfill,
 *    srs_review_log rebuild, rating-0 trigger, and rating-0 backup on down migration).
 * 2. Day rollover at 4 AM (default) versus midnight (0), including clearing burials.
 * 3. Learning and relearning steps from presets, desired retention, max interval, FSRS params validation.
 * 4. Daily New and Review limits per deck, including parent deck capping child decks.
 * 5. Sibling burying on the same note, and NO burying across different notes about the same ayah.
 * 6. Leech tagging at threshold and optional leech suspension.
 * 7. Filtered deck search parser and live evaluation for every search term.
 * 8. Filtered deck preview mode (`filterReschedule: false`) versus rescheduling mode (`filterReschedule: true`).
 * 9. Forget (`reset`, rating 0) and Set due date (`rescheduled`, rating 0) actions and history entries.
 * 10. Statistics rule across `StudyInsightsService`, `workspaceStatistics`, `StudyProgressService`, and `StudyPrerequisitesService`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import migration031 from '../../src/main/database/migrations/031_decks_and_scheduler';
import { runMigrations } from '../../src/main/database/migrator';
import { KnowledgeCardRepository } from '../../src/main/database/repositories/knowledge-card.repository';
import { CardNoteRepository } from '../../src/main/database/repositories/card-note.repository';
import { DeckRepository } from '../../src/main/database/repositories/deck.repository';
import { CardDeckService } from '../../src/main/services/card-decks';
import { SrsService } from '../../src/main/services/srs';
import { StudyInsightsService } from '../../src/main/services/statistics/study-insights.service';
import { workspaceStatistics } from '../../src/main/services/statistics/workspace-statistics.service';
import { StudyProgressService } from '../../src/main/services/statistics/study-progress.service';
import { StudyPrerequisitesService } from '../../src/main/services/study-prerequisites.service';

function createFixture(initialIso = '2026-11-17T10:00:00.000Z') {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  let now = new Date(initialIso);
  const cards = new KnowledgeCardRepository(db);
  const notes = new CardNoteRepository(db);
  const deckRepo = new DeckRepository(db);
  const cardDecks = new CardDeckService(db);
  const srs = new SrsService(db, () => now);
  return {
    db,
    cards,
    notes,
    deckRepo,
    cardDecks,
    srs,
    getNow: () => now,
    setNow: (d: Date | string) => {
      now = typeof d === 'string' ? new Date(d) : d;
    },
    advanceMinutes: (mins: number) => {
      now = new Date(now.getTime() + mins * 60_000);
    },
  };
}

test('1. Migration 031: moves collection decks, preserves shared cards, backfills srs_state, rebuilds srs_review_log, and down migration backs up rating-0 rows', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  // Run migrations 1..30 only
  const pre031 = migrations.filter(m => m.id < 31);
  runMigrations(db, pre031);

  try {
    // Seed pre-031 data: 3 cards, 2 decks in collection, card-shared in both decks, existing review history
    const nowIso = '2026-11-17T08:00:00.000Z';
    db.prepare(`
      INSERT INTO knowledge (id, knowledge_type, created_at, updated_at)
      VALUES
        ('card-shared', 'card', ?, ?),
        ('card-only-d1', 'card', ?, ?),
        ('card-only-d2', 'card', ?, ?)
    `).run(nowIso, nowIso, nowIso, nowIso, nowIso, nowIso);

    db.prepare(`
      INSERT INTO card_detail (knowledge_id, front, back, source_kind, source_ref, question_kind)
      VALUES
        ('card-shared', 'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ', 'آية الكرسي', 'quran', 'quran:hafs:2:255', 'recall'),
        ('card-only-d1', 'إنما الأعمال بالنيات', 'حديث ١', 'hadith', 'sunnah:Bukhari:1:1', 'recall'),
        ('card-only-d2', 'قفا نبك', 'معلقة امرئ القيس', 'poetry', 'poetry:1', 'recall')
    `).run();

    // Two decks in collection
    db.prepare(`
      INSERT INTO collection (id, name, description, collection_type)
      VALUES
        ('col-deck-1', 'مجموعة التفسير', 'Deck 1 desc', 'deck'),
        ('col-deck-2', 'مجموعة الحديث والأدب', 'Deck 2 desc', 'deck'),
        ('col-research', 'Research Pathway', 'Keep me', 'research')
    `).run();

    // Link card-shared into BOTH col-deck-1 and col-deck-2
    db.prepare(`
      INSERT INTO knowledge_collection (knowledge_id, collection_id)
      VALUES
        ('card-shared', 'col-deck-1'),
        ('card-shared', 'col-deck-2'),
        ('card-only-d1', 'col-deck-1'),
        ('card-only-d2', 'col-deck-2')
    `).run();

    // Only card-shared had an srs_state and review log before migration 031
    db.prepare(`
      INSERT INTO srs_state (knowledge_id, state, due_at, stability, difficulty, reps, lapses, last_review)
      VALUES ('card-shared', 'review', '2026-11-20T08:00:00.000Z', 5.5, 4.2, 2, 0, ?)
    `).run(nowIso);

    db.prepare(`
      INSERT INTO srs_review_log (id, knowledge_id, reviewed_at, rating, duration_ms, state_before)
      VALUES ('rev-pre-1', 'card-shared', ?, 3, 2500, '{"version":1}')
    `).run(nowIso);

    // Apply migration 031
    migration031.up(db);

    // Verify old deck collections removed, non-deck collection kept
    const remainingCols = db.prepare(`SELECT id, collection_type FROM collection`).all() as Array<{ id: string; collection_type: string }>;
    assert.deepEqual(remainingCols, [{ id: 'col-research', collection_type: 'research' }]);
    const remainingKc = db.prepare(`SELECT * FROM knowledge_collection`).all();
    assert.equal(remainingKc.length, 0);

    // Verify new decks exist
    const decks = db.prepare(`SELECT id, name, kind FROM deck WHERE id IN ('col-deck-1', 'col-deck-2') ORDER BY id`).all() as Array<{ id: string; name: string; kind: string }>;
    assert.deepEqual(decks, [
      { id: 'col-deck-1', name: 'مجموعة التفسير', kind: 'normal' },
      { id: 'col-deck-2', name: 'مجموعة الحديث والأدب', kind: 'normal' },
    ]);

    // Verify card-shared stayed shared in both decks
    const sharedDecks = db.prepare(`SELECT deck_id FROM deck_card WHERE knowledge_id = 'card-shared' ORDER BY deck_id`).all() as Array<{ deck_id: string }>;
    assert.deepEqual(sharedDecks.map(d => d.deck_id), ['col-deck-1', 'col-deck-2']);

    // Verify every card in a deck now has an srs_state row (card-only-d1 and card-only-d2 get 'new')
    const srsStates = db.prepare(`SELECT knowledge_id, state, reps FROM srs_state ORDER BY knowledge_id`).all() as Array<{ knowledge_id: string; state: string; reps: number }>;
    assert.deepEqual(srsStates, [
      { knowledge_id: 'card-only-d1', state: 'new', reps: 0 },
      { knowledge_id: 'card-only-d2', state: 'new', reps: 0 },
      { knowledge_id: 'card-shared', state: 'review', reps: 2 },
    ]);

    // Verify existing review log row preserved and set to entry_kind = 'review'
    const logRow = db.prepare(`SELECT id, rating, entry_kind FROM srs_review_log WHERE id = 'rev-pre-1'`).get() as { id: string; rating: number; entry_kind: string };
    assert.deepEqual(logRow, { id: 'rev-pre-1', rating: 3, entry_kind: 'review' });

    // Verify trigger: rating 0 is rejected for 'review', 'learn', 'relearn', 'filtered', but allowed for 'reset' and 'rescheduled'
    assert.throws(() => {
      db.prepare(`
        INSERT INTO srs_review_log (id, knowledge_id, reviewed_at, rating, entry_kind)
        VALUES ('bad-zero', 'card-shared', ?, 0, 'review')
      `).run(nowIso);
    }, /rating 0 is allowed only for reset and rescheduled/);

    db.prepare(`
      INSERT INTO srs_review_log (id, knowledge_id, reviewed_at, rating, entry_kind, interval)
      VALUES ('good-reset', 'card-shared', ?, 0, 'reset', 0)
    `).run(nowIso);

    // Run down migration and verify rating-0 row is preserved in srs_review_log_rating0_backup
    migration031.down(db);

    const backupZero = db.prepare(`SELECT id, rating, entry_kind FROM srs_review_log_rating0_backup`).all() as Array<{ id: string; rating: number; entry_kind: string }>;
    assert.deepEqual(backupZero, [{ id: 'good-reset', rating: 0, entry_kind: 'reset' }]);

    const restoredLogs = db.prepare(`SELECT id, rating FROM srs_review_log`).all() as Array<{ id: string; rating: number }>;
    assert.deepEqual(restoredLogs, [{ id: 'rev-pre-1', rating: 3 }]);

    // Verify decks restored to collection
    const restoredDecks = db.prepare(`SELECT id FROM collection WHERE collection_type = 'deck' ORDER BY id`).all() as Array<{ id: string }>;
    assert.deepEqual(restoredDecks.map(d => d.id), ['col-deck-1', 'col-deck-2']);
  } finally {
    db.close();
  }
});
test('2. Rollover at 4 AM versus midnight (0): reviewedToday, daily limits, and clearing burials', () => {
  const localNight = new Date(2026, 10, 17, 23, 0, 0); // 23:00 local
  const { db, cards, srs, setNow } = createFixture(localNight.toISOString());
  try {
    const c1 = cards.save({ front: 'Q1', back: 'A1', sourceKind: 'note' });
    const c2 = cards.save({ front: 'Q2', back: 'A2', sourceKind: 'note' });
    cards.setMemorizing(c1.id, true);
    cards.setMemorizing(c2.id, true);

    assert.equal(srs.getRolloverHour(), 4);

    // Grade c1 at 23:00 and bury c2 manually
    const q0 = srs.queue();
    assert.equal(q0.due, 2);
    srs.grade({ id: c1.id, revision: q0.cards.find(c => c.id === c1.id)!.revision, rating: 4, durationMs: 1000 });
    srs.buryCard(c2.id);

    // At 02:00 AM (past midnight, before 4 AM): still same day under 4 AM rollover!
    setNow(new Date(2026, 10, 18, 2, 0, 0));
    const qAt2Am = srs.queue();
    assert.equal(qAt2Am.reviewedToday, 1, 'At 2 AM, 4 AM rollover has not happened yet');
    assert.equal(qAt2Am.buriedCount, 1, 'c2 is still buried at 2 AM');
    assert.equal(qAt2Am.due, 0);

    // Switch rollover to midnight (0): at 02:00 AM, midnight has already passed!
    srs.setRolloverHour(0);
    const qAt2AmMidnight = srs.queue();
    assert.equal(qAt2AmMidnight.reviewedToday, 0, 'Under midnight rollover, 2 AM is a new day');
    assert.equal(qAt2AmMidnight.buriedCount, 0, 'Burial cleared past midnight rollover');
    assert.equal(qAt2AmMidnight.newCount, 1, 'c2 is unburied and in New queue');

    // Switch back to 4 AM and advance to 04:01 AM
    srs.setRolloverHour(4);
    srs.buryCard(c2.id);
    assert.equal(srs.queue().buriedCount, 1);
    setNow(new Date(2026, 10, 19, 4, 1, 0));
    assert.equal(srs.queue().buriedCount, 0, 'Burial cleared after 4 AM rollover');
  } finally {
    db.close();
  }
});
test('3. Preset validation and custom learning steps from the card deck preset', () => {
  const { db, deckRepo, cards, srs, advanceMinutes } = createFixture('2026-11-17T10:00:00.000Z');
  try {
    // Validation checks
    assert.throws(
      () => deckRepo.savePreset({ name: 'Too many steps', learnSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }),
      /at most 10 numbers/
    );
    assert.throws(
      () => deckRepo.savePreset({ name: 'Bad retention low', desiredRetention: 0.65 }),
      /between 0.7 and 0.99/
    );
    assert.throws(
      () => deckRepo.savePreset({ name: 'Bad retention high', desiredRetention: 0.995 }),
      /between 0.7 and 0.99/
    );
    assert.throws(
      () => deckRepo.savePreset({ name: 'Bad limit', newPerDay: 10000 }),
      /between 0 and 9999/
    );
    assert.throws(
      () => deckRepo.savePreset({ name: 'Bad fsrs params', fsrsParams: [1, 2, 3] }),
      /exactly 21 numbers/
    );
    assert.throws(() => deckRepo.deletePreset('default'), /Cannot delete the built-in Default preset/);

    // Valid custom preset with steps [2, 15] minutes
    const preset = deckRepo.savePreset({
      name: 'Custom Steps 2m 15m',
      learnSteps: [2, 15],
      relearnSteps: [20],
      newPerDay: 5,
      reviewsPerDay: 50,
      desiredRetention: 0.85,
    });

    const deck = deckRepo.createDeck({ name: 'Custom Deck', presetId: preset.id });
    const card = cards.save({ front: 'Step test front', back: 'Step test back', sourceKind: 'note' });
    deckRepo.addCardsToDeck(deck.id, [card.id], true);

    const q1 = srs.queue(deck.id);
    assert.equal(q1.newCount, 1);
    const item1 = q1.cards[0];
    // Rating 1 (Again) -> first learning step = 2 minutes
    assert.equal(item1.intervals?.[1], 2);
    // Rating 3 (Good) -> second learning step = 15 minutes
    assert.equal(item1.intervals?.[3], 15);

    // Grade Good (3): enters learning_step = 1, due in 15m
    const afterStep1 = srs.grade({
      id: item1.id,
      revision: item1.revision,
      rating: 3,
      durationMs: 1000,
      deckId: deck.id,
    });
    assert.equal(afterStep1.due, 0);

    const stateRow = db.prepare(`SELECT state, learning_step FROM srs_state WHERE knowledge_id = ?`).get(card.id) as {
      state: string;
      learning_step: number;
    };
    assert.equal(stateRow.state, 'learning');
    assert.equal(stateRow.learning_step, 1);

    // Advance 15 minutes: learning card comes back!
    advanceMinutes(15);
    const q2 = srs.queue(deck.id);
    assert.equal(q2.learningCount, 1);
    assert.equal(q2.cards[0].id, card.id);
  } finally {
    db.close();
  }
});
test('4. New and review daily limits per deck, including parent deck capping its children', () => {
  const { db, deckRepo, cards, srs } = createFixture('2026-11-17T10:00:00.000Z');
  try {
    const parentPreset = deckRepo.savePreset({
      name: 'Parent Cap 5 New / 4 Rev',
      newPerDay: 5,
      reviewsPerDay: 4,
    });
    const childPreset = deckRepo.savePreset({
      name: 'Child 10 New / 10 Rev',
      newPerDay: 10,
      reviewsPerDay: 10,
    });

    const parentDeck = deckRepo.createDeck({ name: 'Parent', presetId: parentPreset.id });
    const child1 = deckRepo.createDeck({ name: 'Child1', parentId: parentDeck.id, presetId: childPreset.id });
    const child2 = deckRepo.createDeck({ name: 'Child2', parentId: parentDeck.id, presetId: childPreset.id });

    // Add 8 new cards to Child1 and 8 new cards to Child2
    const c1Ids: string[] = [];
    const c2Ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      c1Ids.push(cards.save({ front: `C1 New ${i}`, back: 'B', sourceKind: 'note' }).id);
      c2Ids.push(cards.save({ front: `C2 New ${i}`, back: 'B', sourceKind: 'note' }).id);
    }
    deckRepo.addCardsToDeck(child1.id, c1Ids, true);
    deckRepo.addCardsToDeck(child2.id, c2Ids, true);

    // Even though Child1 has newPerDay=10 and 8 cards, Parent's newPerDay=5 caps Child1 and Parent to 5!
    assert.equal(srs.queue(parentDeck.id).newCount, 5);
    assert.equal(srs.queue(child1.id).newCount, 5);

    // Grade 3 new cards in Child1
    for (let i = 0; i < 3; i++) {
      const q = srs.queue(child1.id);
      const top = q.cards.find(c => c.state === 'new')!;
      srs.grade({ id: top.id, revision: top.revision, rating: 4, durationMs: 500, deckId: child1.id });
    }

    // Now 3 new cards have been done in Parent's subtree today -> only 2 new cards remain for Child1 or Child2!
    assert.equal(srs.queue(parentDeck.id).newCount, 2);
    assert.equal(srs.queue(child2.id).newCount, 2);
  } finally {
    db.close();
  }
});
test('5. Sibling burying on the same note, and NO burying across different notes about the same ayah', () => {
  const { db, deckRepo, notes, srs } = createFixture('2026-11-17T10:00:00.000Z');
  try {
    const buryPreset = deckRepo.savePreset({
      name: 'Bury Siblings Preset',
      buryNew: true,
      buryReviews: true,
      buryInterday: true,
    });
    const deck = deckRepo.createDeck({ name: 'Ayah Study', presetId: buryPreset.id });

    // Note 1: Reversed note about Ayah 2:255 (generates 2 sibling cards sharing note1.id)
    const note1Res = notes.saveNote({
      noteTypeId: 'stock-basic-reversed',
      fields: { Front: 'آية الكرسي ٢:٢٥٥', Back: 'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ' },
      sourceRef: 'quran:hafs:2:255',
      deckId: deck.id,
    });
    assert.equal(note1Res.cards.length, 2);

    // Note 2: Separate note about the EXACT SAME ayah 2:255 (different note_id, same source_ref)
    const note2Res = notes.saveNote({
      noteTypeId: 'stock-basic',
      fields: { Front: 'ما أعظم آية في كتاب الله؟', Back: 'آية الكرسي (البقرة ٢٥٥)' },
      sourceRef: 'quran:hafs:2:255',
      deckId: deck.id,
    });
    assert.equal(note2Res.cards.length, 1);

    // Initially all 3 cards are in the New queue
    const qBefore = srs.queue(deck.id);
    assert.equal(qBefore.newCount, 3);

    // Answer Card 1 (ord 0) of Note 1
    const firstCard = qBefore.cards.find(c => c.id === note1Res.cards[0].id)!;
    const qAfter = srs.grade({
      id: firstCard.id,
      revision: firstCard.revision,
      rating: 4,
      durationMs: 1000,
      deckId: deck.id,
    });

    // Sibling Card 2 (ord 1) of Note 1 MUST be buried!
    const siblingState = db
      .prepare(`SELECT buried_until FROM srs_state WHERE knowledge_id = ?`)
      .get(note1Res.cards[1].id) as { buried_until: string | null };
    assert.ok(siblingState.buried_until, 'Sibling of the same note must be buried');

    // Note 2's card about the same ayah MUST NOT be buried!
    const otherNoteState = db
      .prepare(`SELECT buried_until FROM srs_state WHERE knowledge_id = ?`)
      .get(note2Res.cards[0].id) as { buried_until: string | null };
    assert.equal(otherNoteState.buried_until, null, 'Different note about the same ayah must NEVER be buried');

    // Queue now has 1 new card (Note 2's card) and 1 buried card (Note 1's sibling)
    assert.equal(qAfter.newCount, 1);
    assert.equal(qAfter.buriedCount, 1);
    assert.equal(qAfter.cards[0].id, note2Res.cards[0].id);
  } finally {
    db.close();
  }
});
test('6. Leeches: tags card with leech at threshold and suspends when leech_action is suspend', () => {
  const { db, deckRepo, cards, srs } = createFixture('2026-11-17T10:00:00.000Z');
  try {
    const presetTag = deckRepo.savePreset({
      name: 'Leech Tag At 3',
      leechThreshold: 3,
      leechAction: 'tag',
    });
    const deck = deckRepo.createDeck({ name: 'Leech Deck', presetId: presetTag.id });
    const card = cards.save({ front: 'Hard card', back: 'Answer', sourceKind: 'note' });
    deckRepo.addCardsToDeck(deck.id, [card.id], true);

    // Put card in review state with 2 lapses already, due now
    db.prepare(
      `UPDATE srs_state SET state = 'review', reps = 5, lapses = 2, stability = 5, difficulty = 7,
       due_at = '2026-11-17T09:00:00.000Z', last_review = '2026-11-10T09:00:00.000Z'
       WHERE knowledge_id = ?`
    ).run(card.id);

    const q = srs.queue(deck.id);
    const afterLapse = srs.grade({
      id: card.id,
      revision: q.cards[0].revision,
      rating: 1, // Again -> lapses becomes 3!
      durationMs: 1000,
      deckId: deck.id,
    });

    assert.ok(afterLapse.leechAlert);
    assert.equal(afterLapse.leechAlert?.cardId, card.id);
    assert.equal(afterLapse.leechAlert?.lapses, 3);
    assert.equal(afterLapse.leechAlert?.suspended, false);

    // Verify 'leech' tag was attached in knowledge_tag
    const tagRow = db
      .prepare(
        `SELECT t.name FROM knowledge_tag kt JOIN tag t ON t.id = kt.tag_id WHERE kt.knowledge_id = ?`
      )
      .get(card.id) as { name: string } | undefined;
    assert.equal(tagRow?.name, 'leech');

    // Now test leech_action = 'suspend'
    deckRepo.savePreset({
      id: presetTag.id,
      name: 'Leech Suspend At 4',
      leechThreshold: 4,
      leechAction: 'suspend',
    });
    db.prepare(
      `UPDATE srs_state SET state = 'review', due_at = '2026-11-17T09:00:00.000Z' WHERE knowledge_id = ?`
    ).run(card.id);

    const q2 = srs.queue(deck.id);
    const afterSuspend = srs.grade({
      id: card.id,
      revision: q2.cards[0].revision,
      rating: 1, // lapses becomes 4 -> suspend!
      durationMs: 1000,
      deckId: deck.id,
    });
    assert.equal(afterSuspend.leechAlert?.suspended, true);
    const stateAfter = db.prepare(`SELECT state FROM srs_state WHERE knowledge_id = ?`).get(card.id) as {
      state: string;
    };
    assert.equal(stateAfter.state, 'suspended');
  } finally {
    db.close();
  }
});
test('7 & 8. Filtered decks: all search terms and preview mode (filter_reschedule off vs on)', () => {
  const { db, deckRepo, cards, notes, srs } = createFixture('2026-11-17T10:00:00.000Z');
  try {
    const sunnahDeck = deckRepo.createDeck({ name: 'SunnahMaster' });
    const quranDeck = deckRepo.createDeck({ name: 'QuranMaster' });

    const cHadithDue = cards.save({ front: 'Hadith 1', back: 'Matn 1', sourceKind: 'hadith' });
    const cQuranNew = cards.save({ front: 'Ayah 1', back: 'Text 1', sourceKind: 'quran' });
    const cLearn = cards.save({ front: 'Learn 1', back: 'Back 1', sourceKind: 'book' });
    const cSuspended = cards.save({ front: 'Susp 1', back: 'Back S', sourceKind: 'note' });
    const cBuried = cards.save({ front: 'Buried 1', back: 'Back B', sourceKind: 'poetry' });

    deckRepo.addCardsToDeck(sunnahDeck.id, [cHadithDue.id], true);
    deckRepo.addCardsToDeck(quranDeck.id, [cQuranNew.id, cLearn.id, cSuspended.id, cBuried.id], true);

    // Add tag 'important' to cHadithDue
    const { cards: taggedCards } = notes.saveNote({
      noteTypeId: 'stock-basic',
      fields: { Front: 'Tagged card', Back: 'Tagged back' },
      tags: ['fiqh-priority'],
      deckId: sunnahDeck.id,
    });

    // Configure states for testing every filter term:
    // cHadithDue: review, due, lapsed (lapses=2), low retrievability (stability=2, last_review 10 days ago => r < 0.85), difficulty=8.5
    db.prepare(
      `UPDATE srs_state SET
        state = 'review', due_at = '2026-11-16T10:00:00.000Z',
        stability = 2.0, difficulty = 8.5, reps = 4, lapses = 2,
        last_review = '2026-11-01T10:00:00.000Z'
       WHERE knowledge_id = ?`
    ).run(cHadithDue.id);

    // cLearn: learning
    db.prepare(
      `UPDATE srs_state SET state = 'learning', due_at = '2026-11-17T09:50:00.000Z' WHERE knowledge_id = ?`
    ).run(cLearn.id);

    // cSuspended: suspended
    srs.suspendCard(cSuspended.id, true);

    // cBuried: buried
    srs.buryCard(cBuried.id);

    const checkFilter = (search: string): string[] => {
      const fd = deckRepo.createFilteredDeck({
        name: `Filter ${ randomUUID() }`,
        filterSearch: search,
        filterReschedule: false,
      });
      return srs.queue(fd.id).cards.map(c => c.id);
    };

    assert.ok(checkFilter('is:due').includes(cHadithDue.id));
    assert.ok(checkFilter('is:due').includes(cLearn.id));
    assert.ok(checkFilter('is:new').includes(cQuranNew.id));
    assert.deepEqual(checkFilter('is:learn'), [cLearn.id]);
    assert.deepEqual(checkFilter('is:review'), [cHadithDue.id]);
    assert.deepEqual(checkFilter('is:suspended'), [cSuspended.id]);
    assert.deepEqual(checkFilter('is:buried'), [cBuried.id]);
    assert.deepEqual(checkFilter('is:lapsed'), [cHadithDue.id]);
    assert.deepEqual(checkFilter('prop:r<0.85'), [cHadithDue.id]);
    assert.deepEqual(checkFilter('prop:d>7'), [cHadithDue.id]);
    assert.ok(checkFilter('deck:"SunnahMaster"').includes(cHadithDue.id));
    assert.deepEqual(checkFilter('tag:fiqh-priority'), [taggedCards[0].id]);
    assert.deepEqual(checkFilter('source:hadith AND is:lapsed'), [cHadithDue.id]);
    assert.deepEqual(checkFilter('source:sunnah prop:r<0.85'), [cHadithDue.id]);
    assert.deepEqual(checkFilter('source:quran is:new'), [cQuranNew.id]);

    // Test Preview Mode (filterReschedule = false): grading does NOT alter srs_state
    const previewDeck = deckRepo.createFilteredDeck({
      name: 'Preview Weakest',
      filterSearch: 'prop:r<0.85',
      filterReschedule: false,
    });
    const beforeState = db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(cHadithDue.id);
    const qPreview = srs.queue(previewDeck.id);
    assert.equal(qPreview.cards.length, 1);

    const qAfterPreview = srs.grade({
      id: cHadithDue.id,
      revision: qPreview.cards[0].revision,
      rating: 4,
      durationMs: 800,
      deckId: previewDeck.id,
    });
    const afterState = db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(cHadithDue.id);
    assert.deepEqual(afterState, beforeState, 'Preview mode must not alter srs_state');
    assert.equal(qAfterPreview.cards.length, 0, 'Previewed card leaves the active filtered run');

    const filteredLog = db
      .prepare(`SELECT entry_kind, rating FROM srs_review_log WHERE knowledge_id = ? ORDER BY rowid DESC LIMIT 1`)
      .get(cHadithDue.id) as { entry_kind: string; rating: number };
    assert.deepEqual(filteredLog, { entry_kind: 'filtered', rating: 4 });
  } finally {
    db.close();
  }
});
test('9 & 10. Forget and Set due date write rating-0 rows, and all 4 statistics services exclude them', () => {
  const { db, cards, srs } = createFixture('2026-11-17T10:00:00.000Z');
  try {
    db.prepare(`INSERT INTO category (id, name_ar, name_en) VALUES ('cat-1', 'فقه', 'Fiqh')`).run();
    db.prepare(`INSERT INTO work (id, title, primary_category_id) VALUES ('book-1', 'Fiqh Book', 'cat-1')`).run();

    const card = cards.save({
      front: 'Fiqh question',
      back: 'Fiqh answer',
      sourceKind: 'book',
      sourceRef: 'book:book-1#p=1',
      workId: 'book-1',
    });
    cards.setMemorizing(card.id, true);

    // 1 real review
    const q1 = srs.queue();
    srs.grade({ id: card.id, revision: q1.cards[0].revision, rating: 3, durationMs: 5000 });

    // Forget card -> writes entry_kind='reset', rating=0, puts card back in 'new'
    const qAfterForget = srs.forgetCard(card.id);
    assert.equal(qAfterForget.newCount, 1);
    assert.equal(qAfterForget.cards[0].id, card.id);
    assert.equal(qAfterForget.cards[0].state, 'new');

    // Set due date to 5 days from today -> writes entry_kind='rescheduled', rating=0
    const qAfterSetDue = srs.setDueDate(card.id, 5);
    assert.equal(qAfterSetDue.newCount, 0);
    assert.equal(qAfterSetDue.due, 0);

    const logEntries = db
      .prepare(`SELECT entry_kind, rating, interval FROM srs_review_log WHERE knowledge_id = ? ORDER BY rowid ASC`)
      .all(card.id) as Array<{ entry_kind: string; rating: number; interval: number }>;
    assert.equal(logEntries.length, 3);
    assert.equal(logEntries[0].entry_kind, 'learn');
    assert.equal(logEntries[0].rating, 3);
    assert.deepEqual(logEntries[1], { entry_kind: 'reset', rating: 0, interval: 0 });
    assert.deepEqual(logEntries[2], { entry_kind: 'rescheduled', rating: 0, interval: 5 });

    // Verify SrsService.reviewedToday counts only the 1 real review
    assert.equal(qAfterSetDue.reviewedToday, 1);

    // Verify 1: workspaceStatistics counts only 1 review
    const wsStats = workspaceStatistics(db);
    assert.equal(wsStats.reviews.reduce((sum, r) => sum + r.total, 0), 1);

    // Verify 2: StudyInsightsService counts only the 1 real review
    const insights = new StudyInsightsService(db);
    const rhythm = insights.rhythmDailyActivity(7);
    assert.equal(rhythm.reduce((sum, d) => sum + d.srsReviewsCount, 0), 1);

    // Verify 3 & 4: StudyProgressService and StudyPrerequisitesService ignore reset/rescheduled rows on an unreviewed card
    const unreviewedCard = cards.save({
      front: 'Unreviewed Q',
      back: 'Unreviewed A',
      sourceKind: 'book',
      sourceRef: 'book:book-1#p=2',
      sourceLabel: 'Intro',
      workId: 'book-1',
    });
    cards.setMemorizing(unreviewedCard.id, true);
    srs.forgetCard(unreviewedCard.id); // writes a rating-0 reset row, reps=0

    const progressSvc = new StudyProgressService(db, () => new Date('2026-11-17T10:00:00.000Z'));
    const bookProg = progressSvc.getProgress('book', 'book-1')!;
    // card has 1 real review (selfRatedCardsCount = 1), unreviewedCard has only a rating-0 reset (not counted as self-rated)
    assert.equal(bookProg.demonstratedKnowledge.selfRatedCardsCount, 1);

    const prereqSvc = new StudyPrerequisitesService(db);
    const secStats = prereqSvc.getSectionStats('none', 'Intro');
    assert.equal(secStats.lapsesCount, 0);
  } finally {
    db.close();
  }
});
test('11. Deck tree operations: rename, move, cycle prevention, delete confirmation, and Parent::Child Anki text export', () => {
  const { db, deckRepo, cardDecks, cards } = createFixture('2026-11-17T10:00:00.000Z');
  try {
    const parent = deckRepo.createDeck({ name: 'العقيدة' });
    const child = deckRepo.createDeck({ name: 'التوحيد', parentId: parent.id });
    assert.equal(child.fullName, 'العقيدة::التوحيد');

    // Cycle check: cannot move parent under child
    assert.throws(() => deckRepo.moveDeck(parent.id, child.id), /cannot move a deck into its own descendant/);

    // Add a card to child deck
    const card = cards.save({ front: 'توحيد الإلهية', back: 'إفراد الله بالعبادة', sourceKind: 'note' });
    deckRepo.addCardsToDeck(child.id, [card.id], true);

    // Export Anki text uses Parent::Child
    const exported = cardDecks.exportText(child.id);
    assert.equal(exported.name, 'العقيدة::التوحيد');
    assert.ok(exported.text.includes('#deck:العقيدة::التوحيد'));

    // Deleting deck with cards is refused unless confirmed
    assert.throws(() => deckRepo.deleteDeck(child.id, false), /deck-has-cards/);
    assert.throws(() => deckRepo.deleteDeck(parent.id, false), /deck-has-cards/);

    // Confirming deletion succeeds
    assert.equal(deckRepo.deleteDeck(parent.id, true), true);
    assert.equal(deckRepo.getDeck(child.id), null);
  } finally {
    db.close();
  }
});
