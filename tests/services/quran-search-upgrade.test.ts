import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { QuranReader } from '../../src/main/services/quran/quran-reader';
import { normalizeQuranSearch } from '../../src/main/services/quran/qul-catalog';
import { presetResource, readerPresets } from '../../src/main/services/quran/reader-resources';
import type { QuranPack } from '../../src/shared/types/quran';

const WORDS = `CREATE TABLE words(id INTEGER,location TEXT,surah INTEGER,ayah INTEGER,word INTEGER,text TEXT);
INSERT INTO words VALUES (1,'1:2:1',1,2,1,'ٱلۡحَمۡدُ'),(2,'1:2:2',1,2,2,'لِلَّهِ'),(3,'1:2:3',1,2,3,'رَبِّ'),(4,'1:2:4',1,2,4,'ٱلۡعَٰلَمِينَ'),(5,'1:2:5',1,2,5,'٢'),
(6,'1:3:1',1,3,1,'ٱلرَّحۡمَٰنِ'),(7,'1:3:2',1,3,2,'ٱلرَّحِيمِ'),(8,'1:3:3',1,3,3,'٣');`;

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'baglib-quran-upgrade-'));
  const preset = readerPresets.find(value => value.id === 'quran-script/312')!;
  const id = randomUUID();
  await mkdir(path.join(root, 'packs', id), { recursive: true });
  const filename = path.join(root, 'packs', id, '0.sqlite');
  const source = new Database(filename); source.exec(WORDS); source.close();
  const digest = createHash('sha256').update(await readFile(filename)).digest('hex');
  const pack: QuranPack = { id, digest, resource: presetResource('quran-script/312'), bytes: 1, files: [{ name: preset.filename.replace(/\.zip$/, ''), bytes: 1, type: 'sqlite' }], installedAt: '', capability: 'stored' };
  // A v1 derived file as earlier versions built it: same tables, index without the extra spellings.
  await mkdir(path.join(root, 'derived'));
  const v1 = path.join(root, 'derived', `${createHash('sha256').update(`${digest}:reader-v1:script`).digest('hex')}.sqlite`);
  const old = new Database(v1);
  old.exec(WORDS);
  old.exec('CREATE VIRTUAL TABLE baglib_search USING fts5(surah UNINDEXED, ayah UNINDEXED, original UNINDEXED, normalized);');
  old.prepare('INSERT INTO baglib_search VALUES (1, 2, ?, ?)').run('ٱلۡحَمۡدُ لِلَّهِ رَبِّ ٱلۡعَٰلَمِينَ ٢', normalizeQuranSearch('ٱلۡحَمۡدُ لِلَّهِ رَبِّ ٱلۡعَٰلَمِينَ ٢'));
  old.pragma('user_version = 1'); old.close();
  return { root, pack, v1, packFile: filename };
}

test('an older script index is rebuilt from the installed pack, then removed, and words with the small alif are found', async () => {
  const { root, pack, v1 } = await fixture();
  const reader = new QuranReader(root, [pack]);
  try {
    assert.deepEqual((await reader.search(pack.id, 'الحمد لله رب العالمين')).map(hit => hit.ayah), [2]);
    assert.deepEqual((await reader.search(pack.id, 'الرحمن')).map(hit => hit.ayah), [3]);
    assert.equal(existsSync(v1), false);
    assert.equal((await readdir(path.join(root, 'derived'))).length, 1);
  } finally { reader.close?.(); await rm(root, { recursive: true, force: true }); }
});

test('if the rebuild fails, the older index stays in use instead of losing the script', async () => {
  const { root, pack, v1, packFile } = await fixture();
  await rm(packFile); // the pack file is gone, so v2 cannot be built
  const reader = new QuranReader(root, [pack]);
  try {
    assert.deepEqual((await reader.search(pack.id, 'الحمد')).map(hit => hit.ayah), [2]);
    assert.equal(existsSync(v1), true);
  } finally { reader.close?.(); await rm(root, { recursive: true, force: true }); }
});
