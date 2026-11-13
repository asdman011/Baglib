import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { buildPoetryPack, importPoetryPack, parsePoetryPackManifest } from '../../src/main/services/poetry/pack';

// KEY-266: the local poetry pack is verified end to end and never leaves partial files behind.
async function fixture(rows = 7) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-poetry-pack-'));
  const source = path.join(directory, 'source.sqlite');
  const bytes = randomBytes(3 * 1024 * 1024 + 123);
  fs.writeFileSync(source, bytes);
  const { manifestPath, manifest } = await buildPoetryPack({ source, outDir: path.join(directory, 'pack'), rows, now: () => new Date('2026-11-14T00:00:00Z') });
  const userData = path.join(directory, 'profile');
  const options = (overrides: Partial<Parameters<typeof importPoetryPack>[0]> = {}) => ({ manifestPath, userData, signal: new AbortController().signal, progress: () => {}, freeBytes: async () => 64 * 1024 ** 3, verify: async () => rows, ...overrides });
  const target = path.join(userData, 'partitions', 'bayan_poetry.sqlite');
  const leftovers = () => fs.existsSync(path.join(userData, 'partitions')) ? fs.readdirSync(path.join(userData, 'partitions')).filter(name => name.startsWith('.poetry-pack-')) : [];
  return { directory, bytes, manifestPath, manifest, options, target, leftovers, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

test('a built pack imports byte-identical with progress up to the total', async () => {
  const f = await fixture();
  try {
    assert.equal(f.manifest.bytes, f.bytes.length);
    const seen: number[] = [];
    // Like a real SQLite open of a WAL database, verification leaves -wal/-shm side files that must be removed.
    const result = await importPoetryPack(f.options({ progress: written => seen.push(written), verify: async staged => { fs.writeFileSync(`${staged}-wal`, ''); fs.writeFileSync(`${staged}-shm`, ''); return 7; } }));
    assert.deepEqual(result, { rows: 7, bytes: f.bytes.length });
    assert.ok(fs.readFileSync(f.target).equals(f.bytes));
    assert.equal(seen.at(-1), f.bytes.length);
    assert.deepEqual(f.leftovers(), []);
  } finally { f.cleanup(); }
});

test('a wrong checksum, corrupt archive, low disk or wrong count is refused without leftovers', async () => {
  const f = await fixture();
  try {
    const manifest = JSON.parse(fs.readFileSync(f.manifestPath, 'utf8'));
    fs.writeFileSync(f.manifestPath, JSON.stringify({ ...manifest, sha256: '0'.repeat(64) }));
    await assert.rejects(importPoetryPack(f.options()), /poetry-pack-checksum-mismatch/u);
    assert.equal(fs.existsSync(f.target), false); assert.deepEqual(f.leftovers(), []);
    fs.writeFileSync(f.manifestPath, JSON.stringify(manifest));

    await assert.rejects(importPoetryPack(f.options({ freeBytes: async () => 1024 })), /poetry-pack-no-space/u);
    await assert.rejects(importPoetryPack(f.options({ verify: async () => 3 })), /poetry-invalid-partition/u);
    await assert.rejects(importPoetryPack(f.options({ verify: async () => { throw new Error('integrity'); } })), /poetry-invalid-partition/u);
    assert.equal(fs.existsSync(f.target), false); assert.deepEqual(f.leftovers(), []);

    const gz = path.join(path.dirname(f.manifestPath), manifest.file);
    const whole = fs.readFileSync(gz);
    fs.writeFileSync(gz, whole.subarray(0, Math.floor(whole.length / 2)));
    await assert.rejects(importPoetryPack(f.options()), /poetry-pack-(corrupt|checksum-mismatch)/u);
    fs.writeFileSync(gz, randomBytes(4096));
    await assert.rejects(importPoetryPack(f.options()), /poetry-pack-corrupt/u);
    fs.rmSync(gz);
    await assert.rejects(importPoetryPack(f.options()), /poetry-pack-missing/u);
    assert.equal(fs.existsSync(f.target), false); assert.deepEqual(f.leftovers(), []);
  } finally { f.cleanup(); }
});

test('an existing partition is kept and a cancelled import leaves nothing', async () => {
  const f = await fixture();
  try {
    const controller = new AbortController();
    await assert.rejects(importPoetryPack(f.options({ signal: controller.signal, progress: () => controller.abort() })), /cancelled/u);
    assert.equal(fs.existsSync(f.target), false); assert.deepEqual(f.leftovers(), []);
    await importPoetryPack(f.options()); // retry after cancel succeeds
    fs.writeFileSync(f.target, 'existing');
    await assert.rejects(importPoetryPack(f.options()), /poetry-partition-exists/u);
    assert.equal(fs.readFileSync(f.target, 'utf8'), 'existing');
  } finally { f.cleanup(); }
});

test('the manifest parser accepts only an exact version-1 pack', () => {
  const good = { format: 'baglib-poetry-pack', version: 1, dataset: 'bayan_poetry', file: 'bayan_poetry-v1.sqlite.gz', compression: 'gzip', bytes: 10, sha256: 'a'.repeat(64), rows: 1, createdAt: '2026-11-14T00:00:00Z' };
  assert.equal(parsePoetryPackManifest(good).rows, 1);
  for (const bad of [{ file: '../x.sqlite.gz' }, { file: 'C:x.sqlite.gz' }, { file: 'dir/x.sqlite.gz' }, { file: 'x.sqlite' }, { format: 'other' }, { sha256: 'A'.repeat(64) }, { rows: 0 }, { bytes: 9 * 1024 ** 3 }, { version: 2 }]) {
    assert.throws(() => parsePoetryPackManifest({ ...good, ...bad }), /poetry-pack-invalid/u, JSON.stringify(bad));
  }
  assert.throws(() => parsePoetryPackManifest(null), /poetry-pack-invalid/u);
});
