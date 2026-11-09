import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtemp, mkdir, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { QuranReader } from '../../src/main/services/quran/quran-reader';
import { presetResource } from '../../src/main/services/quran/reader-resources';
import type { QuranPack } from '../../src/shared/types/quran';
import { budgetSources, validateAssistantAnswer, validateAssistantRequest } from '../../src/shared/study-assistant';

async function fixture(run: (reader: QuranReader, packs: QuranPack[], root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'baglib-assistant-quran-'));
  const packs: QuranPack[] = [];
  const add = async (resource: string, sql: string) => {
    const id = randomUUID(); await mkdir(path.join(root, 'packs', id), { recursive: true });
    const filename = path.join(root, 'packs', id, '0.sqlite');
    const db = new Database(filename); db.exec(sql); db.close();
    const digest = createHash('sha256').update(await readFile(filename)).digest('hex');
    const metadata = presetResource(resource.endsWith('-ayah') ? 'quran-script/qpc-warsh-script-wbw' : resource);
    packs.push({ id, digest, resource: { ...metadata, id: resource }, bytes: 1, files: [{ name: 'source.sqlite', bytes: 1, type: 'sqlite' }], installedAt: '', capability: 'stored' });
  };
  await add('quran-script/312', `CREATE TABLE words(id INTEGER,surah INTEGER,ayah INTEGER,word INTEGER,text TEXT); INSERT INTO words VALUES(1,4,44,1,'السبيل'),(2,4,45,1,'والله'),(3,4,45,2,'أعلم');`);
  await add('quran-script/qpc-warsh-script-wbw', `CREATE TABLE words(id INTEGER,surah INTEGER,ayah INTEGER,word INTEGER,text TEXT); INSERT INTO words VALUES(1,4,44,1,'السبيلوالله'),(2,4,44,2,'أعلم');`);
  await add('quran-script/qpc-warsh-script-ayah', `CREATE TABLE verses(id INTEGER,surah INTEGER,ayah INTEGER,text TEXT); INSERT INTO verses VALUES(1,4,44,'اُ۬لسَّبِيلَۖوَاللَّهُ أَعْلَمُ');`);
  await add('tafsir/22', `CREATE TABLE tafsir(ayah_key TEXT,text TEXT,group_ayah_key TEXT,from_ayah TEXT,to_ayah TEXT); INSERT INTO tafsir VALUES('4:44','<p>تفسير <b>الأول</b></p>','','4:44','4:44'),('4:45','<p>تفسير الثاني</p>','','4:45','4:45');`);
  await add('translation/193', `CREATE TABLE translation(sura INTEGER,ayah INTEGER,text TEXT); INSERT INTO translation VALUES(4,44,'"First meaning"'),(4,45,'"Second meaning [[footnote]]"');`);
  const reader = new QuranReader(root, packs);
  try { await run(reader, packs, root); }
  finally {
    reader.close();
    for (const pack of packs) assert.equal(createHash('sha256').update(await readFile(path.join(root, 'packs', pack.id, '0.sqlite'))).digest('hex'), pack.digest, 'installed text immutable');
    await rm(root, { recursive: true, force: true });
  }
}
const query = { surah: 4, from: 44, to: 44, profile: 'warsh' as const };
test('assistant Warsh reads canonical ayah script, never Hafs or reconstructed WBW', () => fixture(async reader => {
  assert.deepEqual(await reader.ayahTexts(query), [{ number: 44, text: 'اُ۬لسَّبِيلَۖوَاللَّهُ أَعْلَمُ' }]);
  assert.deepEqual(await reader.ayahTexts({ ...query, profile: 'hafs' }), [{ number: 44, text: 'السبيل' }]);
}));
test('missing Warsh ayah pack returns typed error without fallback', () => fixture(async (_reader, packs, root) => {
  const reader = new QuranReader(root, packs.filter(pack => !pack.resource.id.endsWith('-ayah')));
  try { await assert.rejects(reader.ayahTexts(query), /warsh-not-installed/); } finally { reader.close(); }
}));
test('uninstalled and wrong-kind tafsir/translation IDs rejected in main reader', () => fixture(async reader => {
  for (const selected of [{ tafsir: 'tafsir/unknown' }, { translation: 'translation/unknown' }, { tafsir: 'translation/193' }, { translation: 'tafsir/22' }]) await assert.rejects(reader.assistantSources({ ...query, ...selected }), /invalid-resource/);
}));
test('Hafs receives tafsir and translation as independent sources with original titles/references', () => fixture(async reader => {
  const sources = await reader.assistantSources({ ...query, profile: 'hafs', tafsir: 'tafsir/22', translation: 'translation/193' });
  assert.deepEqual(sources.map(source => [source.kind, source.ayah, source.direction]), [['tafsir', 44, 'rtl'], ['translation', 44, 'ltr']]);
  assert.equal(sources[0].title, 'تفسير ابن كثير'); assert.match(sources[0].text, /تفسير الأول/);
}));
test('Warsh earlier ayah retains every overlapping Hafs source in order; cache is derived/versioned', () => fixture(async (reader, _packs, root) => {
  const selected = { ...query, tafsir: 'tafsir/22', translation: 'translation/193' };
  const sources = await reader.assistantSources(selected);
  assert.deepEqual(sources.map(source => [source.kind, source.ayah]), [['tafsir', 44], ['translation', 44], ['tafsir', 45], ['translation', 45]]);
  assert.match(sources[2].text, /الثاني/); assert.match(sources[3].text, /footnote/);
  assert.equal((await readdir(path.join(root, 'derived'))).filter(file => file.endsWith('.json')).length, 1);
  assert.deepEqual(await reader.assistantSources(selected), sources);
}));
test('tafsir exact quote accepted; fabricated quote refused; trimming reports limited', () => fixture(async reader => {
  const raw = await reader.assistantSources({ ...query, tafsir: 'tafsir/22' });
  const sources = raw.map((source, index) => ({ id: `S${index + 1}`, label: `${source.title} — 4:${source.ayah}`, target: `quran:hafs:4:${source.ayah}`, text: source.text }));
  const answer = (quote: string) => JSON.stringify({ answer: 'answer', abstained: false, citations: [{ source: 'S1', quote }] });
  assert.equal(validateAssistantAnswer(answer('تفسير الأول'), sources, 'qa').citations.length, 1);
  assert.throws(() => validateAssistantAnswer(answer('تفسير مختلق'), sources, 'qa'), /invalid-output/);
  assert.equal(budgetSources(sources, 3).limited, true);
}));
test('passage request preserves resource IDs but refuses malformed IDs and non-Quran additions', () => {
  const base = { task: 'guide', language: 'en', allowRemote: false, notes: [], books: [] };
  assert.equal(validateAssistantRequest({ ...base, passages: [{ target: 'quran:warsh:4:44', label: '4:44', tafsir: 'tafsir/22', translation: 'translation/193' }] }).passages[0].tafsir, 'tafsir/22');
  for (const target of ['quran:warsh:4:44', 'sunnah:Muslim:1:1']) assert.throws(() => validateAssistantRequest({ ...base, passages: [{ target, label: 'x', tafsir: '../bad' }] }), /invalid-request/);
});