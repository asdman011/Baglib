import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { QuranReader } from '../../src/main/services/quran/quran-reader';
import { presetResource } from '../../src/main/services/quran/reader-resources';
import type { QuranPack } from '../../src/shared/types/quran';

for (const scenario of ['self-pointer', 'two-node cycle', 'chain exceeding 32 hops'] as const) {
  test(`commentary rejects ${scenario} with invalid-package`, { timeout: 5000 }, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'baglib-tafsir-cycle-'));
    const script = randomUUID(); const tafsir = randomUUID();
    const pack = (id: string, resource: string): QuranPack => ({ id, resource: presetResource(resource), digest: 'a'.repeat(64), bytes: 1, files: [{ name: 'fixture.sqlite', bytes: 1, type: 'sqlite' }], installedAt: '', capability: 'stored' });
    let reader: QuranReader | undefined;
    try {
      await mkdir(path.join(root, 'packs', tafsir), { recursive: true });
      const database = new Database(path.join(root, 'packs', tafsir, '0.sqlite'));
      try {
        database.exec('CREATE TABLE tafsir(ayah_key TEXT,group_ayah_key TEXT,from_ayah TEXT,to_ayah TEXT,text TEXT)');
        const insert = database.prepare('INSERT INTO tafsir VALUES(?,?,?,?,?)');
        if (scenario === 'self-pointer') insert.run('1:1','1:1','','','');
        else if (scenario === 'two-node cycle') { insert.run('1:1','1:2','','',''); insert.run('1:2','1:1','','',''); }
        else {
          for (let number = 1; number <= 33; number++) insert.run(`1:${number}`, `1:${number+1}`, '', '', '');
          insert.run('1:34','1:34','1:34','1:34','<p>Too far to follow</p>');
        }
      } finally { database.close(); }
      reader = new QuranReader(root, [pack(script,'quran-script/312'),pack(tafsir,'tafsir/22')]);
      await assert.rejects(reader.commentary({ script, pack: tafsir, surah: 1, ayah: 1 }), { message: 'invalid-package' });
    } finally {
      reader?.close(); assert.equal(path.dirname(root), path.resolve(tmpdir()));
      await rm(root, { recursive: true, force: true });
    }
  });
}
