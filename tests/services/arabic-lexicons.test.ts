/**
 * KEY-413 unit tests: Arabic Lexicons pack importer, reader, root families,
 * Buckwalter AraMorph ("Direct") analyzer, and KEY-400 root-card preference.
 *
 * Uses small fixtures generated inside the test (a tiny SQLite file with the same
 * 10 table shapes + ghani_words, and tiny AraMorph files with real-format lines),
 * zipped with fflate into a nested-zip archive. Never touches or commits the real pack.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { zipSync, strToU8 } from 'fflate';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { DictionaryService } from '../../src/main/services/dictionary/dictionary.service';
import {
  cleanArabicLexiconMeaning,
  getWhitelistedTableName,
  validateArabicLexiconsDatabase,
} from '../../src/main/services/dictionary/arabic-lexicons';
import {
  AraMorphAnalyzer,
  arabicToBuckwalterSkeleton,
  buckwalterToArabic,
} from '../../src/main/services/dictionary/aramorph';
import {
  LexiconDeckService,
  validateRootCardInput,
} from '../../src/main/services/lexicon-decks';

const TINY_DICT_PREFIXES = `; Tiny dictPrefixes fixture
\t\tPref-0\t
w\twa\tPref-Wa\tand <pos>wa/CONJ+</pos>
b\tbi\tNPref-Bi\tby;with <pos>bi/PREP+</pos>
wb\twabi\tNPref-Bi\tand + by/with <pos>wa/CONJ+bi/PREP+</pos>
Al\tAl\tNPref-Al\tthe <pos>Al/DET+</pos>
bAl\tbiAl\tNPref-BiAl\twith/by + the <pos>bi/PREP+Al/DET+</pos>
wbAl\twabiAl\tNPref-BiAl\tand + with/by the <pos>wa/CONJ+bi/PREP+Al/DET+</pos>
`;

const TINY_DICT_STEMS = `; Tiny dictStems fixture
;--- ktb
;; katab-u_1
ktb\tkatab\tPV\twrite
ktb\tkutib\tPV_Pass\tbe written
;; kitAb_1
ktAb\tkitAb\tNdu\tbook
ktb\tkutub\tN\tbooks
;--- rHm
;; raHomap_1
rHm\traHom\tNap\tcompassion;mercy
;--- gfr
;; {isotagofar_1
<stgf\t{isotagofar\tPV\tbeg forgiveness;apologize
Astgfr\t{isotagofar\tPV\tbeg forgiveness;apologize
`;

const TINY_DICT_SUFFIXES = `; Tiny dictSuffixes fixture
\t\tSuff-0\t
\ta\tPVSuff-a\the/it <verb> <pos>+a/PVSUFF_SUBJ:3MS</pos>
p\tap\tNSuff-ap\t[fem.sg.] <pos>+ap/NSUFF_FEM_SG</pos>
`;

const TINY_TABLE_AB = `; Tiny tableAB
Pref-0 PV
Pref-0 PV_Pass
Pref-0 Ndu
Pref-0 N
Pref-0 Nap
NPref-Al Ndu
NPref-Al N
NPref-BiAl Ndu
NPref-BiAl N
`;

const TINY_TABLE_AC = `; Tiny tableAC
Pref-0 Suff-0
Pref-0 PVSuff-a
Pref-0 NSuff-ap
NPref-Al Suff-0
NPref-BiAl Suff-0
`;

const TINY_TABLE_BC = `; Tiny tableBC
PV PVSuff-a
PV_Pass PVSuff-a
Ndu Suff-0
N Suff-0
Nap NSuff-ap
`;

function buildTinySqliteBytes(tempDir: string): Uint8Array {
  const dbFile = path.join(tempDir, 'fixture-src.sqlite');
  const db = new Database(dbFile);

  db.exec(`
    CREATE TABLE lisanularab (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT, meanings TEXT);
    CREATE TABLE mujamul_shihah (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT, meanings TEXT);
    CREATE TABLE maqayeesul_luga (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT, meanings TEXT);
    CREATE TABLE mujamul_muhith (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT, meanings TEXT);
    CREATE TABLE mujamul_wasith (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT, meanings TEXT);
    CREATE TABLE mujamul_muashiroh (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT, meanings TEXT);
    CREATE TABLE mufradat_alfajul_quran (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT, meanings TEXT);
    CREATE TABLE ghani (
      id INTEGER PRIMARY KEY,
      word TEXT NOT NULL,
      root_id INTEGER,
      root_secondary_id INTEGER,
      meanings TEXT NOT NULL
    );
    CREATE TABLE ghani_words (
      word TEXT NOT NULL,
      word_id INTEGER NOT NULL,
      is_root INTEGER NOT NULL,
      PRIMARY KEY (word, word_id)
    ) WITHOUT ROWID;
    CREATE TABLE hanswehr (
      id INTEGER PRIMARY KEY,
      is_root BOOL,
      parent_id INTEGER,
      word TEXT,
      meanings TEXT
    );
    CREATE TABLE lanelexcon (
      id INTEGER PRIMARY KEY,
      is_root BOOL,
      parent_id INTEGER,
      word TEXT,
      meanings TEXT
    );
  `);

  db.prepare(`INSERT INTO lisanularab (id, word, meanings) VALUES (?, ?, ?)`).run(
    1,
    'كتب',
    'كتب: الكِتابُ: مَعْرُوفٌ|كَتَبَ الشيءَ يَكْتُبه كَتْباً'
  );
  db.prepare(`INSERT INTO lisanularab (id, word, meanings) VALUES (?, ?, ?)`).run(
    2,
    'رحم',
    'رحم: الرَّحْمة: الرِّقَّةُ والتَّعَطُّفُ|وَقَدْ رَحِمْتُهُ'
  );

  db.prepare(`INSERT INTO mujamul_shihah (id, word, meanings) VALUES (?, ?, ?)`).run(
    1,
    'كتب',
    'الكتاب معروف.|وقد كتبْتُ كَتْباً.'
  );

  db.prepare(`INSERT INTO maqayeesul_luga (id, word, meanings) VALUES (?, ?, ?)`).run(
    1,
    'كتب',
    '(كَتَبَ) الْكَافُ وَالتَّاءُ وَالْبَاءُ أَصْلٌ صَحِيحٌ وَاحِدٌ يَدُلُّ عَلَى جَمْعِ شَيْءٍ إِلَى شَيْءٍ.'
  );

  db.prepare(`INSERT INTO mujamul_muhith (id, word, meanings) VALUES (?, ?, ?)`).run(
    1,
    'كتب',
    'كَتَبَهُ كَتْباً وكِتَاباً: خَطَّهُ.'
  );

  db.prepare(`INSERT INTO mujamul_wasith (id, word, meanings) VALUES (?, ?, ?)`).run(
    1,
    'كتب',
    '(كَتَبَ) الكتابَ: خطَّهُ.<br>فهو كاتبٌ.'
  );

  db.prepare(`INSERT INTO mujamul_muashiroh (id, word, meanings) VALUES (?, ?, ?)`).run(
    1,
    'كتب',
    'كتَبَ يَكتُب، كَتْبًا وكِتابةً<br>• كتَب الرِّسالةَ: خطَّها.'
  );

  db.prepare(`INSERT INTO mufradat_alfajul_quran (id, word, meanings) VALUES (?, ?, ?)`).run(
    1,
    'كتب',
    'الْكَتْبُ: ضمّ أديم إلى أديم، نحو قوله تعالى: ﴿كُتِبَ عَلَيْكُمُ الصِّيَامُ﴾|والمكتوبُ: المفروض.'
  );

  // Ghani + ghani_words with shared root_id = 77
  db.prepare(`INSERT INTO ghani (id, word, root_id, root_secondary_id, meanings) VALUES (?, ?, ?, NULL, ?)`).run(
    10,
    'كتب',
    77,
    'كَتَبَ - [ك ت ب].\n1. "كَتَبَ رِسَالَةً": خَطَّهَا.'
  );
  db.prepare(`INSERT INTO ghani (id, word, root_id, root_secondary_id, meanings) VALUES (?, ?, ?, NULL, ?)`).run(
    11,
    'كتاب',
    77,
    'كِتَابٌ - ج: كُتُبٌ. [ك ت ب]. صُحُفٌ مَجْمُوعَةٌ.'
  );
  db.prepare(`INSERT INTO ghani (id, word, root_id, root_secondary_id, meanings) VALUES (?, ?, ?, NULL, ?)`).run(
    12,
    'مكتبة',
    77,
    'مَكْتَبَةٌ - [ك ت ب]. دَارُ الكُتُبِ.'
  );
  db.prepare(`INSERT INTO ghani_words (word, word_id, is_root) VALUES (?, ?, ?)`).run('كتب', 10, 1);
  db.prepare(`INSERT INTO ghani_words (word, word_id, is_root) VALUES (?, ?, ?)`).run('كتب', 11, 1);
  db.prepare(`INSERT INTO ghani_words (word, word_id, is_root) VALUES (?, ?, ?)`).run('كتب', 12, 1);
  db.prepare(`INSERT INTO ghani_words (word, word_id, is_root) VALUES (?, ?, ?)`).run('كتاب', 11, 0);
  db.prepare(`INSERT INTO ghani_words (word, word_id, is_root) VALUES (?, ?, ?)`).run('مكتبة', 12, 0);

  // Hans Wehr: root entry (is_root=1, parent_id=500) + child entries (is_root=0, parent_id=500)
  db.prepare(`INSERT INTO hanswehr (id, is_root, parent_id, word, meanings) VALUES (?, ?, ?, ?, ?)`).run(
    100,
    1,
    500,
    'كتب',
    'كتب kataba u (katb, كتابة kitāba) to write │ كتب اليه ان to write to s.o. that'
  );
  db.prepare(`INSERT INTO hanswehr (id, is_root, parent_id, word, meanings) VALUES (?, ?, ?, ?, ?)`).run(
    101,
    0,
    500,
    'كتاب',
    'كتاب kitāb pl. كتب kutub piece of writing; book'
  );
  db.prepare(`INSERT INTO hanswehr (id, is_root, parent_id, word, meanings) VALUES (?, ?, ?, ?, ?)`).run(
    102,
    0,
    500,
    'كاتب',
    'كاتب kātib pl. كتاب kuttāb writer; author; scribe'
  );

  // Lane's Lexicon: root entry (id=300, is_root=1, parent_id=300) + children
  db.prepare(`INSERT INTO lanelexcon (id, is_root, parent_id, word, meanings) VALUES (?, ?, ?, ?, ?)`).run(
    300,
    1,
    300,
    'كتب',
    'كتب'
  );
  db.prepare(`INSERT INTO lanelexcon (id, is_root, parent_id, word, meanings) VALUES (?, ?, ?, ?, ?)`).run(
    301,
    0,
    300,
    'كتبه',
    'كَتَبَهُ <i>He wrote it</i>, with ascriptive &amp; canonical notes.'
  );
  db.prepare(`INSERT INTO lanelexcon (id, is_root, parent_id, word, meanings) VALUES (?, ?, ?, ?, ?)`).run(
    302,
    0,
    300,
    'كتاب',
    'كِتَابٌ <i>A book</i> or <i>writing</i>.'
  );

  db.close();
  const bytes = fs.readFileSync(dbFile);
  fs.unlinkSync(dbFile);
  return bytes;
}

function buildNestedRepoZip(tempDir: string): string {
  const sqliteBytes = buildTinySqliteBytes(tempDir);
  const innerDbZip = zipSync({
    'db.sqlite': sqliteBytes,
  });

  const outerZip = zipSync({
    'arabic_lexicons-main/assets/data/db/db.sqlite.zip': innerDbZip,
    'arabic_lexicons-main/assets/data/db/Sources.md': strToU8('# Data Sources\nLisān al-ʿArab\n'),
    'arabic_lexicons-main/assets/data/ar_en/dictprefixes': strToU8(TINY_DICT_PREFIXES),
    'arabic_lexicons-main/assets/data/ar_en/dictstems': strToU8(TINY_DICT_STEMS),
    'arabic_lexicons-main/assets/data/ar_en/dictsuffixes': strToU8(TINY_DICT_SUFFIXES),
    'arabic_lexicons-main/assets/data/ar_en/tableab': strToU8(TINY_TABLE_AB),
    'arabic_lexicons-main/assets/data/ar_en/tableac': strToU8(TINY_TABLE_AC),
    'arabic_lexicons-main/assets/data/ar_en/tablebc': strToU8(TINY_TABLE_BC),
    'arabic_lexicons-main/assets/data/ar_en/GPL.redistributable.txt': strToU8('GPL v2 AraMorph data'),
  });

  const zipPath = path.join(tempDir, 'arabic_lexicons-main.zip');
  fs.writeFileSync(zipPath, outerZip);
  return zipPath;
}

test('Table whitelist: known lexicon IDs resolve to fixed table names and unknown IDs are refused', () => {
  assert.equal(getWhitelistedTableName('arlex-lisan'), 'lisanularab');
  assert.equal(getWhitelistedTableName('arlex-maqayis'), 'maqayeesul_luga');
  assert.equal(getWhitelistedTableName('arlex-ghani'), 'ghani');
  assert.equal(getWhitelistedTableName('arlex-hanswehr'), 'hanswehr');
  assert.equal(getWhitelistedTableName('arlex-lane'), 'lanelexcon');

  assert.throws(() => getWhitelistedTableName('arlex-unknown'), /invalid-dictionary-id/u);
  assert.throws(() => getWhitelistedTableName('lisanularab; DROP TABLE work;'), /invalid-dictionary-id/u);
  assert.throws(() => getWhitelistedTableName('__proto__'), /invalid-dictionary-id/u);
});

test('Meaning clean-up rules: turns |, │, <br> and \\n into line breaks, keeps diacritics and ﴿ayah﴾ quotes, and escapes HTML', () => {
  // Lisan / Sihah pipe separator
  const lisan = cleanArabicLexiconMeaning('الرَّحْمة: الرِّقَّةُ والتَّعَطُّفُ|وَقَدْ رَحِمْتُهُ');
  assert.equal(lisan.text, 'الرَّحْمة: الرِّقَّةُ والتَّعَطُّفُ\nوَقَدْ رَحِمْتُهُ');
  assert.equal(lisan.html, 'الرَّحْمة: الرِّقَّةُ والتَّعَطُّفُ<br>وَقَدْ رَحِمْتُهُ');

  // Hans Wehr box-drawing vertical bar │
  const hans = cleanArabicLexiconMeaning('رحمة raḥma pity, compassion │ كان تحت رحمته to be at s.o. mercy');
  assert.equal(hans.text, 'رحمة raḥma pity, compassion\nكان تحت رحمته to be at s.o. mercy');
  assert.equal(hans.html, 'رحمة raḥma pity, compassion<br>كان تحت رحمته to be at s.o. mercy');

  // Al-Wasit <br> and Mufradat ﴿ayah﴾ quotes
  const mufradat = cleanArabicLexiconMeaning(
    'الْكَتْبُ: ضمّ أديم إلى أديم<br>نحو قوله تعالى: ﴿كُتِبَ عَلَيْكُمُ الصِّيَامُ﴾|والمكتوبُ: المفروض.'
  );
  assert.ok(mufradat.text.includes('﴿كُتِبَ عَلَيْكُمُ الصِّيَامُ﴾'), 'preserves Quranic brackets and harakat');
  assert.equal(mufradat.html.split('<br>').length, 3);

  // Never injects raw HTML (e.g. script or Lane <i> tags)
  const dangerous = cleanArabicLexiconMeaning('<i>He wrote it</i> <script>alert(1)</script>');
  assert.ok(!dangerous.html.includes('<script>'), 'script tags stripped/escaped');
  assert.ok(!dangerous.html.includes('<i>'), 'raw <i> tags stripped');
  assert.ok(dangerous.text.includes('He wrote it'));
});

test('Buckwalter AraMorph analyzer: parses prefix + stem + suffix (وبالكتاب -> wa + bi + Al + kitAb, "book") under 50ms', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-aramorph-test-'));
  try {
    fs.writeFileSync(path.join(tempDir, 'dictprefixes'), TINY_DICT_PREFIXES, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'dictstems'), TINY_DICT_STEMS, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'dictsuffixes'), TINY_DICT_SUFFIXES, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'tableab'), TINY_TABLE_AB, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'tableac'), TINY_TABLE_AC, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'tablebc'), TINY_TABLE_BC, 'utf8');

    assert.equal(arabicToBuckwalterSkeleton('وَبِالْكِتَابِ'), 'wbAlktAb');
    assert.equal(buckwalterToArabic('wabiAlkitAb'), 'وَبِالكِتاب');

    const analyzer = new AraMorphAnalyzer(tempDir);
    assert.equal(analyzer.isAvailable, true);

    const t0 = performance.now();
    const solutions = analyzer.analyze('وبالكتاب');
    const elapsedMs = performance.now() - t0;

    assert.ok(elapsedMs < 50, `AraMorph lookup took ${elapsedMs.toFixed(2)}ms (< 50ms)`);
    assert.ok(solutions.length >= 1, 'found morphological solution for وبالكتاب');

    const bookSol = solutions.find((s) => s.stemBuckwalter === 'kitAb');
    assert.ok(bookSol, 'matched prefix wabiAl + stem kitAb + null suffix');
    assert.equal(bookSol.prefixBuckwalter, 'wabiAl');
    assert.equal(bookSol.stemBuckwalter, 'kitAb');
    assert.equal(bookSol.suffixBuckwalter, '');
    assert.equal(bookSol.vocalizedArabic, 'وَبِالكِتاب');
    assert.equal(bookSol.lemmaArabic, 'كِتاب');
    assert.ok(bookSol.stemGloss.includes('book'));
    assert.ok(bookSol.pos.includes('wa/CONJ+bi/PREP+Al/DET+'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Stage 1-3: import from nested-zip fixture, refuse invalid pack, lookup & rootFamily, idempotent re-import, and removal', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-key413-test-'));
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);

  const packRootDir = path.join(tempDir, 'userData', 'dictionaries', 'arabic-lexicons');
  const dictService = new DictionaryService(db, packRootDir);

  try {
    // 1. Refuse an invalid pack (missing required tables)
    const badDbPath = path.join(tempDir, 'bad.sqlite');
    const badDb = new Database(badDbPath);
    badDb.exec(`CREATE TABLE some_other_table (id INTEGER PRIMARY KEY, word TEXT);`);
    badDb.close();

    assert.throws(() => validateArabicLexiconsDatabase(badDbPath), /invalid-pack/u);
    await assert.rejects(
      () => dictService.importArabicLexiconsPack({ sourcePath: badDbPath }),
      /invalid-pack/u
    );

    // Seed a non-pack user dictionary to verify re-import leaves it untouched
    db.prepare(
      `INSERT INTO dictionaries (id, title, format, source_path, source_lang, target_lang, entry_count, is_enabled, created_at)
       VALUES ('user-custom-dict', 'My Custom Dict', 'stardict', '/fake/custom.ifo', 'ar', 'en', 42, 1, '2026-11-18T00:00:00.000Z')`
    ).run();

    // 2. Import from nested-zip fixture made with fflate
    const zipPath = buildNestedRepoZip(tempDir);
    const stages: string[] = [];
    const imported = await dictService.importArabicLexiconsPack({
      sourcePath: zipPath,
      lang: 'en',
      onProgress: (p) => stages.push(p.stage),
    });

    assert.equal(imported.length, 11, 'registers 10 SQLite lexicons + 1 Direct analyzer = 11 dictionaries');
    assert.ok(stages.includes('indexing') && stages.includes('done'));

    const allDicts = dictService.listDictionaries('en');
    assert.equal(allDicts.length, 12, '11 pack dictionaries + 1 existing user dictionary');

    const lisan = allDicts.find((d) => d.id === 'arlex-lisan');
    assert.ok(lisan);
    assert.equal(lisan.title, 'Lisān al-ʿArab');
    assert.equal(lisan.attribution, 'Ibn Manẓūr (d. 711 AH / 1311 CE)');
    assert.equal(lisan.entryCount, 2);

    // 3. Lookup across the pack (including inflected ghani_words form "مكتبة" and Direct "وبالكتاب")
    const ktbRes = await dictService.lookup('كتب', { lang: 'ar', uiLang: 'en', includeWikipedia: false });
    assert.ok(ktbRes.entries.length >= 10, 'finds كتب across the SQLite lexicons and Direct');

    const maktabaRes = await dictService.lookup('مكتبة', { lang: 'ar', uiLang: 'ar', includeWikipedia: false });
    const ghaniMatch = maktabaRes.entries.find((e) => e.dictId === 'arlex-ghani');
    assert.ok(ghaniMatch, 'al-Ghani finds inflected form via ghani_words -> word_id');
    assert.ok(ghaniMatch.definitionText.includes('دَارُ الكُتُبِ'));

    const directRes = await dictService.lookup('وبالكتاب', { lang: 'ar', uiLang: 'en', includeWikipedia: false });
    const directMatch = directRes.entries.find((e) => e.dictId === 'arlex-direct');
    assert.ok(directMatch, 'Direct analyzer matches وبالكتاب');
    assert.ok(directMatch.definitionText.includes('book'));

    // 4. Root family for Hans Wehr/Lane and al-Ghani shapes
    const hansFamily = dictService.rootFamily('arlex-hanswehr', 101);
    assert.ok(hansFamily, 'Hans Wehr root family returned');
    assert.equal(hansFamily.rootWord, 'كتب');
    assert.deepEqual(
      hansFamily.members.map((m) => m.word),
      ['كتب', 'كتاب', 'كاتب']
    );

    const laneFamily = dictService.rootFamily('arlex-lane', 301);
    assert.ok(laneFamily, 'Lane root family returned');
    assert.equal(laneFamily.rootWord, 'كتب');
    assert.ok(laneFamily.members.some((m) => m.word === 'كتاب'));

    const ghaniFamily = dictService.rootFamily('arlex-ghani', 11);
    assert.ok(ghaniFamily, 'al-Ghani root family returned');
    assert.equal(ghaniFamily.rootWord, 'كتب');
    assert.deepEqual(
      ghaniFamily.members.map((m) => m.word),
      ['كتب', 'كتاب', 'مكتبة']
    );

    // 5. Idempotent re-import replaces arlex-* rows only and preserves user-custom-dict
    const reimported = await dictService.importArabicLexiconsPack({
      sourcePath: zipPath,
      lang: 'ar',
    });
    assert.equal(reimported.length, 11);
    const afterReimport = dictService.listDictionaries('ar');
    assert.equal(afterReimport.length, 12, 'no duplicate arlex-* rows after re-import');
    assert.ok(afterReimport.some((d) => d.id === 'user-custom-dict'), 'other user dictionary preserved');

    // 6. Removing the pack deletes arlex-* rows and folder while leaving user-custom-dict intact
    const removed = dictService.removeArabicLexiconsPack();
    assert.equal(removed, true);
    assert.equal(fs.existsSync(packRootDir), false, 'pack folder removed');
    const remaining = dictService.listDictionaries('ar');
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0]!.id, 'user-custom-dict');
  } finally {
    dictService.close();
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('KEY-400 root-card preference: prefers Maqāyīs al-Lugha first, then Lisān al-ʿArab when a root appears in multiple lexicons', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-key413-rootpref-'));
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);

  const packRootDir = path.join(tempDir, 'userData', 'dictionaries', 'arabic-lexicons');
  const dictService = new DictionaryService(db, packRootDir);

  try {
    const zipPath = buildNestedRepoZip(tempDir);
    await dictService.importArabicLexiconsPack({ sourcePath: zipPath, lang: 'ar' });

    const lexiconDecks = new LexiconDeckService(db, {
      listDictionaries: () => dictService.listDictionaries('ar'),
      readEntry: (d, hw) => dictService.readEntry(d, hw),
      lookupDictionary: async (w, opts) =>
        (await dictService.lookup(w, { ...opts, uiLang: 'ar', includeWikipedia: false })).entries,
      quranFrequency: async () => ({ family: 'root', total: 1, distinct: 1, rows: [] }),
      quranRootWords: async (root) => ({
        root,
        total: 319,
        words: [{ word: 'كِتَٰبٌ', count: 260, meaning: 'book' }],
      }),
    });

    // Root ك-ت-ب exists in Maqayis, Lisan, Sihah, Muhit, Wasit, Muasir, Mufradat, Ghani -> Maqayis must win
    const ktbCard = await lexiconDecks.makeRootCard(
      validateRootCardInput({ root: 'ك ت ب', language: 'ar' })
    );
    assert.equal(ktbCard.hasLexiconSource, true);
    const ktbRow = db
      .prepare(`SELECT fields_json FROM card_note WHERE id = ?`)
      .get(ktbCard.noteId) as { fields_json: string };
    const ktbFields = JSON.parse(ktbRow.fields_json) as { Front: string; Back: string };
    assert.ok(ktbFields.Back.includes('مقاييس اللغة'), 'prefers Maqāyīs al-Lugha when available');
    assert.ok(ktbFields.Back.includes('أَصْلٌ صَحِيحٌ وَاحِدٌ يَدُلُّ عَلَى جَمْعِ شَيْءٍ'));

    // Root ر-ح-م in the tiny fixture exists only in Lisan al-Arab -> Lisan wins
    const rhmCard = await lexiconDecks.makeRootCard(
      validateRootCardInput({ root: 'ر ح م', language: 'ar' })
    );
    assert.equal(rhmCard.hasLexiconSource, true);
    const rhmRow = db
      .prepare(`SELECT fields_json FROM card_note WHERE id = ?`)
      .get(rhmCard.noteId) as { fields_json: string };
    const rhmFields = JSON.parse(rhmRow.fields_json) as { Front: string; Back: string };
    assert.ok(rhmFields.Back.includes('لسان العرب'), 'falls back to Lisān al-ʿArab when Maqāyīs has no entry');
    assert.ok(rhmFields.Back.includes('الرِّقَّةُ والتَّعَطُّفُ'));
  } finally {
    dictService.close();
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
