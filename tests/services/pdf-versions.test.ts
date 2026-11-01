import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { deletePdfVersion, listPdfVersions, restorePdfVersion, selectUndoVersion } from '../../src/main/services/pdf-editor/versions';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'baglib-versions-'));
  const directory = path.join(root, 'backups'), target = path.join(root, 'book.pdf');
  await mkdir(directory);
  await writeFile(target, '%PDF v2');
  await writeFile(path.join(directory, 'src_1000.pdf'), '%PDF v0');
  await writeFile(path.join(directory, 'src_2000.pdf'), '%PDF v1');
  await writeFile(path.join(directory, 'other_3000.pdf'), '%PDF foreign');
  return { root, directory, target };
}

test('version lists stay scoped to one source, newest first', async () => {
  const { root, directory } = await fixture();
  try {
    assert.deepEqual((await listPdfVersions(directory, 'src')).map(item => item.filename), ['src_2000.pdf', 'src_1000.pdf']);
    assert.deepEqual(await listPdfVersions(path.join(root, 'absent'), 'src'), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('restore swaps bytes, keeps a restore point and always changes the cache identity', async () => {
  const { root, directory, target } = await fixture();
  try {
    const old = new Date('2020-01-01');
    await utimes(path.join(directory, 'src_2000.pdf'), old, old);
    const restored = await restorePdfVersion({ directory, sourceId: 'src', filename: 'src_2000.pdf', target, expectedSha256: hash('%PDF v2') });
    assert.equal(await readFile(target, 'utf8'), '%PDF v1');
    assert.equal(restored.sha256, hash('%PDF v1'));
    assert.equal(await readFile(restored.restorePoint, 'utf8'), '%PDF v2');
    assert.ok((await stat(target)).mtimeMs > old.getTime());
    assert.deepEqual((await readdir(root)).filter(name => name.endsWith('.pending')), []);
    assert.equal((await listPdfVersions(directory, 'src'))[0].restorePoint, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('restore refuses foreign versions, traversal and externally changed sources', async () => {
  const { root, directory, target } = await fixture();
  try {
    const restore = (filename: string, expectedSha256 = hash('%PDF v2')) => restorePdfVersion({ directory, sourceId: 'src', filename, target, expectedSha256 });
    await assert.rejects(restore('other_3000.pdf'), /invalid-request/u);
    await assert.rejects(restore('../book.pdf'), /invalid-request/u);
    await assert.rejects(restore('src_9999.pdf'), /invalid-request/u);
    await assert.rejects(restore('src_2000.pdf', hash('stale')), /source-changed/u);
    assert.equal(await readFile(target, 'utf8'), '%PDF v2');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('undo walks back through saves without bouncing on its own restore points', async () => {
  const { root, directory, target } = await fixture();
  try {
    const undo = async (current: string) => {
      const filename = await selectUndoVersion(directory, 'src', hash(current));
      if (!filename) return null;
      await new Promise(resolve => setTimeout(resolve, 2));
      await restorePdfVersion({ directory, sourceId: 'src', filename, target, expectedSha256: hash(current) });
      return readFile(target, 'utf8');
    };
    assert.equal(await undo('%PDF v2'), '%PDF v1');
    assert.equal(await undo('%PDF v1'), '%PDF v0');
    assert.equal(await undo('%PDF v0'), null);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('deleting a version is limited to the session source', async () => {
  const { root, directory } = await fixture();
  try {
    await assert.rejects(deletePdfVersion(directory, 'src', 'other_3000.pdf'), /invalid-request/u);
    await deletePdfVersion(directory, 'src', 'src_1000.pdf');
    assert.deepEqual((await listPdfVersions(directory, 'src')).map(item => item.filename), ['src_2000.pdf']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
