import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initialManuscriptSnapshot, deriveManuscriptSnapshot, insertBlockIntoManuscriptSnapshot } from '../../src/shared/manuscript-snapshot';
import {
  createBookQuotePayload,
  createQuranAyahPayload,
  createHadithPayload,
  createPoetryVersePayload,
  pickDefaultId,
  sendPayloadToDocument,
  setOpenManuscriptDocument,
  isManuscriptDocumentOpen,
} from '../../src/shared/manuscript-transfer';
import { ManuscriptRepository } from '../../src/main/database/repositories/manuscript.repository';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';

test('createBookQuotePayload creates valid book-quote payload with link', () => {
  const payload = createBookQuotePayload({
    book: { id: 'book-123', title: 'صحيح البخاري', sourceId: 'src-1' },
    text: 'إنما الأعمال بالنيات',
    page: 15,
  });
  assert.equal(payload.kind, 'book-quote');
  assert.equal(payload.props.url, 'book:book-123@src-1#p=15');
  assert.equal(payload.props.label, 'صحيح البخاري · ص 15');
  assert.equal(payload.props.text, 'إنما الأعمال بالنيات');
  assert.equal(payload.props.workId, 'book-123');
  assert.equal(payload.props.page, 15);
});

test('createBookQuotePayload handles EPUB CFI target correctly', () => {
  const cfi = 'epubcfi(/6/4[chap01]!/4/2/1:0)';
  const payload = createBookQuotePayload({
    book: { id: 'epub-work' },
    text: 'Some highlighted quote',
    cfi,
  });
  assert.equal(payload.kind, 'book-quote');
  assert.ok(payload.props.url.startsWith('book:epub-work#cfi='));
  assert.equal(payload.props.text, 'Some highlighted quote');
});

test('createQuranAyahPayload creates valid ayah payload with link', () => {
  const payload = createQuranAyahPayload({
    profile: 'hafs',
    surah: 2,
    ayah: 255,
    surahName: 'البقرة',
    text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ',
  });
  assert.equal(payload.kind, 'ayah');
  assert.equal(payload.props.url, 'quran:hafs:2:255');
  assert.equal(payload.props.label, 'البقرة 2:255');
  assert.equal(payload.props.text, 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ');
});

test('createHadithPayload creates valid hadith payload with link and metadata', () => {
  const payload = createHadithPayload({
    collection: 'bukhari',
    collectionLabel: 'صحيح البخاري',
    chapterNumber: 1,
    hadithId: 'hadith-1',
    hadithNumber: '1',
    text: 'إنما الأعمال بالنيات',
    grade: 'صحيح',
  });
  assert.equal(payload.kind, 'hadith');
  assert.equal(payload.props.url, 'sunnah:bukhari:1:hadith-1');
  assert.equal(payload.props.label, 'صحيح البخاري · 1');
  assert.equal(payload.props.collection, 'صحيح البخاري');
  assert.equal(payload.props.number, '1');
  assert.equal(payload.props.grade, 'صحيح');
});

test('createPoetryVersePayload creates valid verse payload with bayts', () => {
  const payload = createPoetryVersePayload({
    poemId: 42,
    from: 0,
    to: 1,
    poetName: 'المتنبي',
    poemTitle: 'واحر قلباه',
    verses: [
      { sadr: 'واحرَّ قلباهُ مِمَّن قلبُهُ شَبِمُ', ajuz: 'ومَن بجسمي وحالي عندَهُ سَقَمُ' },
    ],
  });
  assert.equal(payload.kind, 'verse');
  assert.equal(payload.props.url, 'poetry:ashaar:42:0:1');
  assert.equal(payload.props.label, 'المتنبي — واحر قلباه');
  assert.equal(payload.props.verses.length, 1);
  assert.equal(payload.props.poet, 'المتنبي');
});

test('insertBlockIntoManuscriptSnapshot inserts at start and end and derives links', () => {
  const initial = initialManuscriptSnapshot('doc-test', 'مقدمة البحث');
  const ayahPayload = createQuranAyahPayload({
    profile: 'hafs',
    surah: 1,
    ayah: 1,
    surahName: 'الفاتحة',
    text: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
  });

  // Insert ayah at end
  const res1 = insertBlockIntoManuscriptSnapshot(initial, ayahPayload.kind, ayahPayload.props, 'end');
  assert.ok(res1.blockId);
  const derived1 = deriveManuscriptSnapshot(res1.snapshot);
  assert.equal(derived1.links.length, 1);
  assert.equal(derived1.links[0].target_scheme, 'quran');
  assert.equal(derived1.links[0].target_id, 'hafs:1:1');
  assert.ok(derived1.plainText.includes('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'));

  // Insert hadith at start
  const hadithPayload = createHadithPayload({
    collection: 'muslim',
    collectionLabel: 'صحيح مسلم',
    chapterNumber: 1,
    hadithId: 'hadith-muslim-1',
    hadithNumber: '1',
    text: 'الإيمان بضع وسبعون شعبة',
  });
  const res2 = insertBlockIntoManuscriptSnapshot(res1.snapshot, hadithPayload.kind, hadithPayload.props, 'start');
  const derived2 = deriveManuscriptSnapshot(res2.snapshot);
  assert.equal(derived2.links.length, 2);
  assert.equal(derived2.links[0].target_scheme, 'sunnah');
  assert.equal(derived2.links[1].target_scheme, 'quran');
});

test('roundtrip database save and retrieval with repository and links table', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys=ON');
  runMigrations(db, migrations);

  try {
    const repo = new ManuscriptRepository(db);
    const ms = repo.create('بحث التفسير والحديث', 'research');
    const doc = repo.createDocument(ms.id, 'الفصل الأول');

    // Create quote payload
    const quote = createBookQuotePayload({
      book: { id: 'tafsir-tabari', title: 'تفسير الطبري' },
      text: 'القول في تأويل قوله تعالى',
      page: 25,
    });

    const inserted = insertBlockIntoManuscriptSnapshot(doc.snapshot, quote.kind, quote.props, 'end');
    const saved = repo.save({ id: doc.id, snapshot: inserted.snapshot });

    assert.equal(saved.id, doc.id);
    const links = db.prepare('SELECT * FROM manuscript_link WHERE document_id=?').all(doc.id) as any[];
    assert.equal(links.length, 1);
    assert.equal(links[0].target_scheme, 'book');
    assert.equal(links[0].target_id, 'tafsir-tabari#p=25');

    // Search FTS
    const fts = repo.search('تأويل', ms.id);
    assert.equal(fts.length, 1);
    assert.equal(fts[0].id, doc.id);
  } finally {
    db.close();
  }
});

test('pickDefaultId keeps the last used id only while it still exists', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  assert.equal(pickDefaultId(items, 'b'), 'b');
  assert.equal(pickDefaultId(items, 'gone'), 'a');
  assert.equal(pickDefaultId(items, null), 'a');
  assert.equal(pickDefaultId([], 'b'), '');
});

test('sendPayloadToDocument appends the source block at the end of the chapter and saves once', async () => {
  const start = initialManuscriptSnapshot('doc-1', 'الفصل الأول');
  const saved: { id: string; snapshot: string }[] = [];
  const api = { document: async (id: string) => ({ id, snapshot: start }), save: async (input: { id: string; snapshot: string }) => { saved.push(input); return input; } };
  const payload = createQuranAyahPayload({ profile: 'hafs', surah: 2, ayah: 255, surahName: 'البقرة', text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ' });
  const blockId = await sendPayloadToDocument(api, 'doc-1', payload);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, 'doc-1');
  assert.ok(saved[0].snapshot.includes(blockId));
  assert.ok(saved[0].snapshot.includes('quran:hafs:2:255'));
  assert.ok(deriveManuscriptSnapshot(saved[0].snapshot).links.some(link => link.target_scheme === 'quran'));
});

test('the chapter open in the editor is reported so the picker can refuse it', () => {
  setOpenManuscriptDocument('doc-open');
  assert.equal(isManuscriptDocumentOpen('doc-open'), true);
  assert.equal(isManuscriptDocumentOpen('doc-other'), false);
  setOpenManuscriptDocument(null);
  assert.equal(isManuscriptDocumentOpen('doc-open'), false);
});
