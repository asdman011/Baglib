/**
 * KEY-393 live source-to-deck sync: add, edit (FSRS untouched), delete (orphan), restore,
 * user edits kept, copies flagged, shared cards across decks, and resolving flags.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { DeckRepository } from '../../src/main/database/repositories/deck.repository';
import { CardNoteRepository } from '../../src/main/database/repositories/card-note.repository';
import { SrsService } from '../../src/main/services/srs';
import { DeckSyncService } from '../../src/main/services/deck-sync';

function fixture() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  let now = new Date('2026-11-18T09:00:00.000Z');
  const clock = () => now;
  db.prepare(`INSERT INTO work (id, title) VALUES ('w1', 'مقدمة ابن خلدون')`).run();
  const annotate = (id: string, text: string, note: string | null = null, type = 'highlight') =>
    db
      .prepare(
        `INSERT INTO annotations (id, book_id, type, location_cfi_or_page, selected_text, note_content, created_at, updated_at)
         VALUES (?, 'w1', ?, '12', ?, ?, ?, ?)`
      )
      .run(id, type, text, note, now.toISOString(), now.toISOString());
  const edit = (id: string, text: string) => db.prepare(`UPDATE annotations SET selected_text = ? WHERE id = ?`).run(text, id);
  const remove = (id: string) => db.prepare(`DELETE FROM annotations WHERE id = ?`).run(id);
  const decks = new DeckRepository(db);
  const sync = new DeckSyncService(db, clock);
  const srs = new SrsService(db, clock);
  const noteFor = (annotationId: string) =>
    db.prepare(`SELECT * FROM card_note WHERE source_ref = ?`).get(`book-highlight:w1/${annotationId}`) as Record<string, string | null>;
  const cardsOf = (noteId: string) =>
    (db.prepare(`SELECT knowledge_id FROM card_detail WHERE note_id = ?`).all(noteId) as Array<{ knowledge_id: string }>).map(r => r.knowledge_id);
  return {
    db,
    annotate,
    edit,
    remove,
    decks,
    sync,
    srs,
    noteFor,
    cardsOf,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

const noYield = () => Promise.resolve();

test('new highlights join the subscribed deck as new cards', async () => {
  const f = fixture();
  try {
    f.annotate('a1', 'إن الاجتماع الإنساني ضروري');
    const deck = f.decks.createDeck({ name: 'خلدونيات' });
    const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'book_highlights', sourceRef: 'w1' });
    let r = await f.sync.sync(sub.id, noYield);
    assert.equal(r.added, 1);
    f.annotate('a2', 'الظلم مؤذن بخراب العمران', 'فصل مهم');
    r = await f.sync.sync(sub.id, noYield);
    assert.equal(r.added, 1);
    assert.equal(r.unchanged, 1);
    const q = f.srs.queue(deck.id);
    assert.equal(q.newCount, 2, 'both cards are due as new cards in the deck');
    const note = f.noteFor('a2');
    const fields = JSON.parse(note.fields_json!);
    assert.equal(fields.Front, 'الظلم مؤذن بخراب العمران');
    assert.match(fields.Back, /فصل مهم<br><br>— مقدمة ابن خلدون/u);
    assert.ok(f.sync.get(sub.id)!.lastSyncedAt);
  } finally {
    f.db.close();
  }
});

test('an edited highlight updates the card in place; FSRS state and review history are untouched', async () => {
  const f = fixture();
  try {
    f.annotate('a1', 'نص قديم');
    const deck = f.decks.createDeck({ name: 'D' });
    const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'book_highlights', sourceRef: 'w1' });
    await f.sync.sync(sub.id, noYield);
    const [cardId] = f.cardsOf(f.noteFor('a1').id!);
    const card = f.srs.queue(deck.id).cards[0];
    f.srs.grade({ id: card.id, revision: card.revision, rating: 3, durationMs: 1000, deckId: deck.id });
    const stateBefore = f.db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(cardId);
    const logBefore = f.db.prepare(`SELECT COUNT(*) AS n FROM srs_review_log WHERE knowledge_id = ?`).get(cardId);

    f.edit('a1', 'نص جديد مصحح');
    const r = await f.sync.sync(sub.id, noYield);
    assert.equal(r.updated, 1);
    assert.equal(JSON.parse(f.noteFor('a1').fields_json!).Front, 'نص جديد مصحح');
    const front = (f.db.prepare(`SELECT front FROM card_detail WHERE knowledge_id = ?`).get(cardId) as { front: string }).front;
    assert.match(front, /نص جديد مصحح/u, 'the card cache is re-rendered');
    assert.deepEqual(f.db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(cardId), stateBefore, 'FSRS state unchanged');
    assert.deepEqual(f.db.prepare(`SELECT COUNT(*) AS n FROM srs_review_log WHERE knowledge_id = ?`).get(cardId), logBefore, 'no review rows added or reset');
    const versions = f.db.prepare(`SELECT COUNT(*) AS n FROM entity_version WHERE entity_type = 'knowledge' AND entity_id = ?`).get(cardId) as { n: number };
    assert.ok(versions.n >= 2, 'version history records the edit (ADR-008)');
  } finally {
    f.db.close();
  }
});

test('a deleted highlight orphans and suspends its card; restoring it brings the card back as it was', async () => {
  const f = fixture();
  try {
    f.annotate('a1', 'يبقى');
    f.annotate('a2', 'يحذف');
    const deck = f.decks.createDeck({ name: 'D' });
    const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'book_highlights', sourceRef: 'w1' });
    await f.sync.sync(sub.id, noYield);
    const cardId = f.cardsOf(f.noteFor('a2').id!)[0];
    const q = f.srs.queue(deck.id);
    const target = q.cards.find(c => c.id === cardId)!;
    f.srs.grade({ id: target.id, revision: target.revision, rating: 3, durationMs: 800, deckId: deck.id });
    const reviewed = f.db.prepare(`SELECT state, stability, difficulty, due_at FROM srs_state WHERE knowledge_id = ?`).get(cardId) as Record<string, unknown>;

    f.remove('a2');
    let r = await f.sync.sync(sub.id, noYield);
    assert.equal(r.orphaned, 1);
    assert.ok(f.noteFor('a2').orphaned_at);
    assert.equal((f.db.prepare(`SELECT state FROM srs_state WHERE knowledge_id = ?`).get(cardId) as { state: string }).state, 'suspended');
    assert.equal((await f.sync.pending()).orphaned.length, 1);
    assert.ok((f.db.prepare(`SELECT COUNT(*) AS n FROM srs_review_log WHERE knowledge_id = ?`).get(cardId) as { n: number }).n >= 1, 'history kept');

    // Undo the deletion (same annotation id comes back).
    f.annotate('a2', 'يحذف');
    r = await f.sync.sync(sub.id, noYield);
    assert.equal(r.restored, 1);
    assert.equal(f.noteFor('a2').orphaned_at, null);
    const back = f.db.prepare(`SELECT state, stability, difficulty, due_at FROM srs_state WHERE knowledge_id = ?`).get(cardId);
    assert.deepEqual(back, reviewed, 'the card returns to its reviewed state with its schedule');
    assert.equal((await f.sync.pending()).orphaned.length, 0);
  } finally {
    f.db.close();
  }
});

test('a field the user edited is never overwritten; the note is flagged and can be resolved', async () => {
  const f = fixture();
  try {
    f.annotate('a1', 'الأصل');
    const deck = f.decks.createDeck({ name: 'D' });
    const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'book_highlights', sourceRef: 'w1' });
    await f.sync.sync(sub.id, noYield);
    const note = f.noteFor('a1');
    const repo = new CardNoteRepository(f.db);
    const fields = JSON.parse(note.fields_json!);
    repo.saveNote({ id: note.id!, noteTypeId: 'stock-basic', fields: { ...fields, Front: 'الأصل [تعليقي]' } });

    f.edit('a1', 'الأصل المصحح');
    const r = await f.sync.sync(sub.id, noYield);
    assert.equal(r.flagged, 1);
    assert.equal(JSON.parse(f.noteFor('a1').fields_json!).Front, 'الأصل [تعليقي]', "the user's version stays");
    const pending = (await f.sync.pending()).changed;
    assert.equal(pending.length, 1);
    assert.equal(pending[0].oldSource.Front, 'الأصل');
    assert.equal(pending[0].newSource!.Front, 'الأصل المصحح');
    assert.equal(pending[0].current.Front, 'الأصل [تعليقي]');

    // Syncing again doesn't double-flag or overwrite.
    const again = await f.sync.sync(sub.id, noYield);
    assert.equal(JSON.parse(f.noteFor('a1').fields_json!).Front, 'الأصل [تعليقي]');
    assert.equal(again.updated, 0);

    await f.sync.resolveChange(note.id!, 'update');
    assert.equal(JSON.parse(f.noteFor('a1').fields_json!).Front, 'الأصل المصحح');
    assert.equal(f.noteFor('a1').source_changed_at, null);
    assert.equal((await f.sync.pending()).changed.length, 0);
  } finally {
    f.db.close();
  }
});

test('deck-only copies are never overwritten; shared originals update; one card serves two decks', async () => {
  const f = fixture();
  try {
    f.annotate('a1', 'مشترك');
    const d1 = f.decks.createDeck({ name: 'D1' });
    const d2 = f.decks.createDeck({ name: 'D2' });
    const s1 = await f.sync.subscribe({ deckId: d1.id, sourceKind: 'book_highlights', sourceRef: 'w1' });
    const s2 = await f.sync.subscribe({ deckId: d2.id, sourceKind: 'book_highlights', sourceRef: 'w1' });
    await f.sync.sync(s1.id, noYield);
    const r2 = await f.sync.sync(s2.id, noYield);
    assert.equal(r2.linked, 1, 'the second deck gets the same card, not a duplicate');
    assert.equal((f.db.prepare(`SELECT COUNT(*) AS n FROM card_note`).get() as { n: number }).n, 1);

    // Make a deck-only copy in D2.
    const original = f.noteFor('a1');
    const repo = new CardNoteRepository(f.db);
    const { newNote } = repo.forkNoteForDeck(original.id!, d2.id);
    f.edit('a1', 'مشترك محدث');
    await f.sync.sync(s1.id, noYield);
    const r = await f.sync.sync(s2.id, noYield);
    assert.equal(JSON.parse(f.noteFor('a1').fields_json!).Front, 'مشترك محدث', 'the shared original updates');
    const copy = f.db.prepare(`SELECT fields_json, source_changed_at FROM card_note WHERE id = ?`).get(newNote.id) as { fields_json: string; source_changed_at: string | null };
    assert.equal(JSON.parse(copy.fields_json).Front, 'مشترك', 'the copy keeps its text');
    assert.ok(copy.source_changed_at, 'the copy is flagged');
    assert.ok(r.flagged >= 0);
    assert.ok((await f.sync.pending()).changed.some(c => c.noteId === newNote.id && c.isCopy));
  } finally {
    f.db.close();
  }
});

test('orphan resolution: delete moves cards to the trash, keep detaches and unsuspends', async () => {
  const f = fixture();
  try {
    f.annotate('a1', 'أ');
    f.annotate('a2', 'ب');
    const deck = f.decks.createDeck({ name: 'D' });
    const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'book_highlights', sourceRef: 'w1' });
    await f.sync.sync(sub.id, noYield);
    const n1 = f.noteFor('a1').id!;
    const n2 = f.noteFor('a2').id!;
    f.remove('a1');
    f.remove('a2');
    await f.sync.sync(sub.id, noYield);
    f.sync.resolveOrphan(n1, 'delete');
    const deleted = f.db.prepare(`SELECT deleted_at FROM knowledge WHERE id = ?`).get(f.cardsOf(n1)[0]) as { deleted_at: string | null };
    assert.ok(deleted.deleted_at, 'card is in the trash (restorable, history kept)');
    f.sync.resolveOrphan(n2, 'keep');
    const kept = f.db.prepare(`SELECT state FROM srs_state WHERE knowledge_id = ?`).get(f.cardsOf(n2)[0]) as { state: string };
    assert.equal(kept.state, 'new');
    assert.equal((await f.sync.pending()).orphaned.length, 0);
    // A later sync doesn't touch the detached card.
    const r = await f.sync.sync(sub.id, noYield);
    assert.equal(r.orphaned, 0);
  } finally {
    f.db.close();
  }
});

test('comments subscription, validation, and batching yields between batches', async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 230; i++) f.annotate(`h${i}`, `مقطع ${i}`, i % 2 ? `تعليق ${i}` : null);
    const deck = f.decks.createDeck({ name: 'D' });
    await assert.rejects(f.sync.subscribe({ deckId: deck.id, sourceKind: 'diwan', sourceRef: 'x' }), /unsupported-source/u);
    await assert.rejects(f.sync.subscribe({ deckId: deck.id, sourceKind: 'book_highlights', sourceRef: 'missing' }), /source-not-found/u);
    const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'book_highlights', sourceRef: 'w1' });
    let yields = 0;
    const r = await f.sync.sync(sub.id, async () => {
      yields += 1;
    });
    assert.equal(r.added, 230);
    assert.equal(yields, 2, '230 items in batches of 100');
    const comments = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'book_comments', sourceRef: 'w1' });
    const rc = await f.sync.sync(comments.id, noYield);
    assert.equal(rc.added, 115, 'only annotations with a comment');
    assert.equal(f.sync.list(deck.id).length, 2);
    assert.equal(f.sync.setPolicy(sub.id, 'silent').newItems, 'silent');
    assert.equal(f.sync.unsubscribe(comments.id), true);
  } finally {
    f.db.close();
  }
});
