import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rename, readdir, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { parseHTML } from 'linkedom';
import { hash, unpackSample, openSource, schemas, ayahKey, wordKey, decodeTranslation, resolveTafsir, isAyahMarker, normalizeSearch } from './contracts.mjs';

const root = path.resolve('.baglib-data/qul-phase1');
const staging = path.join(root, `.staging-${randomUUID()}`);
const sources = {};
const manifest = [];
const samples = {
  script: 'qpc-hafs-ayah-sqlite.zip', words: 'qpc-hafs-words-sqlite.zip',
  ayahMetadata: 'ayah-metadata-sqlite.zip', surahMetadata: 'surah-metadata-sqlite.zip',
  translation: 'saheeh-translation-sqlite.zip', wordTranslation: 'english-word-translation-sqlite.zip',
  tafsir: 'arabic-mukhtasar-tafsir-sqlite.zip', roots: 'word-roots.zip', font: 'qpc-hafs-font.zip',
};
let index;
await mkdir(staging);
try {
  for (const [kind, filename] of Object.entries(samples)) {
    const bytes = await readFile(path.join(root, filename));
    const provenance = JSON.parse(await readFile(path.join(root, `${filename}.provenance.json`), 'utf8'));
    const entries = Object.entries(unpackSample(bytes, provenance.sha256));
    assert.equal(entries.length, 1);
    const [member, content] = entries[0];
    const destination = path.join(staging, member);
    await writeFile(destination, content, { flag: 'wx' });
    if (kind === 'font') assert.equal(Buffer.from(content).subarray(0, 4).toString(), 'wOF2');
    else sources[kind] = openSource(destination, schemas[kind]);
    manifest.push({ kind, resource: provenance.resource, sourceArchive: filename, archiveHash: provenance.sha256, member, memberHash: hash(content), bytes: content.length, rights: 'not-cleared-for-redistribution' });
  }

  const verses = sources.script.prepare('SELECT * FROM verses').all();
  const verseMap = new Map(verses.map(row => [row.verse_key, row]));
  const words = sources.words.prepare('SELECT * FROM words').all();
  const wordMap = new Map(words.map(row => [row.location, row]));
  const metadata = sources.ayahMetadata.prepare('SELECT * FROM verses').all();
  const chapters = sources.surahMetadata.prepare('SELECT * FROM chapters').all();
  assert.equal(verses.length, 6236);
  assert.equal(verseMap.size, verses.length);
  assert.equal(metadata.length, verses.length);
  assert.equal(new Set(metadata.map(row => row.verse_key)).size, verses.length);
  assert.equal(chapters.length, 114);
  assert.equal(wordMap.size, words.length);
  for (const row of verses) assert.equal(row.verse_key, ayahKey(row.surah, row.ayah));
  const lexicalCounts = new Map();
  const blockedWordAyahs = new Set();
  const compatibilityFindings = [];
  let markers = 0;
  for (const row of words) {
    assert.equal(row.location, wordKey(row.surah, row.ayah, row.word));
    const key = ayahKey(row.surah, row.ayah);
    assert.ok(verseMap.has(key));
    if (isAyahMarker(row.text)) markers++;
    else lexicalCounts.set(key, (lexicalCounts.get(key) || 0) + 1);
  }
  for (const row of metadata) {
    assert.equal(row.verse_key, ayahKey(row.surah_number, row.ayah_number));
    assert.equal(row.text, verseMap.get(row.verse_key)?.text);
    if (row.words_count !== lexicalCounts.get(row.verse_key)) {
      blockedWordAyahs.add(row.verse_key);
      compatibilityFindings.push({ kind: 'word-count-mismatch', ayah: row.verse_key, metadataCount: row.words_count, scriptCount: lexicalCounts.get(row.verse_key) });
    }
  }
  for (const chapter of chapters) assert.equal(verses.filter(row => row.surah === chapter.id).length, chapter.verses_count);

  const translations = sources.translation.prepare('SELECT * FROM translation').all();
  assert.equal(translations.length, verses.length);
  const translated = new Map();
  let footnoteCount = 0;
  for (const row of translations) {
    assert.equal(row.ayah_key, ayahKey(row.sura, row.ayah));
    assert.ok(verseMap.has(row.ayah_key));
    assert.ok(!translated.has(row.ayah_key));
    const decoded = decodeTranslation(row);
    translated.set(row.ayah_key, decoded);
    footnoteCount += Object.keys(decoded.footnotes).length;
  }
  const wordTranslations = sources.wordTranslation.prepare('SELECT * FROM word_translation').all();
  const translatedWords = new Set();
  let markerTranslations = 0;
  for (const row of wordTranslations) {
    const key = wordKey(row.surah_number, row.ayah_number, row.word_number);
    if (!wordMap.has(key)) {
      blockedWordAyahs.add(ayahKey(row.surah_number, row.ayah_number));
      compatibilityFindings.push({ kind: 'unmatched-translated-word', location: key });
    }
    assert.ok(!translatedWords.has(key));
    translatedWords.add(key);
    if (wordMap.has(key) && isAyahMarker(wordMap.get(key).text)) markerTranslations++;
  }
  const missingWordTranslations = words.filter(row => !isAyahMarker(row.text) && !translatedWords.has(row.location)).map(row => row.location);
  const tafsirRows = sources.tafsir.prepare('SELECT * FROM tafsir').all();
  const tafsirMap = new Map(tafsirRows.map(row => [row.ayah_key, row]));
  assert.equal(tafsirMap.size, verses.length);
  assert.equal(tafsirRows.length, verses.length);
  let grouped = 0;
  for (const key of verseMap.keys()) if (resolveTafsir(tafsirMap, key).group !== key) grouped++;
  const roots = sources.roots.prepare('SELECT * FROM roots').all();
  const rootIds = new Set(roots.map(row => row.id));
  const rootWords = sources.roots.prepare('SELECT * FROM root_words').all();
  for (const row of rootWords) {
    assert.ok(rootIds.has(row.root_id));
    const sourceWord = wordMap.get(row.word_location);
    if (!sourceWord || isAyahMarker(sourceWord.text)) {
      const ayah = row.word_location.split(':').slice(0, 2).join(':');
      blockedWordAyahs.add(ayah);
      compatibilityFindings.push({ kind: sourceWord ? 'root-points-to-marker' : 'unmatched-root-word', location: row.word_location });
    }
  }

  index = new DatabaseSync(path.join(staging, 'search.sqlite'));
  index.exec("CREATE VIRTUAL TABLE search USING fts5(resource UNINDEXED, ayah_key UNINDEXED, terms, tokenize='unicode61 remove_diacritics 0'); BEGIN");
  const insert = index.prepare('INSERT INTO search(resource, ayah_key, terms) VALUES (?, ?, ?)');
  for (const row of verses) insert.run('qpc-hafs-86', row.verse_key, normalizeSearch(row.text));
  for (const [key, value] of translated) {
    const { document } = parseHTML(`<html><body>${value.text}</body></html>`);
    insert.run('saheeh-193', key, normalizeSearch(document.body.textContent));
  }
  index.exec('COMMIT');
  const search = index.prepare('SELECT ayah_key FROM search WHERE search MATCH ? AND resource = ? LIMIT 25');
  const arabic = search.all(normalizeSearch('ٱلْحَمْدُ'), 'qpc-hafs-86');
  assert.ok(arabic.some(row => row.ayah_key === '1:2'));
  assert.deepEqual(arabic, search.all(normalizeSearch('الحمد'), 'qpc-hafs-86'));
  assert.ok(search.all('Merciful', 'saheeh-193').some(row => row.ayah_key === '1:1'));
  const plan = index.prepare('EXPLAIN QUERY PLAN SELECT ayah_key FROM search WHERE search MATCH ?').all('الحمد');
  assert.ok(plan.some(row => /VIRTUAL TABLE INDEX/.test(row.detail)));
  index.close();
  index = undefined;

  const categoryFiles = (await readdir(root)).filter(file => file.startsWith('catalog-') && file !== 'catalog-categories.json');
  const categoryCounts = {};
  for (const file of categoryFiles) {
    const catalog = JSON.parse(await readFile(path.join(root, file), 'utf8'));
    categoryCounts[catalog.category] = catalog.resources.length;
  }
  assert.equal(Object.keys(categoryCounts).length, 14);
  const sourceSchemas = Object.fromEntries(Object.entries(sources).map(([kind, db]) => [kind, db.prepare("SELECT name, sql FROM sqlite_schema WHERE type='table'").all()]));
  const report = {
    verifiedAt: new Date().toISOString(), offline: true, installedResources: manifest.length,
    ayahs: verses.length, surahs: chapters.length, scriptRows: words.length, ayahMarkers: markers,
    lexicalWords: words.length - markers, translatedWordRows: wordTranslations.length, translatedMarkers: markerTranslations,
    uncoveredLexicalTranslations: missingWordTranslations.length, missingWordTranslations,
    translations: translations.length, footnotes: footnoteCount, tafsirRows: tafsirRows.length, groupedTafsirPointers: grouped,
    roots: roots.length, rootWordLinks: rootWords.length, categoryCounts, sourceSchemas,
    blockedWordAyahs: [...blockedWordAyahs], compatibilityFindings,
    checks: ['all source schemas/integrity', 'all verse and word keys', 'metadata word-count audit', 'all chapter ayah counts', 'all translation keys/JSON cells', 'word-translation join audit', 'all tafsir group resolution', 'root-word join audit', 'Arabic diacritic/English FTS queries', 'source hashes unchanged'],
    limits: ['No application UI/IPC integration', 'No source redistribution rights inferred', 'Root sample does not prove lemma/POS availability', 'No audio/layout package installation'],
  };
  for (const source of Object.values(sources)) source.close();
  for (const item of manifest) assert.equal(hash(await readFile(path.join(staging, item.member))), item.memberHash);
  await writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(staging, 'report.json'), JSON.stringify(report, null, 2));
  const destination = path.join(root, `installed-${randomUUID()}`);
  await rename(staging, destination);
  const totalBytes = (await Promise.all(manifest.map(item => stat(path.join(destination, item.member))))).reduce((total, info) => total + info.size, 0);
  console.log(JSON.stringify({ ...report, sourceSchemas: undefined, directory: destination, totalSourceBytes: totalBytes }, null, 2));
} catch (error) {
  index?.close();
  for (const source of Object.values(sources)) { try { source.close(); } catch {} }
  assert.equal(path.dirname(staging), root);
  assert.ok(path.basename(staging).startsWith('.staging-'));
  await rm(staging, { recursive: true, force: true });
  throw error;
}
