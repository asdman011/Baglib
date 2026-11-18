/**
 * KEY-397 poetry decks: verse by verse (progressive context cloze) with the ajuz or the whole bayt
 * hidden, daily chunking in verse order, and the whole-poem layout. Fixture readers stand in for
 * the installed poetry corpus.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { DeckRepository } from '../../src/main/database/repositories/deck.repository';
import { SrsService } from '../../src/main/services/srs';
import { DeckSyncService, type SourceReaders } from '../../src/main/services/deck-sync';

// A long poem: 20 bayts (40 hemistichs), each hemistich tagged so the tests can find it.
const LONG = Array.from({ length: 40 }, (_, i) => `${i % 2 ? 'عجز' : 'صدر'} البيت ${Math.floor(i / 2) + 1} مِنَ القَصِيدَةِ`);

function fixture() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  const clock = () => new Date('2026-11-18T09:00:00.000Z');
  const poems: Record<number, { id: number; title: string; poetName: string; verses: string[]; paired: boolean }> = {
    21: { id: 21, title: 'القصيدة الطويلة', poetName: 'الشاعر', verses: LONG, paired: true },
    22: { id: 22, title: 'قصيرة <ب>', poetName: 'الشاعر', verses: ['قِفا نَبكِ مِن ذِكرى حَبيبٍ وَمَنزِلِ', 'بِسِقطِ اللِوى بَينَ الدَخولِ فَحَومَلِ'], paired: true },
  };
  const readers: SourceReaders = {
    collectionName: c => c,
    sunnahChapter: async () => ({ title: 'ك', hadiths: [{ id: 'h', number: '1', sectionNumber: '1', sectionTitle: 'ب', text: 'نص' }] }),
    sunnahChapterNumbers: async () => [1],
    poem: async id => poems[id] ?? null,
    poetPoemIds: async () => [21, 22],
  };
  return { db, poems, decks: new DeckRepository(db), sync: new DeckSyncService(db, clock, readers), srs: new SrsService(db, clock) };
}
const noYield = () => Promise.resolve();
const cardsOf = (db: Database.Database, ref: string) =>
  db.prepare(`SELECT c.knowledge_id, c.ord, c.front, c.back FROM card_detail c JOIN card_note n ON n.id = c.note_id WHERE n.source_ref = ? ORDER BY c.ord`).all(ref) as Array<{
    knowledge_id: string;
    ord: number;
    front: string;
    back: string;
  }>;

test('verse by verse with a daily chunk: the deck gets a quota preset and new verses come in order', async () => {
  const f = fixture();
  try {
    const deck = f.decks.createDeck({ name: 'الطويلة' });
    const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'poem', sourceRef: '21', noteTypeId: 'stock-context-cloze', prompt: 'ajuz', chunk: 3 });
    assert.deepEqual(sub.poem, { prompt: 'ajuz', chunk: 3 });
    await f.sync.sync(sub.id, noYield);
    const cards = cardsOf(f.db, 'poem:21');
    assert.equal(cards.length, 20, 'one card per bayt');

    const preset = f.decks.getEffectivePresetForDeck(deck.id);
    assert.equal(preset.newPerDay, 3);
    assert.equal(preset.buryNew, false, 'new siblings are not buried, or only one verse a day would come');
    assert.equal(preset.newOrder, 'position');

    const queue = f.srs.queue(deck.id).cards.filter(c => c.state === 'new');
    assert.deepEqual(
      queue.map(c => cards.find(x => x.knowledge_id === c.id)!.ord),
      [0, 1, 2],
      'day one: the first three bayts, in order'
    );

    // Card for bayt 2 (ord 1): bayt 1 as the anchor, the sadr shown, the ajuz hidden, the rest of the chunk blurred.
    const second = cards[1];
    assert.match(second.front, /<div class="context-before"><span class="bayt" dir="auto"><span class="sadr">صدر البيت 1 /u);
    assert.ok(second.front.includes('<span class="sadr">صدر البيت 2 '), 'the sadr is shown');
    assert.ok(!second.front.includes('عجز البيت 2 '), 'the ajuz is hidden on the front');
    assert.ok(second.back.includes('عجز البيت 2 '), 'and revealed on the back');
    assert.ok(second.front.includes('context-blurred') && second.front.includes('صدر البيت 3 '), 'the lookahead shows the rest of the chunk');
    assert.ok(!second.front.includes('صدر البيت 4 '), 'but not the next day’s chunk');
    // Card for bayt 3 (end of the chunk) still previews the next bayt.
    assert.ok(cards[2].front.includes('صدر البيت 4 '));
    // Text is verbatim, diacritics included.
    assert.ok(cards[0].back.includes('مِنَ القَصِيدَةِ'));
  } finally {
    f.db.close();
  }
});

test('whole-verse prompt hides the whole bayt until the answer', async () => {
  const f = fixture();
  try {
    const deck = f.decks.createDeck({ name: 'كاملة' });
    const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'poem', sourceRef: '21', prompt: 'verse' });
    await f.sync.sync(sub.id, noYield);
    const card = cardsOf(f.db, 'poem:21')[4];
    assert.ok(!card.front.includes('صدر البيت 5 ') && !card.front.includes('عجز البيت 5 '), 'nothing of the bayt on the front');
    assert.ok(card.front.includes('صدر البيت 4 '), 'the previous bayt is the anchor');
    assert.ok(card.back.includes('صدر البيت 5 ') && card.back.includes('عجز البيت 5 '), 'the whole bayt on the back');
    assert.equal(f.decks.getDeck(deck.id)?.presetId ?? null, null, 'no chunk, so the deck keeps the default settings');
  } finally {
    f.db.close();
  }
});

test('whole poem: the title on the front, every bayt as two hemistichs on the back, escaped verbatim', async () => {
  const f = fixture();
  try {
    const deck = f.decks.createDeck({ name: 'قصائد الشاعر' });
    const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'poet', sourceRef: '7', noteTypeId: 'stock-poem-whole' });
    assert.equal(sub.noteTypeId, 'stock-poem-whole');
    assert.equal((await f.sync.sync(sub.id, noYield)).added, 2);
    const [card] = cardsOf(f.db, 'poem:22');
    assert.ok(card.front.includes('قصيرة &lt;ب&gt;'), 'title on the front, markup escaped');
    assert.ok(!card.front.includes('قِفا'), 'the poem is not on the front');
    assert.ok(card.back.includes('<div class="bayt" dir="auto"><span class="sadr">قِفا نَبكِ مِن ذِكرى حَبيبٍ وَمَنزِلِ</span> <span class="ajuz">بِسِقطِ اللِوى بَينَ الدَخولِ فَحَومَلِ</span></div>'));
    assert.equal(cardsOf(f.db, 'poem:21').length, 1, 'one card per poem');
  } finally {
    f.db.close();
  }
});

test('a deck with its own settings keeps them; options are validated', async () => {
  const f = fixture();
  try {
    const deck = f.decks.createDeck({ name: 'مخصصة' });
    const own = f.decks.copyPreset(f.decks.getDefaultPreset().id, 'Mine');
    f.decks.assignPreset(deck.id, own.id);
    await f.sync.subscribe({ deckId: deck.id, sourceKind: 'poem', sourceRef: '21', chunk: 5 });
    assert.equal(f.decks.getEffectivePresetForDeck(deck.id).id, own.id, 'the user’s preset is not replaced');
    assert.equal(f.decks.getEffectivePresetForDeck(deck.id).newPerDay, own.newPerDay, 'nor changed');

    const other = f.decks.createDeck({ name: 'أخرى' });
    await assert.rejects(f.sync.subscribe({ deckId: other.id, sourceKind: 'poem', sourceRef: '21', prompt: 'sadr' }), /invalid-request/u);
    await assert.rejects(f.sync.subscribe({ deckId: other.id, sourceKind: 'poem', sourceRef: '21', chunk: 51 }), /invalid-request/u);
    await assert.rejects(f.sync.subscribe({ deckId: other.id, sourceKind: 'poem', sourceRef: '21', chunk: 2.5 }), /invalid-request/u);
    await assert.rejects(f.sync.subscribe({ deckId: other.id, sourceKind: 'poem', sourceRef: '21', noteTypeId: 'stock-basic' }), /invalid-note-type/u);
    await assert.rejects(f.sync.subscribe({ deckId: other.id, sourceKind: 'sunnah_book', sourceRef: 'Bukhari:1', chunk: 3 }), /invalid-request/u);
    await assert.rejects(f.sync.subscribe({ deckId: other.id, sourceKind: 'sunnah_book', sourceRef: 'Bukhari:1', noteTypeId: 'stock-poem-whole' }), /invalid-note-type/u);
  } finally {
    f.db.close();
  }
});

test('a leech on a verse card searches for the prompted verse, not the markup', async () => {
  const { cardSearchTerm } = await import('../../src/shared/revision/template-engine');
  const f = fixture();
  try {
    const deck = f.decks.createDeck({ name: 'بحث' });
    const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'poem', sourceRef: '21' });
    await f.sync.sync(sub.id, noYield);
    const card = cardsOf(f.db, 'poem:21')[2];
    const term = cardSearchTerm(card.front);
    assert.ok(term.startsWith('صدر البيت 3'), `the prompted sadr, got ${term}`);
    assert.ok(!/[<>[\]]/u.test(term), 'no markup or placeholder');
    assert.equal(cardSearchTerm('<b>Plain &amp; simple</b>'), 'Plain & simple');
  } finally {
    f.db.close();
  }
});
