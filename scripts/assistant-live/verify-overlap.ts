// Invoked by run.mjs against its disposable corpus, using the existing Electron test runner.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { alignWarshSurah, assertHafsCoverage } from '../../src/main/services/quran/warsh-overlap';
import type { QuranPack } from '../../src/shared/types/quran';
const directory = process.env.BAGLIB_ASSISTANT_LIVE_DIR!;
const root = path.join(directory, 'quran');
const catalog = new Database(path.join(root, 'catalog.sqlite'), { readonly: true, fileMustExist: true });
const packs = (catalog.prepare('SELECT descriptor FROM packs').all() as { descriptor: string }[]).map(row => JSON.parse(row.descriptor) as QuranPack);
catalog.close();
const databases = ['quran-script/312', 'quran-script/qpc-warsh-script-wbw'].map(resource => {
  const pack = packs.find(pack => pack.resource.id === resource);
  assert.ok(pack, `Required installed resource ${resource}`);
  return new Database(path.join(root, 'packs', pack.id, `${pack.files.findIndex(file => file.type === 'sqlite')}.sqlite`), { readonly: true, fileMustExist: true });
});
let hafsAyahs = 0;
const maps: Record<number, Record<number, number[]>> = {};
try {
  for (let surah = 1; surah <= 114; surah++) {
    const rows = databases.map(db => db.prepare('SELECT ayah,text FROM words WHERE surah=? ORDER BY ayah,word').all(surah) as { ayah: number; text: string }[]);
    maps[surah] = alignWarshSurah(rows[0], rows[1], surah === 1, surah);
    const expected = [...new Set(rows[0].map(word => word.ayah))];
    assertHafsCoverage(maps[surah], expected, surah); // Every installed Hafs reference must attach, including 1:1.
    hafsAyahs += expected.length;
    assert.ok(Object.keys(maps[surah]).length, `Surah ${surah} aligned`);
  }
  assert.deepEqual(maps[1], { 1: [1, 2], 2: [3], 3: [4], 4: [5], 5: [6], 6: [7], 7: [7] });
  assert.deepEqual(maps[4][44], [44, 45]);
  assert.equal(Object.values(maps).reduce((sum, map) => sum + Object.keys(map).length, 0), 6214);
  assert.equal(hafsAyahs, 6236, 'All 6236 Hafs ayahs must be attached, with zero unattached references');
  fs.writeFileSync(path.join(directory, 'overlap.json'), JSON.stringify({ surahs: 114, warshAyahs: 6214, hafsAyahs, unattached: [], maps }, null, 2));
  console.log('KEY-276: 114 surahs / 6214 Warsh ayahs aligned; all 6236 Hafs ayahs attached; zero unattached references');
} finally { for (const db of databases) db.close(); }
