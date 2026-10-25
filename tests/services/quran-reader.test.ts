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
  assert.deepEqual(inlineTranslation(JSON.stringify('Meaning [[first note]] and [[second note]].')), { text: 'Meaning  and .', notes: ['first note', 'second note'] });
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
    assert.equal(passage.ayahs.length, 2);
    assert.equal(passage.ayahs[0].words[2].marker, true);
    assert.equal(passage.ayahs[0].words[0].meaning, 'In the name');
    assert.equal(passage.ayahs[0].words[1].meaning, undefined);
    assert.deepEqual(passage.ayahs[0].translation, { text: 'Meaning ', notes: ['note'] });
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
