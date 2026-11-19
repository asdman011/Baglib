/**
 * KEY-410 live sync for dictionaries (`lexicon` subscriptions): add, edit, delete and restore, the
 * prefix and limit, sharing KEY-400's `lexicon:<dict>:<headword>` notes, and input validation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { DeckRepository } from '../../src/main/database/repositories/deck.repository';
import { CardNoteRepository } from '../../src/main/database/repositories/card-note.repository';
import { DeckSyncService, type SourceReaders } from '../../src/main/services/deck-sync';
import { normalizeArabicLetters, stripArabicDiacritics } from '../../src/shared/utils/lookup-candidates';

function fixture() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  db.prepare(`INSERT INTO dictionaries (id, title, format, source_path, entry_count, is_enabled, created_at) VALUES ('arlex-wasit', 'المعجم الوسيط', 'arabic-lexicons', '/x', 4, 1, '2026-01-01')`).run();
  const entries = new Map<string, string>([
    ['كَتَبَ', 'خطّ الحروف'],
    ['كتاب', 'ما يُكتب فيه'],
    ['كاتب', 'من يكتب'],
    ['رحمة', 'الرقة والتعطف'],
  ]);
  const index = (headword: string) =>
    db.prepare(`INSERT INTO headword_index (dict_id, headword, normalized_headword) VALUES ('arlex-wasit', ?, ?)`).run(headword, normalizeArabicLetters(stripArabicDiacritics(headword.toLowerCase())));
  for (const headword of entries.keys()) index(headword);
  const readers: SourceReaders = {
    collectionName: c => c,
    sunnahChapter: async () => null,
    sunnahChapterNumbers: async () => [],
    poem: async () => null,
    poetPoemIds: async () => [],
    lexiconEntry: async (dictId, headword) => (dictId === 'arlex-wasit' ? entries.get(headword) ?? null : null),
  };
  const sync = new DeckSyncService(db, () => new Date('2026-11-19T09:00:00.000Z'), readers);
  return { db, entries, index, sync, decks: new DeckRepository(db) };
}
const noYield = () => Promise.resolve();
const note = (db: Database.Database, ref: string) => db.prepare(`SELECT * FROM card_note WHERE source_ref = ?`).get(ref) as { fields_json: string; orphaned_at: string | null } | undefined;

test('following a dictionary by prefix: add, edit, delete and restore', async () => {
  const f = fixture();
  const deck = f.decks.createDeck({ name: 'الوسيط — ك' });
  const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'lexicon', sourceRef: 'arlex-wasit', prefix: 'كت', limit: 50 });
  assert.equal(sub.label, 'المعجم الوسيط');
  assert.deepEqual(sub.lexicon, { prefix: 'كت', limit: 50 });
  const first = await f.sync.sync(sub.id, noYield);
  assert.equal(first.added, 2, 'كَتَبَ and كتاب start with كت; كاتب and رحمة do not');
  const fields = JSON.parse(note(f.db, 'lexicon:arlex-wasit:كتاب')!.fields_json);
  assert.match(fields.Front, /كتاب/u);
  assert.match(fields.Back, /ما يُكتب فيه/u);
  assert.match(fields.Back, /المعجم الوسيط/u);

  // Edit: the dictionary's meaning changes (a re-imported pack) → the card updates in place.
  f.entries.set('كتاب', 'ما يُكتب فيه، والجمع كتب');
  const edited = await f.sync.sync(sub.id, noYield);
  assert.equal(edited.updated, 1);
  assert.match(JSON.parse(note(f.db, 'lexicon:arlex-wasit:كتاب')!.fields_json).Back, /والجمع كتب/u);

  // Delete: the headword is gone from the dictionary → orphaned (suspended, history kept).
  f.db.prepare(`DELETE FROM headword_index WHERE headword = 'كتاب'`).run();
  assert.equal((await f.sync.sync(sub.id, noYield)).orphaned, 1);
  assert.ok(note(f.db, 'lexicon:arlex-wasit:كتاب')!.orphaned_at);

  // Restore: it comes back → the same note, unsuspended.
  f.index('كتاب');
  assert.equal((await f.sync.sync(sub.id, noYield)).restored, 1);
  assert.equal(note(f.db, 'lexicon:arlex-wasit:كتاب')!.orphaned_at, null);
});

test('the limit caps the cards; a removed dictionary orphans its cards', async () => {
  const f = fixture();
  const deck = f.decks.createDeck({ name: 'D' });
  const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'lexicon', sourceRef: 'arlex-wasit', limit: 3 });
  assert.equal((await f.sync.sync(sub.id, noYield)).added, 3);
  f.db.prepare(`DELETE FROM dictionaries WHERE id = 'arlex-wasit'`).run();
  assert.equal((await f.sync.sync(sub.id, noYield)).orphaned, 3);
});

test('a word KEY-400 already made into a card is shared, not duplicated', async () => {
  const f = fixture();
  const vocabulary = f.decks.createDeck({ name: 'مفردات' });
  new CardNoteRepository(f.db).saveNote({ noteTypeId: 'stock-basic', fields: { Front: 'رحمة', Back: 'old' }, sourceRef: 'lexicon:arlex-wasit:رحمة', deckId: vocabulary.id });
  const deck = f.decks.createDeck({ name: 'D' });
  const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'lexicon', sourceRef: 'arlex-wasit', prefix: 'رح' });
  const r = await f.sync.sync(sub.id, noYield);
  assert.equal(r.added, 0);
  assert.equal(r.linked, 1);
  assert.equal((f.db.prepare(`SELECT COUNT(*) AS n FROM card_note WHERE source_ref = 'lexicon:arlex-wasit:رحمة'`).get() as { n: number }).n, 1);
});

test('dictionary options are validated', async () => {
  const f = fixture();
  const deck = f.decks.createDeck({ name: 'D' });
  await assert.rejects(f.sync.subscribe({ deckId: deck.id, sourceKind: 'lexicon', sourceRef: 'arlex-wasit', limit: 0 }), /invalid-request/);
  await assert.rejects(f.sync.subscribe({ deckId: deck.id, sourceKind: 'lexicon', sourceRef: 'arlex-wasit', limit: 5000 }), /invalid-request/);
  await assert.rejects(f.sync.subscribe({ deckId: deck.id, sourceKind: 'lexicon', sourceRef: 'arlex-wasit', prefix: 'x'.repeat(65) }), /invalid-request/);
  await assert.rejects(f.sync.subscribe({ deckId: deck.id, sourceKind: 'lexicon', sourceRef: 'missing' }), /source-not-found/);
  await assert.rejects(f.sync.subscribe({ deckId: deck.id, sourceKind: 'poem', sourceRef: '1', prefix: 'x' }), /invalid-request/);
});
