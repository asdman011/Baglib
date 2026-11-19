/**
 * KEY-399 "Revise this list": a deck that follows a KEY-386 personal list. Mixed items use each
 * kind's own template; adding an item adds its card, removing one orphans it, reordering changes
 * the order new cards are introduced without touching reviewed ones; ayahs only make meaning cards.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { DeckRepository } from '../../src/main/database/repositories/deck.repository';
import { CardNoteRepository } from '../../src/main/database/repositories/card-note.repository';
import { DeckSyncService, type SourceReaders } from '../../src/main/services/deck-sync';
import { PersonalListsService } from '../../src/main/services/personal-lists';
import { ayahListRef, bookListRef, hadithListRef, poemListRef } from '../../src/shared/personal-lists';

function fixture() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  const clock = () => new Date('2026-11-19T09:00:00.000Z');
  db.prepare(`INSERT INTO work (id, title) VALUES ('w1', 'مقدمة ابن خلدون'), ('w2', 'الرسالة')`).run();
  db.prepare(`INSERT INTO author (id, name) VALUES ('a1', 'الشافعي')`).run();
  db.prepare(`INSERT INTO work_author (work_id, author_id, role) VALUES ('w2', 'a1', 'author')`).run();
  db.prepare(
    `INSERT INTO annotations (id, book_id, type, location_cfi_or_page, selected_text, note_content, created_at, updated_at)
     VALUES ('h1', 'w1', 'highlight', '3', 'الإنسان مدني بالطبع', 'أصل العمران', ?, ?)`
  ).run(clock().toISOString(), clock().toISOString());
  const readers: SourceReaders = {
    collectionName: c => (c === 'Bukhari' ? 'صحيح البخاري' : c),
    sunnahChapter: async (c, n) =>
      c === 'Bukhari' && n === 1
        ? { title: 'كتاب بدء الوحي', hadiths: [{ id: 'Bukhari:1:1', number: '1', sectionNumber: '1', sectionTitle: 'باب', text: 'إنما الأعمال بالنيات' }] }
        : null,
    sunnahChapterNumbers: async () => [1],
    poem: async id => (id === 11 ? { id: 11, title: 'المعلقة', poetName: 'امرؤ القيس', verses: ['قفا نبك من ذكرى حبيب ومنزل', 'بسقط اللوى بين الدخول فحومل'], paired: true } : null),
    poetPoemIds: async () => [],
    ayahMeaning: async (_profile, surah, from) =>
      surah === 2 && from === 153 ? { text: 'يَا أَيُّهَا الَّذِينَ آمَنُوا اسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ', translation: 'O you who have believed, seek help through patience and prayer.', tafsir: '<p>أمر بالصبر</p>', tafsirTitle: 'تفسير ابن كثير' } : null,
  };
  const lists = new PersonalListsService(db);
  const list = lists.create('الصبر');
  const sync = new DeckSyncService(db, clock, readers);
  const decks = new DeckRepository(db);
  return { db, lists, list, sync, decks };
}
const noYield = () => Promise.resolve();
const notes = (db: Database.Database) =>
  db.prepare(`SELECT source_ref, note_type_id, fields_json, orphaned_at FROM card_note WHERE source_ref IS NOT NULL ORDER BY source_ref`).all() as Array<{ source_ref: string; note_type_id: string; fields_json: string; orphaned_at: string | null }>;

test('a mixed list makes cards with each kind\'s own template', async () => {
  const f = fixture();
  f.lists.add(f.list.id, { itemKind: 'hadith', itemRef: hadithListRef('Bukhari', 1, 'Bukhari:1:1'), label: '' });
  f.lists.add(f.list.id, { itemKind: 'poem', itemRef: poemListRef(11), label: '' });
  f.lists.add(f.list.id, { itemKind: 'ayah', itemRef: ayahListRef(2, 153), label: '' });
  f.lists.add(f.list.id, { itemKind: 'book', itemRef: bookListRef('w1'), label: '' });
  f.lists.add(f.list.id, { itemKind: 'book', itemRef: bookListRef('w2'), label: '' });
  const deck = f.decks.createDeck({ name: 'الصبر' });
  const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'list', sourceRef: f.list.id });
  assert.equal(sub.label, 'الصبر');
  const r = await f.sync.sync(sub.id, noYield);
  assert.equal(r.added, 5);
  const byRef = Object.fromEntries(notes(f.db).map(n => [n.source_ref, n]));
  assert.equal(byRef['sunnah-hadith:Bukhari:1:Bukhari:1:1'].note_type_id, 'stock-hadith-variants');
  assert.equal(byRef['poem:11'].note_type_id, 'stock-poem-whole');
  assert.equal(byRef['book-highlight:w1/h1'].note_type_id, 'stock-basic', 'a book with highlights: its highlight cards (Task 7)');
  const overview = JSON.parse(byRef['list-book:w2'].fields_json);
  assert.deepEqual([overview.Front, overview.Back], ['الرسالة', 'الشافعي'], 'a book with no highlights: title → author');
  const ayah = JSON.parse(byRef['quran-meaning:hafs:2:153'].fields_json);
  assert.equal(byRef['quran-meaning:hafs:2:153'].note_type_id, 'stock-basic');
  assert.match(ayah.Front, /اسْتَعِينُوا بِالصَّبْرِ/u, 'the ayah is shown on the front');
  assert.match(ayah.Back, /seek help through patience/u, 'the meaning is asked for');
  assert.match(ayah.Back, /أمر بالصبر/u);
});

test('ayah cards are never reversed, even when the list deck asks for reversible cards', async () => {
  const f = fixture();
  f.lists.add(f.list.id, { itemKind: 'ayah', itemRef: ayahListRef(2, 153), label: '' });
  f.lists.add(f.list.id, { itemKind: 'book', itemRef: bookListRef('w2'), label: '' });
  const deck = f.decks.createDeck({ name: 'D' });
  const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'list', sourceRef: f.list.id, noteTypeId: 'stock-basic-reversed' });
  await f.sync.sync(sub.id, noYield);
  const byRef = Object.fromEntries(notes(f.db).map(n => [n.source_ref, n.note_type_id]));
  assert.equal(byRef['quran-meaning:hafs:2:153'], 'stock-basic');
  assert.equal(byRef['list-book:w2'], 'stock-basic-reversed');
  const cardsForAyah = f.db.prepare(`SELECT COUNT(*) AS n FROM card_detail c JOIN card_note n ON n.id = c.note_id WHERE n.source_ref = 'quran-meaning:hafs:2:153'`).get() as { n: number };
  assert.equal(cardsForAyah.n, 1, 'one meaning card, no ayah-from-meaning card');
});

test('adding an item adds its card; removing one orphans it; adding it back restores it', async () => {
  const f = fixture();
  f.lists.add(f.list.id, { itemKind: 'poem', itemRef: poemListRef(11), label: '' });
  const deck = f.decks.createDeck({ name: 'D' });
  const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'list', sourceRef: f.list.id });
  assert.equal((await f.sync.sync(sub.id, noYield)).added, 1);
  f.lists.add(f.list.id, { itemKind: 'hadith', itemRef: hadithListRef('Bukhari', 1, 'Bukhari:1:1'), label: '' });
  assert.deepEqual(f.sync.forList(f.list.id).map(s => s.id), [sub.id]);
  const again = await f.sync.sync(sub.id, noYield);
  assert.equal(again.added, 1);
  assert.equal(again.unchanged, 1);
  f.lists.removeItem(f.list.id, 'poem', poemListRef(11));
  assert.equal((await f.sync.sync(sub.id, noYield)).orphaned, 1);
  assert.ok(notes(f.db).find(n => n.source_ref === 'poem:11')!.orphaned_at);
  f.lists.add(f.list.id, { itemKind: 'poem', itemRef: poemListRef(11), label: '' });
  assert.equal((await f.sync.sync(sub.id, noYield)).restored, 1);
});

test('the list order is the order new cards are introduced; reviewed cards keep their schedule', async () => {
  const f = fixture();
  f.lists.add(f.list.id, { itemKind: 'poem', itemRef: poemListRef(11), label: '' });
  f.lists.add(f.list.id, { itemKind: 'book', itemRef: bookListRef('w2'), label: '' });
  f.lists.add(f.list.id, { itemKind: 'hadith', itemRef: hadithListRef('Bukhari', 1, 'Bukhari:1:1'), label: '' });
  const deck = f.decks.createDeck({ name: 'D' });
  const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'list', sourceRef: f.list.id });
  await f.sync.sync(sub.id, noYield);
  const order = () =>
    (f.db.prepare(
      `SELECT n.source_ref AS ref, s.state, COALESCE(s.new_position, dc.position) AS pos FROM card_note n
       JOIN card_detail c ON c.note_id = n.id JOIN deck_card dc ON dc.knowledge_id = c.knowledge_id
       LEFT JOIN srs_state s ON s.knowledge_id = c.knowledge_id ORDER BY pos`
    ).all() as Array<{ ref: string; state: string; pos: number }>);
  assert.deepEqual(order().map(r => r.ref), ['poem:11', 'list-book:w2', 'sunnah-hadith:Bukhari:1:Bukhari:1:1']);
  // The poem has been reviewed; then the user moves the hadith to the top.
  const poemCard = f.db.prepare(`SELECT c.knowledge_id AS id FROM card_detail c JOIN card_note n ON n.id = c.note_id WHERE n.source_ref = 'poem:11'`).get() as { id: string };
  f.db.prepare(`UPDATE srs_state SET state = 'review', new_position = 100 WHERE knowledge_id = ?`).run(poemCard.id);
  const before = f.db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(poemCard.id);
  const items = f.lists.items(f.list.id);
  f.lists.reorderItems(f.list.id, [items[2].id, items[1].id, items[0].id]);
  await f.sync.sync(sub.id, noYield);
  const news = order().filter(r => r.state === 'new').map(r => r.ref);
  assert.deepEqual(news, ['sunnah-hadith:Bukhari:1:Bukhari:1:1', 'list-book:w2']);
  assert.deepEqual(f.db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(poemCard.id), before, 'the reviewed card is untouched');
});

test('a list deck only orphans list-made cards, never the deck\'s other cards', async () => {
  const f = fixture();
  const deck = f.decks.createDeck({ name: 'D' });
  // A quick-add card and a hand-made Sunnah card already in the deck, neither from the list.
  const repo = new CardNoteRepository(f.db);
  repo.saveNote({ noteTypeId: 'stock-basic', fields: { Front: 'صبر', Back: 'patience' }, sourceRef: 'lexicon:arlex-lisan:صبر', deckId: deck.id });
  repo.saveNote({ noteTypeId: 'stock-basic', fields: { Front: 'q', Back: 'a' }, deckId: deck.id });
  const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'list', sourceRef: f.list.id });
  const r = await f.sync.sync(sub.id, noYield);
  assert.equal(r.orphaned, 0);
  assert.equal((f.db.prepare(`SELECT COUNT(*) AS n FROM card_note WHERE orphaned_at IS NOT NULL`).get() as { n: number }).n, 0);
  await assert.rejects(f.sync.subscribe({ deckId: deck.id, sourceKind: 'list', sourceRef: 'no-such-list' }), /source-not-found/);
});
