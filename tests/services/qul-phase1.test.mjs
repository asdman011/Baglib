import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { zipSync, strToU8 } from 'fflate';
import { hash, unpackSample, openSource, ayahKey, wordKey, decodeTranslation, resolveTafsir, normalizeSearch, isAyahMarker } from '../../scripts/qul-phase1/contracts.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'baglib-qul-contract-'));
after(async () => {
  assert.equal(path.dirname(directory), path.resolve(tmpdir()));
  await rm(directory, { recursive: true, force: true });
});

test('detects ZIP packaging independently of the advertised JSON format', () => {
  const archive = zipSync({ 'sample.json': strToU8('{"1:1":{"text":"بِسْمِ الله"}}') });
  const entries = unpackSample(archive, hash(archive));
  assert.equal(JSON.parse(Buffer.from(entries['sample.json']))['1:1'].text, 'بِسْمِ الله');
});

test('rejects damaged identity and non-ZIP data', () => {
  const archive = zipSync({ 'sample.json': strToU8('{}') });
  assert.throws(() => unpackSample(archive, '0'.repeat(64)), /identity/);
  assert.throws(() => unpackSample(Buffer.from('{}'), hash(Buffer.from('{}'))), /signature/);
});

test('rejects archive traversal, nested payloads and unexpected executable members', () => {
  for (const name of ['../sample.db', '/sample.db', 'folder/sample.db', 'folder\\sample.db', 'worker.js', 'nested.zip']) {
    const archive = zipSync({ [name]: strToU8('content') });
    assert.throws(() => unpackSample(archive, hash(archive)), /Unsafe/);
  }
});

test('bounds compressed bytes, expanded bytes and archive entry count', () => {
  const archive = zipSync({ 'one.json': strToU8('x'.repeat(200)), 'two.json': strToU8('{}') });
  assert.throws(() => unpackSample(archive, hash(archive), { compressedBytes: 1 }), /size/);
  assert.throws(() => unpackSample(archive, hash(archive), { expandedBytes: 20 }), /expansion/);
  assert.throws(() => unpackSample(archive, hash(archive), { entries: 1 }), /expansion/);
});

test('accepts SQLite and font members with their original bytes', () => {
  const archive = zipSync({ 'source.db': strToU8('SQLite format 3\0'), 'font.woff2': strToU8('wOF2') });
  const entries = unpackSample(archive, hash(archive));
  assert.equal(Buffer.from(entries['font.woff2']).toString(), 'wOF2');
});

test('opens only the expected ordinary SQLite schema, read-only', () => {
  const filename = path.join(directory, 'valid.db');
  const writable = new DatabaseSync(filename);
  writable.exec('CREATE TABLE verses(id INTEGER, text TEXT)');
  writable.prepare('INSERT INTO verses VALUES (?, ?)').run(1, 'بِسْمِ الله');
  writable.close();
  const source = openSource(filename, { verses: ['id', 'text'] });
  try {
    assert.equal(source.prepare('SELECT text FROM verses').get().text, 'بِسْمِ الله');
    assert.throws(() => source.exec('DELETE FROM verses'), /readonly|read-only/i);
  } finally { source.close(); }
  assert.throws(() => openSource(filename, { verses: ['text', 'id'] }), /columns/);
  assert.throws(() => openSource(filename, { words: ['id', 'text'] }), /tables/);
});

test('rejects views and triggers instead of executing downloaded schema', () => {
  for (const [name, extra] of [['view', 'CREATE VIEW visible AS SELECT * FROM verses'], ['trigger', 'CREATE TRIGGER changed AFTER INSERT ON verses BEGIN DELETE FROM verses; END']]) {
    const filename = path.join(directory, `${name}.db`);
    const writable = new DatabaseSync(filename);
    writable.exec(`CREATE TABLE verses(id INTEGER); ${extra}`);
    writable.close();
    assert.throws(() => openSource(filename, { verses: ['id'] }), /executable schema/);
  }
});

test('joins mixed numeric/string source identities without using row order', () => {
  assert.equal(ayahKey('2', 255), '2:255');
  assert.equal(wordKey('1', '1', '4'), '1:1:4');
  for (const values of [[0, 1], [115, 1], [1, 0], [1, 1.5], ['x', 1], [true, 1], ['1e0', 1]]) assert.throws(() => ayahKey(...values));
  assert.throws(() => wordKey(1, 1, 0));
  assert.throws(() => wordKey(1, 1, true));
});

test('decodes JSON-encoded translation cells without changing markup or footnotes', () => {
  const original = 'Merciful<sup foot_note="12">1</sup> — الرَّحِيمِ';
  const row = { text: JSON.stringify(original), footnotes: JSON.stringify({ 12: 'شرح — explanation' }) };
  assert.deepEqual(decodeTranslation(row), { text: original, footnotes: { 12: 'شرح — explanation' } });
  assert.throws(() => decodeTranslation({ text: 'plain unencoded text', footnotes: '{}' }));
  assert.throws(() => decodeTranslation({ text: '123', footnotes: '{}' }), /encoding/);
});

test('resolves shared tafsir and refuses dangling or cyclic groups', () => {
  const rows = new Map([['2:3', { text: 'تفسير محفوظ', group_ayah_key: '2:3' }], ['2:4', { text: '', group_ayah_key: '2:3' }]]);
  assert.deepEqual(resolveTafsir(rows, '2:4'), { text: 'تفسير محفوظ', group: '2:3' });
  assert.throws(() => resolveTafsir(rows, '2:5'), /Missing/);
  assert.throws(() => resolveTafsir(new Map([['1:1', { text: '', group_ayah_key: '1:1' }]]), '1:1'), /Cyclic/);
});

test('normalizes only the search representation and preserves ambiguous Arabic letters', () => {
  const original = 'ٱلْحَمْدُ — الْعِلْمُ';
  assert.equal(normalizeSearch(original), 'الحمد — العلم');
  assert.notEqual(normalizeSearch('رحمة'), normalizeSearch('رحمه'));
  assert.notEqual(normalizeSearch('على'), normalizeSearch('علي'));
  assert.equal(original, 'ٱلْحَمْدُ — الْعِلْمُ');
});

test('distinguishes ayah-number markers from lexical script tokens', () => {
  assert.equal(isAyahMarker('١٣٠'), true);
  assert.equal(isAyahMarker('إِلۡ يَاسِينَ'), false);
  assert.equal(isAyahMarker('عِلْمٌ'), false);
});
