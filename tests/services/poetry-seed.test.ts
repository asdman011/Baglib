import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { seedPoetry } from '../../src/main/services/poetry/seed';
import { downloadPoetryCorpus } from '../../src/main/services/poetry/corpus';

test('Poetry rejects corrupt cached official shards without publishing a manifest', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-poetry-cache-'));
  try {
    fs.writeFileSync(path.join(directory, '0000.parquet'), 'PAR1invalidPAR1');
    await assert.rejects(downloadPoetryCorpus(directory, new AbortController().signal, () => {}), /checksum-mismatch/u);
    assert.equal(fs.existsSync(path.join(directory, 'manifest.json')), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('real Parquet seeding validates staged counts, publishes exclusively and preserves existing corpus', async context => {
  const python = process.env.BAGLIB_POETRY_PYTHON || path.resolve('tools/hadith-alignment/.venv/Scripts/python.exe');
  if (!fs.existsSync(python)) { context.skip('Python/PyArrow interpreter is not configured'); return; }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-poetry-seed-'));
  try {
    const shard = path.join(directory, 'fixture.parquet');
    const fixture = spawnSync(python, ['-I', '-c', "import pyarrow as a,pyarrow.parquet as p,sys;p.write_table(a.Table.from_pylist([{'poem title':'قصيدة','poet name':'شاعر','poem verses':['صَدْرٌ','عَجُزٌ'],'poem meter':'بحر الطويل'},{'poem title':None,'poet name':'شاعر','poem verses':['آخر']}]),sys.argv[1])", shard], { windowsHide: true });
    assert.equal(fixture.status, 0, fixture.stderr?.toString());
    const progress: number[] = [];
    const options = { userData: path.join(directory, 'profile'), python, parser: path.resolve('assets/poetry/parquet_rows.py'), shards: [shard], expectedCount: 2, signal: new AbortController().signal, progress: (count: number) => progress.push(count) };
    assert.equal(await seedPoetry(options), 2);
    assert.equal(progress.at(-1), 2);
    const filename = path.join(options.userData, 'partitions/bayan_poetry.sqlite');
    const database = new Database(filename, { readonly: true });
    assert.equal((database.prepare('SELECT COUNT(*) AS n FROM poems_fts').get() as { n: number }).n, 2);
    assert.equal(database.pragma('quick_check', { simple: true }), 'ok');
    database.close();
    const before = fs.readFileSync(filename);
    await assert.rejects(seedPoetry(options), /partition-exists/u);
    assert.deepEqual(fs.readFileSync(filename), before);
    const failedProfile = path.join(directory, 'failed');
    await assert.rejects(seedPoetry({ ...options, userData: failedProfile, expectedCount: 3 }), /invalid-partition/u);
    assert.equal(fs.existsSync(path.join(failedProfile, 'partitions/bayan_poetry.sqlite')), false);
    await assert.rejects(seedPoetry({ ...options, userData: path.join(directory, 'cancelled'), signal: AbortSignal.abort() }));
    assert.equal(fs.existsSync(path.join(directory, 'cancelled')), false);
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(directory).startsWith('baglib-poetry-seed-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
