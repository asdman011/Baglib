import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { QuranReader, inlineTranslation, richText } from '../../src/main/services/quran/quran-reader';
import { presetResource, readerPresets } from '../../src/main/services/quran/reader-resources';
import type { QuranPack } from '../../src/shared/types/quran';

test('inline footnotes decode exactly once without executing HTML', () => {
  assert.deepEqual(inlineTranslation(JSON.stringify('Meaning [[first note]] and [[second note]].')), { text: 'Meaning  and .', notes: ['first note', 'second note'], anchors: [{ offset: 8, note: 1 }, { offset: 13, note: 2 }] });
  assert.deepEqual(inlineTranslation(JSON.stringify('Allāh[[one]][[two]]!')), { text: 'Allāh!', notes: ['one', 'two'], anchors: [{ offset: 5, note: 1 }, { offset: 5, note: 2 }] });
  assert.throws(() => inlineTranslation('plain text'));
  assert.throws(() => inlineTranslation('{"unexpected":true}'));
});

test('tafsir is converted into an inert rich-text tree', () => {
  const nodes = richText('<p onclick="alert(1)">نَصّ <b>bold</b><script>secret</script><img src="https://evil.test"><a href="javascript:alert(1)">link</a></p>');
  const encoded = JSON.stringify(nodes);
  assert.ok(encoded.includes('نَصّ'));
  assert.ok(encoded.includes('bold'));
  for (const value of ['onclick', 'secret', 'evil.test', 'javascript:', 'href']) assert.ok(!encoded.includes(value));
  assert.throws(() => richText('<div>'.repeat(70) + 'text' + '</div>'.repeat(70)));
});

test('reader uses immutable source packs, indexed search, explicit gaps and grouped commentary', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'baglib-quran-reader-'));
  const packs: QuranPack[] = [];
  const add = async (resource: string, sql: string) => {
    const preset = readerPresets.find(value => value.id === resource)!;
    const id = randomUUID();
    await mkdir(path.join(root, 'packs', id), { recursive: true });
    const filename = path.join(root, 'packs', id, '0.sqlite');
    const database = new Database(filename);
    database.exec(sql);
    database.close();
    const digest = createHash('sha256').update(await readFile(filename)).digest('hex');
    const pack: QuranPack = { id, digest, resource: presetResource(resource), bytes: 1, files: [{ name: preset.filename.replace(/\.zip$/, ''), bytes: 1, type: 'sqlite' }], installedAt: '', capability: 'stored' };
    packs.push(pack);
    return { id, filename, digest };
  };
  let reader: QuranReader | undefined;
  try {
    const script = await add('quran-script/312', `CREATE TABLE words(id INTEGER,location TEXT,surah INTEGER,ayah INTEGER,word INTEGER,text TEXT); INSERT INTO words VALUES (1,'1:1:1',1,1,1,'بِسۡمِ'),(2,'1:1:2',1,1,2,'ٱللَّهِ'),(3,'1:1:3',1,1,3,'١'),(4,'1:2:1',1,2,1,'الْحَمْدُ'),(5,'1:2:2',1,2,2,'٢'),(6,'2:181:4',2,181,4,'مَا');`);
    const translation = await add('translation/193', `CREATE TABLE translation(sura INTEGER,ayah INTEGER,ayah_key TEXT,text TEXT); INSERT INTO translation VALUES(1,1,'1:1','"Meaning [[note]]"');`);
    const meanings = await add('translation/92', `CREATE TABLE word_translation(surah_number INTEGER,ayah_number INTEGER,word_number TEXT,text TEXT); INSERT INTO word_translation VALUES(1,1,'1','In the name');`);
    const tafsir = await add('tafsir/22', `CREATE TABLE tafsir(ayah_key TEXT,group_ayah_key TEXT,from_ayah TEXT,to_ayah TEXT,ayah_keys TEXT,text TEXT); INSERT INTO tafsir VALUES('1:1','1:1','1:1','1:2','1:1,1:2','<p>تفسير <b>النص</b></p>'),('1:2','1:1','','','','');`);
    const warsh = await add('quran-script/qpc-warsh-script-wbw', `CREATE TABLE words(id INTEGER,location TEXT,surah INTEGER,ayah INTEGER,word INTEGER,text TEXT); INSERT INTO words VALUES(1,'1:1:1',1,1,1,'اِ۬لْحَمْدُ');`);
    reader = new QuranReader(root, packs);
    assert.equal(reader.catalog().sources.length, 5);
    const passage = await reader.read({ script: script.id, surah: 1, from: 1, translation: translation.id, meanings: meanings.id });
    const inspected = await reader.inspectAyah({ script: script.id, surah: 1, ayah: 1 });
    assert.equal(inspected.canonical, 'بِسۡمِ ٱللَّهِ ١');
    assert.equal(inspected.imlaey, null);
    await assert.rejects(reader.inspectAyah({ script: script.id, surah: 1, ayah: 99 }));
    assert.equal(passage.ayahs.length, 2);
    assert.equal(passage.ayahs[0].words[2].marker, true);
    assert.equal(passage.ayahs[0].words[0].meaning, 'In the name');
    assert.equal(passage.ayahs[0].words[1].meaning, undefined);
    assert.deepEqual(passage.ayahs[0].translation, { text: 'Meaning ', notes: ['note'], anchors: [{ offset: 8, note: 1 }] });
    assert.equal((await reader.search(script.id, 'بسم الله'))[0].ayah, 1);
    assert.equal((await reader.search(script.id, 'الحمد'))[0].ayah, 2);
    assert.equal((await reader.search(script.id, '" OR *')) .length, 0);
    const commentary = await reader.commentary({ script: script.id, pack: tafsir.id, surah: 1, ayah: 2 });
    assert.equal(commentary.from, '1:1'); assert.equal(commentary.to, '1:2');
    assert.ok(JSON.stringify(commentary.nodes).includes('تفسير'));
    const original = new Database(script.filename, { readonly: true });
    assert.equal(original.pragma('user_version', { simple: true }), 0);
    assert.equal((original.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name LIKE 'baglib_%'").get() as { count: number }).count, 0);
    original.close();
    assert.equal(createHash('sha256').update(await readFile(script.filename)).digest('hex'), script.digest);
    await assert.rejects(reader.read({ script: warsh.id, surah: 1, from: 1, translation: translation.id }));
    await assert.rejects(reader.commentary({ script: warsh.id, pack: tafsir.id, surah: 1, ayah: 1 }));
    await assert.rejects(reader.read({ script: '../outside', surah: 1, from: 1 }));
    await assert.rejects(reader.read({ script: script.id, surah: 0, from: 1 }));
  } finally { reader?.close(); assert.equal(path.dirname(root), path.resolve(tmpdir())); await rm(root, { recursive: true, force: true }); }
});

test('reader indexes SVG mushaf layout into derived database and supports page/ayah queries', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'baglib-quran-mushaf-'));
  const packs: QuranPack[] = [];
  const id = randomUUID();
  await mkdir(path.join(root, 'packs', id), { recursive: true });

  const svgContent1 = `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 382 547" xmlns="http://www.w3.org/2000/svg">
  <g id="md-page" data-page-number="001">
    <g id="w1" data-surah="001" data-aya="001" data-line-number="07" data-type="text" data-hafs="بِسۡمِ" data-imlaey="بسم" data-word-index-in-ayah="1"><path d="M0,0"/></g>
    <g id="w2" data-surah="001" data-aya="001" data-line-number="07" data-type="text" data-hafs="ٱللَّهِ" data-imlaey="الله" data-word-index-in-ayah="2"><path d="M1,1"/></g>
    <g id="m1" data-surah="001" data-aya="001" data-line-number="07" data-type="aya-mark"><path d="M2,2"/></g>
  </g>
</svg>`;

  const svgContent2 = `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 382 547" xmlns="http://www.w3.org/2000/svg">
  <g id="md-page" data-page-number="002">
    <g id="w3" data-surah="002" data-aya="001" data-line-number="08" data-type="text" data-hafs="الٓمٓ" data-imlaey="الم" data-word-index-in-ayah="1"><path d="M3,3"/></g>
    <g id="m2" data-surah="002" data-aya="001" data-line-number="08" data-type="aya-mark"><path d="M4,4"/></g>
  </g>
</svg>`;

  await writeFile(path.join(root, 'packs', id, '0.svg'), svgContent1, 'utf8');
  await writeFile(path.join(root, 'packs', id, '1.svg'), svgContent2, 'utf8');

  const digest = createHash('sha256').update(svgContent1 + svgContent2).digest('hex');
  const pack: QuranPack = {
    id,
    digest,
    resource: presetResource('mushaf-layout/569'),
    bytes: svgContent1.length + svgContent2.length,
    files: [
      { name: 'ligature-basd-svg/001.svg', bytes: svgContent1.length, type: 'svg' },
      { name: 'ligature-basd-svg/002.svg', bytes: svgContent2.length, type: 'svg' },
    ],
    installedAt: '',
    capability: 'stored',
  };
  packs.push(pack);

  let reader: QuranReader | undefined;
  try {
    reader = new QuranReader(root, packs);
    const catalog = reader.catalog();
    const mushafSource = catalog.sources.find(s => s.kind === 'mushaf-layout');
    assert.ok(mushafSource);
    assert.equal(mushafSource.profile, 'hafs');

    const page1 = await reader.mushafPage(id, 1);
    assert.equal(page1.pageNumber, 1);
    assert.equal(page1.surahStart, 1);
    assert.equal(page1.ayahStart, 1);
    assert.equal(page1.words.length, 3);
    assert.equal(page1.words[0].textHafs, 'بِسۡمِ');
    assert.equal(page1.words[0].imlaey, 'بسم');
    assert.equal(page1.words[2].type, 'aya-mark');

    const page2 = await reader.mushafPage(id, 2);
    assert.equal(page2.pageNumber, 2);
    assert.equal(page2.surahStart, 2);
    assert.equal(page2.ayahStart, 1);

    const lookup1 = await reader.mushafPageForAyah(id, 1, 1);
    assert.equal(lookup1.pageNumber, 1);

    const lookup2 = await reader.mushafPageForAyah(id, 2, 1);
    assert.equal(lookup2.pageNumber, 2);

    await assert.rejects(reader.mushafPage(id, 0));
    await assert.rejects(reader.mushafPage(id, 999));
    await assert.rejects(reader.mushafPageForAyah(id, 999, 1));
    await assert.rejects(reader.mushafPageForAyah(id, 1, 999));
  } finally {
    reader?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('reader manages recitation packs and serves audio URLs with segment timings', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'baglib-quran-recitation-'));
  const packs: QuranPack[] = [];
  const preset = readerPresets.find(v => v.id === 'recitation/957')!;
  const id = randomUUID();
  await mkdir(path.join(root, 'packs', id), { recursive: true });
  const filename = path.join(root, 'packs', id, '0.sqlite');
  const database = new Database(filename);
  database.exec(`
    CREATE TABLE verses (surah_number INTEGER, ayah_number INTEGER, audio_url TEXT, duration INTEGER, segments TEXT);
    INSERT INTO verses VALUES
      (1, 1, 'https://audio-cdn.tarteel.ai/quran/husary/001001.mp3', 5160, '[[0,1,0,480],[1,2,600,1000],[2,3,1800,2160],[3,4,2480,5160]]'),
      (1, 2, 'https://audio-cdn.tarteel.ai/quran/husary/001002.mp3', 6240, '[[0,1,800,1240],[1,2,1570,1670],[2,3,2530,2630],[3,4,2800,6240]]'),
      (1, 3, 'https://audio-cdn.tarteel.ai/quran/husary/001003.mp3', null, null);
  `);
  database.close();
  const digest = createHash('sha256').update(await readFile(filename)).digest('hex');
  const pack: QuranPack = {
    id,
    digest,
    resource: presetResource('recitation/957'),
    bytes: 100,
    files: [{ name: preset.filename.replace(/\.zip$/, ''), bytes: 100, type: 'sqlite' }],
    installedAt: '',
    capability: 'stored',
  };
  packs.push(pack);

  let reader: QuranReader | undefined;
  try {
    reader = new QuranReader(root, packs);
    const catalog = reader.catalog();
    const source = catalog.sources.find(s => s.kind === 'recitation');
    assert.ok(source);
    assert.equal(source.id, id);
    assert.equal(source.profile, 'hafs');

    const audio1 = await reader.recitationAudio(id, 1, 1);
    assert.equal(audio1.surah, 1);
    assert.equal(audio1.ayah, 1);
    assert.equal(audio1.audioUrl, 'https://audio-cdn.tarteel.ai/quran/husary/001001.mp3');
    assert.equal(audio1.duration, 5160);
    assert.equal(audio1.segments.length, 4);
    assert.deepEqual(audio1.segments[0], [0, 1, 0, 480]);
    assert.deepEqual(audio1.segments[3], [3, 4, 2480, 5160]);

    const audio3 = await reader.recitationAudio(id, 1, 3);
    assert.equal(audio3.duration, null);
    assert.deepEqual(audio3.segments, []);

    const surahVerses = await reader.recitationSurah(id, 1);
    assert.equal(surahVerses.length, 3);
    assert.equal(surahVerses[0].ayah, 1);
    assert.equal(surahVerses[1].ayah, 2);
    assert.equal(surahVerses[2].ayah, 3);

    await assert.rejects(reader.recitationAudio(id, 0, 1));
    await assert.rejects(reader.recitationAudio(id, 115, 1));
    await assert.rejects(reader.recitationAudio(id, 1, 0));
    await assert.rejects(reader.recitationAudio(id, 1, 301));
    await assert.rejects(reader.recitationSurah(id, 0));
    await assert.rejects(reader.recitationSurah(id, 115));
  } finally {
    reader?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('reader indexes and queries surah intros, ayah themes, and topic concepts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'baglib-quran-semantic-'));
  const packs: QuranPack[] = [];
  const add = async (resource: string, sql: string) => {
    const preset = readerPresets.find(value => value.id === resource)!;
    const id = randomUUID();
    await mkdir(path.join(root, 'packs', id), { recursive: true });
    const filename = path.join(root, 'packs', id, '0.sqlite');
    const database = new Database(filename);
    database.exec(sql);
    database.close();
    const digest = createHash('sha256').update(await readFile(filename)).digest('hex');
    const pack: QuranPack = { id, digest, resource: presetResource(resource), bytes: 1, files: [{ name: preset.filename.replace(/\.zip$/, ''), bytes: 1, type: 'sqlite' }], installedAt: '', capability: 'stored' };
    packs.push(pack);
    return { id, filename, digest };
  };

  let reader: QuranReader | undefined;
  try {
    const surahInfo = await add('surah-info/3', `
      CREATE TABLE surah_infos (surah_number INTEGER PRIMARY KEY, surah_name TEXT, text TEXT, short_text TEXT);
      INSERT INTO surah_infos VALUES (1, 'Al-Fatihah', 'Full overview of Al-Fatihah', 'Opening chapter summary');
    `);
    const ayahTheme = await add('ayah-theme/62', `
      CREATE TABLE themes (theme TEXT, surah_number INTEGER, ayah_from INTEGER, ayah_to INTEGER, keywords TEXT, total_ayahs INTEGER);
      INSERT INTO themes VALUES ('Warning to disbelievers', 2, 6, 7, 'warning, disbelief', 2), ('Signs of hypocrites', 2, 8, 16, '', 9);
    `);
    const ayahTopics = await add('ayah-topics/45', `
      CREATE TABLE topics (topic_id INTEGER PRIMARY KEY, name TEXT, arabic_name TEXT, parent_id INTEGER, thematic_parent_id INTEGER, ontology_parent_id INTEGER, description TEXT, wiki_link TEXT, thematic INTEGER, ontology INTEGER, ayahs TEXT, related_topics TEXT);
      INSERT INTO topics VALUES
        (1, 'Allah', 'الله', NULL, 1837, NULL, '<b>Allah</b> description', 'wiki/Allah', 1, 1, '1:1, 1:2, 2:7', '2'),
        (2, 'Day of Resurrection', 'يوم القيامة', NULL, NULL, 251, 'Resurrection desc', 'wiki/Judgment', 0, 1, '2:7, 2:85', '1');
    `);

    reader = new QuranReader(root, packs);

    // 1. Surah Intro
    const intro1 = await reader.surahIntro(surahInfo.id, 1);
    assert.ok(intro1);
    assert.equal(intro1.surahNumber, 1);
    assert.equal(intro1.surahName, 'Al-Fatihah');
    assert.equal(intro1.text, 'Full overview of Al-Fatihah');
    assert.equal(intro1.shortText, 'Opening chapter summary');

    const intro2 = await reader.surahIntro(undefined, 2);
    assert.equal(intro2, null);

    // 2. Ayah Themes
    const themesForAyah = await reader.ayahThemes(ayahTheme.id, 2, 6);
    assert.equal(themesForAyah.length, 1);
    assert.equal(themesForAyah[0].theme, 'Warning to disbelievers');
    assert.deepEqual(themesForAyah[0].keywords, ['warning', 'disbelief']);
    assert.equal(themesForAyah[0].totalAyahs, 2);

    const allSurahThemes = await reader.ayahThemes(undefined, 2);
    assert.equal(allSurahThemes.length, 2);
    assert.equal(allSurahThemes[1].theme, 'Signs of hypocrites');

    // 3. Ayah Topics
    const topicsFor2_7 = await reader.ayahTopics(ayahTopics.id, 2, 7);
    assert.equal(topicsFor2_7.length, 2);
    assert.equal(topicsFor2_7[0].name, 'Allah');
    assert.equal(topicsFor2_7[0].arabicName, 'الله');
    assert.deepEqual(topicsFor2_7[0].relatedTopics, [2]);
    assert.equal(topicsFor2_7[1].name, 'Day of Resurrection');
    assert.deepEqual(topicsFor2_7[1].ayahs, [{ surah: 2, ayah: 7 }, { surah: 2, ayah: 85 }]);

    const topicsFor1_1 = await reader.ayahTopics(undefined, 1, 1);
    assert.equal(topicsFor1_1.length, 1);
    assert.equal(topicsFor1_1[0].name, 'Allah');

    // 4. Topic Search
    const searchAllah = await reader.searchTopics(undefined, 'Allah');
    assert.ok(searchAllah.length >= 1);
    assert.equal(searchAllah[0].name, 'Allah');

    const searchArabic = await reader.searchTopics(undefined, 'القيامة');
    assert.ok(searchArabic.length >= 1);
    assert.equal(searchArabic[0].name, 'Day of Resurrection');

    // 5. Validation boundaries
    await assert.rejects(reader.surahIntro(undefined, 0));
    await assert.rejects(reader.surahIntro(undefined, 115));
    await assert.rejects(reader.ayahThemes(undefined, 0));
    await assert.rejects(reader.ayahThemes(undefined, 115));
    await assert.rejects(reader.ayahThemes(undefined, 2, 0));
    await assert.rejects(reader.ayahThemes(undefined, 2, 301));
    await assert.rejects(reader.ayahTopics(undefined, 0, 1));
    await assert.rejects(reader.ayahTopics(undefined, 115, 1));
    await assert.rejects(reader.ayahTopics(undefined, 1, 0));
    await assert.rejects(reader.ayahTopics(undefined, 1, 301));
  } finally {
    reader?.close();
    await rm(root, { recursive: true, force: true });
  }
});
