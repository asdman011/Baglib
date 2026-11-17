/**
 * Baglib — KEY-407 revision polish tests.
 *
 * 1. Migration 031 never merges decks that share a name (nor a deck named like the built-in Memorization deck).
 * 2. A rescheduling filtered deck logs learn/review/relearn; only preview mode logs `filtered`.
 * 3. `bury_interday` buries interday learning siblings only, never intraday ones.
 * 4. Migration 032 rewrites the stock note types' hard-coded white/black CSS and leaves custom types alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { KnowledgeCardRepository } from '../../src/main/database/repositories/knowledge-card.repository';
import { CardNoteRepository } from '../../src/main/database/repositories/card-note.repository';
import { DeckRepository } from '../../src/main/database/repositories/deck.repository';
import { SrsService } from '../../src/main/services/srs';
import { noteFieldLabel, noteTypeLabel } from '../../src/renderer/components/knowledge/note-type-labels';
import { translations, type TranslationKey } from '../../src/renderer/translations';

function fixture(iso = '2026-11-17T10:00:00.000Z') {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  let now = new Date(iso);
  return {
    db,
    cards: new KnowledgeCardRepository(db),
    notes: new CardNoteRepository(db),
    deckRepo: new DeckRepository(db),
    srs: new SrsService(db, () => now),
    setNow: (next: string) => {
      now = new Date(next);
    },
  };
}

test('KEY-407: migration 031 keeps same-named decks apart and never merges into the built-in Memorization deck', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations.filter(m => m.id < 31));
  try {
    const iso = '2026-11-17T08:00:00.000Z';
    for (const id of ['k1', 'k2', 'k3']) {
      db.prepare(`INSERT INTO knowledge (id, knowledge_type, created_at, updated_at) VALUES (?, 'card', ?, ?)`).run(id, iso, iso);
      db.prepare(
        `INSERT INTO card_detail (knowledge_id, front, back, source_kind, question_kind) VALUES (?, ?, 'b', 'note', 'recall')`
      ).run(id, `front ${id}`);
    }
    db.prepare(
      `INSERT INTO collection (id, name, collection_type) VALUES
        ('c1', 'تفسير', 'deck'), ('c2', 'تفسير', 'deck'), ('c3', 'Memorization', 'deck')`
    ).run();
    db.prepare(
      `INSERT INTO knowledge_collection (knowledge_id, collection_id) VALUES ('k1', 'c1'), ('k2', 'c2'), ('k3', 'c3')`
    ).run();

    runMigrations(db, migrations.filter(m => m.id <= 31));

    const decks = db.prepare(`SELECT id, name FROM deck WHERE parent_id IS NULL ORDER BY name`).all() as Array<{
      id: string;
      name: string;
    }>;
    const byId = new Map(decks.map(d => [d.id, d.name]));
    assert.equal(byId.get('c1'), 'تفسير');
    assert.equal(byId.get('c2'), 'تفسير (2)');
    assert.equal(byId.get('c3'), 'Memorization (2)');
    assert.equal(byId.get('memorization'), 'Memorization');

    const members = (deckId: string) =>
      (db.prepare(`SELECT knowledge_id FROM deck_card WHERE deck_id = ?`).all(deckId) as Array<{ knowledge_id: string }>).map(
        r => r.knowledge_id
      );
    assert.deepEqual(members('c1'), ['k1']);
    assert.deepEqual(members('c2'), ['k2']);
    assert.deepEqual(members('c3'), ['k3']);
    assert.deepEqual(members('memorization'), [], 'old cards must not land in the built-in deck through a name clash');
  } finally {
    db.close();
  }
});

test('KEY-407: a rescheduling filtered deck logs normal kinds and counts toward limits; preview logs filtered', () => {
  const { db, cards, deckRepo, srs } = fixture();
  try {
    const home = deckRepo.createDeck({ name: 'Home' });
    const a = cards.save({ front: 'A', back: 'a', sourceKind: 'hadith' });
    const b = cards.save({ front: 'B', back: 'b', sourceKind: 'hadith' });
    deckRepo.addCardsToDeck(home.id, [a.id, b.id], true);
    db.prepare(
      `UPDATE srs_state SET state = 'review', due_at = '2026-11-16T10:00:00.000Z', stability = 5, difficulty = 5,
         reps = 3, last_review = '2026-11-11T10:00:00.000Z' WHERE knowledge_id IN (?, ?)`
    ).run(a.id, b.id);

    const resched = deckRepo.createFilteredDeck({ name: 'Due hadith', filterSearch: 'is:due', filterReschedule: true });
    const q = srs.queue(resched.id);
    const cardA = q.cards.find(c => c.id === a.id)!;
    srs.grade({ id: a.id, revision: cardA.revision, rating: 3, durationMs: 500, deckId: resched.id });
    const kindA = db
      .prepare(`SELECT entry_kind FROM srs_review_log WHERE knowledge_id = ? ORDER BY rowid DESC LIMIT 1`)
      .get(a.id) as { entry_kind: string };
    assert.equal(kindA.entry_kind, 'review');
    const stateA = db.prepare(`SELECT state, due_at FROM srs_state WHERE knowledge_id = ?`).get(a.id) as {
      state: string;
      due_at: string;
    };
    assert.ok(stateA.due_at > '2026-11-17T10:00:00.000Z', 'rescheduling deck moves the due date');
    assert.equal(srs.queue(home.id).reviewedToday, 1, 'the answer counts as a real review today');

    const preview = deckRepo.createFilteredDeck({ name: 'Preview', filterSearch: 'is:due', filterReschedule: false });
    const qp = srs.queue(preview.id);
    const cardB = qp.cards.find(c => c.id === b.id)!;
    srs.grade({ id: b.id, revision: cardB.revision, rating: 3, durationMs: 500, deckId: preview.id });
    const kindB = db
      .prepare(`SELECT entry_kind FROM srs_review_log WHERE knowledge_id = ? ORDER BY rowid DESC LIMIT 1`)
      .get(b.id) as { entry_kind: string };
    assert.equal(kindB.entry_kind, 'filtered');
  } finally {
    db.close();
  }
});

test('KEY-407: bury_interday buries interday learning siblings only, never intraday ones', () => {
  const { db, deckRepo, notes, srs } = fixture();
  try {
    const preset = deckRepo.savePreset({ name: 'Interday only', buryNew: false, buryReviews: false, buryInterday: true });
    const deck = deckRepo.createDeck({ name: 'Learning deck', presetId: preset.id });
    const res = notes.saveNote({
      noteTypeId: 'stock-basic-optional-reversed',
      fields: { Front: 'س', Back: 'ج', 'Add Reverse': 'y' },
      deckId: deck.id,
    });
    assert.equal(res.cards.length, 2);
    const [first, sibling] = res.cards;
    const setLearning = (dueIso: string) =>
      db
        .prepare(
          `UPDATE srs_state SET state = 'learning', due_at = ?, stability = 1, difficulty = 5, reps = 1,
             last_review = '2026-11-17T09:00:00.000Z', buried_until = NULL WHERE knowledge_id = ?`
        )
        .run(dueIso, sibling.id);
    const buried = () =>
      (db.prepare(`SELECT buried_until FROM srs_state WHERE knowledge_id = ?`).get(sibling.id) as { buried_until: string | null })
        .buried_until;

    // Intraday learning sibling (due in 10 minutes): never buried.
    setLearning('2026-11-17T10:10:00.000Z');
    let q = srs.queue(deck.id);
    let card = q.cards.find(c => c.id === first.id)!;
    srs.grade({ id: first.id, revision: card.revision, rating: 3, durationMs: 400, deckId: deck.id });
    assert.equal(buried(), null, 'an intraday learning sibling must not be buried');

    // Interday learning sibling (next step in 3 days): buried until the next rollover.
    db.prepare(`UPDATE srs_state SET state = 'new', due_at = '2026-11-17T09:00:00.000Z', reps = 0, last_review = NULL,
      stability = NULL, difficulty = NULL, learning_step = 0 WHERE knowledge_id = ?`).run(first.id);
    setLearning('2026-11-20T10:00:00.000Z');
    q = srs.queue(deck.id);
    card = q.cards.find(c => c.id === first.id)!;
    srs.grade({ id: first.id, revision: card.revision, rating: 3, durationMs: 400, deckId: deck.id });
    assert.ok(buried(), 'an interday learning sibling is buried when bury_interday is on');
  } finally {
    db.close();
  }
});

test('KEY-407: migration 032 rewrites stock CSS to theme variables and leaves custom note types alone', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations.filter(m => m.id <= 31));
  try {
    const old = '.card { font-size: 20px; color: black; background-color: white; }\n.cloze { font-weight: bold; color: blue; }';
    db.prepare(`UPDATE card_note_type SET css = ? WHERE id = 'stock-cloze'`).run(old);
    db.prepare(
      `INSERT INTO card_note_type (id, name, kind, css, created_at, updated_at)
       VALUES ('custom-1', 'Mine', 'normal', ?, '2026-11-17', '2026-11-17')`
    ).run(old);

    runMigrations(db, migrations);

    const css = (id: string) => (db.prepare(`SELECT css FROM card_note_type WHERE id = ?`).get(id) as { css: string }).css;
    assert.equal(
      css('stock-cloze'),
      '.card { font-size: 20px; color: var(--fg, black); background-color: transparent; }\n.cloze { font-weight: bold; color: var(--cloze, blue); }'
    );
    assert.equal(css('custom-1'), old, 'custom note types keep their own colours');
    const anyWhite = db
      .prepare(`SELECT COUNT(*) AS n FROM card_note_type WHERE id LIKE 'stock-%' AND css LIKE '%background-color: white%'`)
      .get() as { n: number };
    assert.equal(anyWhite.n, 0);
  } finally {
    db.close();
  }
});

test('KEY-407: built-in note type and field labels are localised; user names are shown as written', () => {
  const t = (lang: 'ar' | 'en') => (key: TranslationKey) => translations[lang][key];
  assert.equal(noteTypeLabel({ id: 'stock-basic', name: 'Basic' }, t('ar')), 'أساسية');
  assert.equal(noteTypeLabel({ id: 'stock-basic', name: 'Basic' }, t('en')), 'Basic');
  assert.equal(noteTypeLabel({ id: 'stock-quran', name: 'Quran' }, t('ar')), 'القرآن الكريم');
  assert.equal(noteTypeLabel({ id: 'stock-basic', name: 'بطاقتي' }, t('ar')), 'بطاقتي', 'a renamed built-in shows its new name');
  assert.equal(noteTypeLabel({ id: 'custom-1', name: 'Basic' }, t('ar')), 'Basic', 'user types are never translated');
  assert.equal(noteFieldLabel({ id: 'stock-basic' }, 'Front', t('ar')), 'الوجه الأمامي');
  assert.equal(noteFieldLabel({ id: 'stock-hadith' }, 'Sharh', t('ar')), 'الشرح');
  assert.equal(noteFieldLabel({ id: 'custom-1' }, 'Front', t('ar')), 'Front');
  assert.equal(noteFieldLabel({ id: 'stock-basic' }, 'Extra', t('ar')), 'Extra');
});
