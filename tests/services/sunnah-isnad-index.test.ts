import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import { SunnahResearchCorpus } from '../../src/main/services/sunnah/research-corpus';

test('KEY-359: Sunnah search index with isnad included and zero in-memory warmup', async (t) => {
  const dbPath = join(tmpdir(), `sunnah-key359-${Date.now()}.sqlite`);
  t.after(() => {
    if (existsSync(dbPath)) {
      try { unlinkSync(dbPath); } catch { /* ignore */ }
    }
  });

  const fields = [
    'book_key', 'Chapter_Number', 'Chapter_Arabic', 'Chapter_English',
    'Section_Number', 'Section_Arabic', 'Section_English', 'Hadith_number',
    'Arabic_Hadith', 'Arabic_Isnad', 'Arabic_Matn', 'English_Hadith',
    'English_Isnad', 'English_Matn', 'Arabic_Comment', 'Arabic_Grade',
    'English_Grade', 'Arabic_Tafseel', 'Commentary_Book_Title',
    'Commentary_Author', 'Source_Row_Reference', 'Shamela_Volume',
    'Shamela_Page', 'Commentary_Shamela_URL', 'Tafseel_Match_Method',
    'Tafseel_Match_Score', 'Itqan_Narrator_Chain_JSON',
    'Itqan_Quran_Root_Links_JSON', 'Itqan_Linked_Ayah_Keys_JSON',
    'Itqan_Chain_Calibration_Score', 'Itqan_Weakest_Narrator_Grade',
    'Itqan_Corroborating_Hadiths_JSON'
  ];

  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE hadiths(id INTEGER PRIMARY KEY, ${fields.map(f => `${f} TEXT`).join(',')});
    CREATE TABLE hadith_narrators(hadith_id INTEGER, rijal_id TEXT);
    CREATE TABLE quran_hadith_root_bridge(hadith_id INTEGER, root_ar TEXT);
    CREATE VIRTUAL TABLE hadiths_fts USING fts5(
      book_key UNINDEXED,
      Hadith_number UNINDEXED,
      Chapter_Arabic,
      Section_Arabic,
      Arabic_Matn_Norm,
      Arabic_Isnad_Norm,
      Arabic_Tafseel_Norm,
      English_Hadith,
      tokenize='unicode61'
    );
  `);

  // Hadith 1: Bukhari 1 - الحميدي in isnad, الأعمال بالنيات in matn
  const h1 = Object.fromEntries(fields.map(f => [f, '']));
  Object.assign(h1, {
    book_key: 'Bukhari',
    Chapter_Number: '1',
    Chapter_Arabic: 'كتاب بدء الوحي',
    Chapter_English: 'Revelation',
    Hadith_number: '1',
    Arabic_Hadith: 'حَدَّثَنَا الْحُمَيْدِيُّ ... إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ',
    Arabic_Isnad: 'حَدَّثَنَا الْحُمَيْدِيُّ عَبْدُ اللَّهِ بْنُ الزُّبَيْرِ',
    Arabic_Matn: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى',
    Arabic_Tafseel: 'شرح محقق',
    Itqan_Narrator_Chain_JSON: '[]',
    Itqan_Quran_Root_Links_JSON: '[]'
  });
  db.prepare(`INSERT INTO hadiths VALUES (1, ${fields.map(() => '?').join(',')})`).run(...fields.map(f => h1[f]));
  db.prepare(`
    INSERT INTO hadiths_fts(rowid, book_key, Hadith_number, Chapter_Arabic, Section_Arabic, Arabic_Matn_Norm, Arabic_Isnad_Norm, Arabic_Tafseel_Norm, English_Hadith)
    VALUES (1, 'Bukhari', '1', 'كتاب بدء الوحي', '', 'انما الاعمال بالنيات وانما لكل امرء ما نوي', 'حدثنا الحميدي عبد الله بن الزبير', 'شرح محقق', '')
  `).run();

  // Hadith 2: Muslim 1907 - Matn match for الأعمال بالنيات, different isnad
  const h2 = Object.fromEntries(fields.map(f => [f, '']));
  Object.assign(h2, {
    book_key: 'Muslim',
    Chapter_Number: '33',
    Chapter_Arabic: 'كتاب الإمارة',
    Chapter_English: 'Leadership',
    Hadith_number: '1907',
    Arabic_Hadith: 'حَدَّثَنَا مُحَمَّدُ بْنُ رُمْحٍ ... إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ',
    Arabic_Isnad: 'حَدَّثَنَا مُحَمَّدُ بْنُ رُمْحٍ',
    Arabic_Matn: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ',
    Arabic_Tafseel: 'شرح محقق',
    Itqan_Narrator_Chain_JSON: '[]',
    Itqan_Quran_Root_Links_JSON: '[]'
  });
  db.prepare(`INSERT INTO hadiths VALUES (2, ${fields.map(() => '?').join(',')})`).run(...fields.map(f => h2[f]));
  db.prepare(`
    INSERT INTO hadiths_fts(rowid, book_key, Hadith_number, Chapter_Arabic, Section_Arabic, Arabic_Matn_Norm, Arabic_Isnad_Norm, Arabic_Tafseel_Norm, English_Hadith)
    VALUES (2, 'Muslim', '1907', 'كتاب الاماره', '', 'انما الاعمال بالنيات', 'حدثنا محمد بن رمح', 'شرح محقق', '')
  `).run();

  // Hadith 3: Bukhari 1596 - قتيبة and الليث in isnad, بلالا in matn
  const h3 = Object.fromEntries(fields.map(f => [f, '']));
  Object.assign(h3, {
    book_key: 'Bukhari',
    Chapter_Number: '25',
    Chapter_Arabic: 'كتاب الحج',
    Chapter_English: 'Hajj',
    Hadith_number: '1596',
    Arabic_Hadith: 'حَدَّثَنَا قُتَيْبَةُ ... فَلَقِيتُ بِلاَلاً',
    Arabic_Isnad: 'حَدَّثَنَا قُتَيْبَةُ بْنُ سَعِيدٍ، حَدَّثَنَا اللَّيْثُ',
    Arabic_Matn: 'دَخَلَ رَسُولُ اللَّهِ ... فَلَقِيتُ بِلاَلاً فَسَأَلْتُهُ',
    Arabic_Tafseel: 'شرح محقق',
    Itqan_Narrator_Chain_JSON: '[]',
    Itqan_Quran_Root_Links_JSON: '[]'
  });
  db.prepare(`INSERT INTO hadiths VALUES (3, ${fields.map(() => '?').join(',')})`).run(...fields.map(f => h3[f]));
  db.prepare(`
    INSERT INTO hadiths_fts(rowid, book_key, Hadith_number, Chapter_Arabic, Section_Arabic, Arabic_Matn_Norm, Arabic_Isnad_Norm, Arabic_Tafseel_Norm, English_Hadith)
    VALUES (3, 'Bukhari', '1596', 'كتاب الحج', '', 'دخل رسول الله فلقيت بلالا فسالته', 'حدثنا قتيبه بن سعيد حدثنا الليث', 'شرح محقق', '')
  `).run();

  // Hadith 4: Tirmidhi - Matn has قتيبة as part of the matn text
  const h4 = Object.fromEntries(fields.map(f => [f, '']));
  Object.assign(h4, {
    book_key: 'Tirmidhi',
    Chapter_Number: '1',
    Chapter_Arabic: 'كتاب الطهارة',
    Chapter_English: 'Purification',
    Hadith_number: '50',
    Arabic_Hadith: 'قال قتيبة في متنه كذا',
    Arabic_Isnad: 'حدثنا شيخ اخر',
    Arabic_Matn: 'قال قتيبة كذا',
    Arabic_Tafseel: '',
    Itqan_Narrator_Chain_JSON: '[]',
    Itqan_Quran_Root_Links_JSON: '[]'
  });
  db.prepare(`INSERT INTO hadiths VALUES (4, ${fields.map(() => '?').join(',')})`).run(...fields.map(f => h4[f]));
  db.prepare(`
    INSERT INTO hadiths_fts(rowid, book_key, Hadith_number, Chapter_Arabic, Section_Arabic, Arabic_Matn_Norm, Arabic_Isnad_Norm, Arabic_Tafseel_Norm, English_Hadith)
    VALUES (4, 'Tirmidhi', '50', 'كتاب الطهاره', '', 'قال قتيبه كذا', 'حدثنا شيخ اخر', '', '')
  `).run();

  db.close();

  const corpus = new SunnahResearchCorpus(dbPath);

  await t.test('finds isnad + matn query: الحميدي الأعمال بالنيات', () => {
    const hits = corpus.search({ text: 'الحميدي الأعمال بالنيات', requestId: 'test-1' });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].hadith.researchId, 1);
    assert.equal(hits[0].chapter.collection, 'Bukhari');
    assert.equal(hits[0].hadith.id, 'Bukhari:1:1');
  });

  await t.test('finds isnad + matn query: قتيبة الليث بلالا', () => {
    const hits = corpus.search({ text: 'قتيبة الليث بلالا', requestId: 'test-2' });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].hadith.researchId, 3);
    assert.equal(hits[0].chapter.collection, 'Bukhari');
    assert.equal(hits[0].hadith.id, 'Bukhari:25:1');
    assert.equal(hits[0].hadith.number, '1596');
  });

  await t.test('ranks matn matches before isnad matches for shared terms', () => {
    // Both Hadith 4 (matn match) and Hadith 3 (isnad match) contain "قتيبة"
    const hits = corpus.search({ text: 'قتيبة', requestId: 'test-rank' });
    assert.equal(hits.length, 2);
    // Hadith 4 has "قتيبة" in its matn -> must rank first!
    assert.equal(hits[0].hadith.researchId, 4, 'Matn match must rank first');
    // Hadith 3 has "قتيبة" in its isnad -> ranks second!
    assert.equal(hits[1].hadith.researchId, 3, 'Isnad match must rank second');
  });

  await t.test('Sunnah reader search without requestId does not return isnad-only matches', () => {
    const hits = corpus.search({ text: 'الليث' });
    // "الليث" is only in Hadith 3's isnad
    assert.equal(hits.length, 0, 'In-app reader search targets matn only');
  });

  await t.test('zero in-memory warmup: SunnahResearchCorpus has no prepareIsnadSearch or isnads array', () => {
    assert.equal((corpus as unknown as Record<string, unknown>).isnads, undefined);
    assert.equal((corpus as unknown as Record<string, unknown>).prepareIsnadSearch, undefined);
  });

  corpus.close();
});
