/**
 * KEY-409 live sync for Sunnah books, babs and collections, poems and poets.
 * Fixture readers stand in for the installed corpora.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { DeckRepository } from '../../src/main/database/repositories/deck.repository';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { SrsService } from '../../src/main/services/srs';
import { DeckSyncService, type SourceReaders } from '../../src/main/services/deck-sync';

type Hadith = { id: string; number: string; sectionNumber: string; sectionTitle: string; text: string };

function fixture() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  const clock = () => new Date('2026-11-18T09:00:00.000Z');
  const chapters: Record<string, { title: string; hadiths: Hadith[] }> = {
    'Bukhari:1': {
      title: 'كتاب بدء الوحي',
      hadiths: [
        { id: 'b1', number: '1', sectionNumber: '1', sectionTitle: 'باب كيف كان بدء الوحي', text: 'إنما الأعمال بالنيات' },
        { id: 'b2', number: '2', sectionNumber: '1', sectionTitle: 'باب كيف كان بدء الوحي', text: 'أحيانا يأتيني مثل صلصلة الجرس' },
        { id: 'b3', number: '3', sectionNumber: '2', sectionTitle: 'باب آخر', text: 'أول ما بدئ به رسول الله' },
      ],
    },
    'Bukhari:2': { title: 'كتاب الإيمان', hadiths: [{ id: 'b8', number: '8', sectionNumber: '1', sectionTitle: 'باب الإيمان', text: 'بني الإسلام على خمس' }] },
  };
  const poems: Record<number, { id: number; title: string; poetName: string; verses: string[] }> = {
    11: { id: 11, title: 'المعلقة', poetName: 'امرؤ القيس', verses: ['قفا نبك من ذكرى حبيب ومنزل', 'بسقط اللوى بين الدخول فحومل', 'فتوضح فالمقراة لم يعف رسمها', 'لما نسجتها من جنوب وشمأل'] },
    12: { id: 12, title: 'قصيدة أخرى', poetName: 'امرؤ القيس', verses: ['ألا عم صباحا أيها الطلل البالي', 'وهل يعمن من كان في العصر الخالي'] },
  };
  const readers: SourceReaders = {
    collectionName: c => (c === 'Bukhari' ? 'صحيح البخاري' : c),
    sunnahChapter: async (c, n) => chapters[`${c}:${n}`] ?? null,
    sunnahChapterNumbers: async c => Object.keys(chapters).filter(k => k.startsWith(`${c}:`)).map(k => Number(k.split(':')[1])),
    poem: async id => poems[id] ?? null,
    poetPoemIds: async poetId => (poetId === 7 ? Object.keys(poems).map(Number) : []),
  };
  return { db, chapters, poems, decks: new DeckRepository(db), sync: new DeckSyncService(db, clock, readers), srs: new SrsService(db, clock) };
}
const noYield = () => Promise.resolve();
const note = (db: Database.Database, ref: string) => db.prepare(`SELECT * FROM card_note WHERE source_ref = ?`).get(ref) as Record<string, string | null> | undefined;

test('Sunnah book: hadith text copied verbatim into the Hadith type; a corrected text updates; FSRS kept', async () => {
  const f = fixture();
  try {
    const deck = f.decks.createDeck({ name: 'البخاري' });
    const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'sunnah_book', sourceRef: 'Bukhari:1' });
    assert.equal(sub.noteTypeId, 'stock-hadith');
    assert.equal(sub.label, 'صحيح البخاري — كتاب بدء الوحي');
    const r = await f.sync.sync(sub.id, noYield);
    assert.equal(r.added, 3);
    const n1 = note(f.db, 'sunnah-hadith:Bukhari:1:b1')!;
    const fields = JSON.parse(n1.fields_json!);
    assert.equal(fields.Hadith, 'إنما الأعمال بالنيات', 'verbatim');
    assert.equal(fields.Bab, 'صحيح البخاري 1<br>باب كيف كان بدء الوحي');

    const card = f.srs.queue(deck.id).cards[0];
    f.srs.grade({ id: card.id, revision: card.revision, rating: 3, durationMs: 500, deckId: deck.id });
    const before = f.db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(card.id);

    // The corpus corrects a hadith's text; protection is ON, and sync (the source itself) still writes it.
    new SqliteSettingsRepository(f.db).set('revision.protectSourceText', true);
    f.chapters['Bukhari:1'].hadiths[0].text = 'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى';
    const r2 = await f.sync.sync(sub.id, noYield);
    assert.equal(r2.updated, 1);
    assert.equal(JSON.parse(note(f.db, 'sunnah-hadith:Bukhari:1:b1')!.fields_json!).Hadith, 'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى');
    assert.deepEqual(f.db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(card.id), before);
    // ...while a user edit of the same source text is still refused.
    const { CardNoteRepository } = await import('../../src/main/database/repositories/card-note.repository');
    const current = note(f.db, 'sunnah-hadith:Bukhari:1:b1')!;
    assert.throws(
      () => new CardNoteRepository(f.db).saveNote({ id: current.id!, noteTypeId: 'stock-hadith', fields: { ...JSON.parse(current.fields_json!), Hadith: 'تحريف' } }),
      /source-text-protected/u
    );
  } finally {
    f.db.close();
  }
});

test('Sunnah bab: only its hadiths; a bab never orphans hadiths its book subscription still covers', async () => {
  const f = fixture();
  try {
    const deck = f.decks.createDeck({ name: 'باب' });
    const bab = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'sunnah_bab', sourceRef: 'Bukhari:1:1' });
    assert.equal(bab.label, 'صحيح البخاري — كتاب بدء الوحي — باب كيف كان بدء الوحي');
    assert.equal((await f.sync.sync(bab.id, noYield)).added, 2);
    const book = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'sunnah_book', sourceRef: 'Bukhari:1' });
    const rb = await f.sync.sync(book.id, noYield);
    assert.equal(rb.added, 1, 'the two bab hadiths are already there; only b3 is new');
    assert.equal(rb.unchanged, 2);
    const rbab = await f.sync.sync(bab.id, noYield);
    assert.equal(rbab.orphaned, 0, 'b3 (outside the bab) is covered by the book subscription');

    // A hadith removed from the corpus is orphaned.
    f.chapters['Bukhari:1'].hadiths = f.chapters['Bukhari:1'].hadiths.filter(h => h.id !== 'b2');
    assert.equal((await f.sync.sync(book.id, noYield)).orphaned, 1);
    assert.ok(note(f.db, 'sunnah-hadith:Bukhari:1:b2')!.orphaned_at);
    await assert.rejects(f.sync.subscribe({ deckId: deck.id, sourceKind: 'sunnah_bab', sourceRef: 'Bukhari:1:99' }), /source-not-found/u);
    await assert.rejects(f.sync.subscribe({ deckId: deck.id, sourceKind: 'sunnah_bab', sourceRef: 'Bukhari;1' }), /invalid-request/u);
  } finally {
    f.db.close();
  }
});

test('hadith collection follows every chapter', async () => {
  const f = fixture();
  try {
    const deck = f.decks.createDeck({ name: 'الكل' });
    const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'hadith_collection', sourceRef: 'Bukhari' });
    assert.equal(sub.label, 'صحيح البخاري');
    assert.equal((await f.sync.sync(sub.id, noYield)).added, 4);
    f.chapters['Bukhari:3'] = { title: 'كتاب العلم', hadiths: [{ id: 'b59', number: '59', sectionNumber: '1', sectionTitle: 'باب', text: 'من يرد الله به خيرا' }] };
    assert.equal((await f.sync.sync(sub.id, noYield)).added, 1, 'a new chapter joins');
    await assert.rejects(f.sync.subscribe({ deckId: deck.id, sourceKind: 'hadith_collection', sourceRef: 'Unknown' }), /source-not-found/u);
  } finally {
    f.db.close();
  }
});

test('poem: a progressive context cloze with one card per bayt; a new bayt adds a card, old cards keep their schedule', async () => {
  const f = fixture();
  try {
    const deck = f.decks.createDeck({ name: 'معلقة' });
    const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'poem', sourceRef: '11' });
    assert.equal(sub.noteTypeId, 'stock-context-cloze');
    assert.equal(sub.label, 'المعلقة — امرؤ القيس');
    await f.sync.sync(sub.id, noYield);
    const n = note(f.db, 'poem:11')!;
    const cards = () => f.db.prepare(`SELECT knowledge_id, ord FROM card_detail WHERE note_id = ? ORDER BY ord`).all(n.id) as Array<{ knowledge_id: string; ord: number }>;
    assert.equal(cards().length, 2, 'two bayts, two cards');
    assert.equal(JSON.parse(n.fields_json!).Target.split('\n').length, 4);
    const first = cards()[0].knowledge_id;
    const q = f.srs.queue(deck.id).cards.find(c => c.id === first)!;
    f.srs.grade({ id: q.id, revision: q.revision, rating: 4, durationMs: 400, deckId: deck.id });
    const state = f.db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(first);

    f.poems[11].verses.push('ترى بعر الآرام في عرصاتها', 'وقيعانها كأنه حب فلفل');
    const r = await f.sync.sync(sub.id, noYield);
    assert.equal(r.updated, 1);
    assert.equal(cards().length, 3, 'the new bayt gets its own card');
    assert.deepEqual(f.db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(first), state, 'existing bayt card keeps its schedule');
  } finally {
    f.db.close();
  }
});

test('poet: every poem by the poet; validation of refs', async () => {
  const f = fixture();
  try {
    const deck = f.decks.createDeck({ name: 'امرؤ القيس' });
    const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'poet', sourceRef: '7' });
    assert.equal(sub.label, 'امرؤ القيس');
    assert.equal((await f.sync.sync(sub.id, noYield)).added, 2);
    delete f.poems[12];
    assert.equal((await f.sync.sync(sub.id, noYield)).orphaned, 1, 'a removed poem is orphaned');
    await assert.rejects(f.sync.subscribe({ deckId: deck.id, sourceKind: 'poet', sourceRef: '999' }), /source-not-found/u);
    await assert.rejects(f.sync.subscribe({ deckId: deck.id, sourceKind: 'poem', sourceRef: 'abc' }), /invalid-request/u);
    await assert.rejects(f.sync.subscribe({ deckId: deck.id, sourceKind: 'diwan', sourceRef: '1' }), /unsupported-source/u);
  } finally {
    f.db.close();
  }
});

test('pending shows the new source for a hadith the user edited', async () => {
  const f = fixture();
  try {
    const deck = f.decks.createDeck({ name: 'D' });
    const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'sunnah_book', sourceRef: 'Bukhari:2' });
    await f.sync.sync(sub.id, noYield);
    const n = note(f.db, 'sunnah-hadith:Bukhari:2:b8')!;
    const { CardNoteRepository } = await import('../../src/main/database/repositories/card-note.repository');
    const fields = JSON.parse(n.fields_json!);
    new CardNoteRepository(f.db).saveNote({ id: n.id!, noteTypeId: 'stock-hadith', fields: { ...fields, Hadith: `${fields.Hadith} [تعليق]` } });
    f.chapters['Bukhari:2'].hadiths[0].text = 'بني الإسلام على خمس شهادة أن لا إله إلا الله';
    assert.equal((await f.sync.sync(sub.id, noYield)).flagged, 1);
    const pending = (await f.sync.pending()).changed[0];
    assert.equal(pending.newSource!.Hadith, 'بني الإسلام على خمس شهادة أن لا إله إلا الله');
    assert.equal(pending.current.Hadith, 'بني الإسلام على خمس [تعليق]');
  } finally {
    f.db.close();
  }
});
