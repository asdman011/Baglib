import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, writeFile, readFile, readdir, stat, utimes, rm } from 'node:fs/promises';
import { PdfViewCache, type PdfViewOptimizer } from '../../src/main/services/pdf-editor/view-cache';

async function fixture(context: { after: (callback: () => Promise<void>) => void }, optimizer?: PdfViewOptimizer, maxBytes = 4096) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'baglib-view-test-'));
  const source = path.join(root, 'source.pdf');
  await writeFile(source, '%PDF-1.7\noriginal');
  const cacheRoot = path.join(root, 'cache');
  let calls = 0;
  const cache = new PdfViewCache(cacheRoot, async (...args) => {
    calls++;
    if (optimizer) await optimizer(...args);
    else await writeFile(args[1], '%PDF-1.7\noptimized');
  }, { largeBytes: 1, maxBytes });
  context.after(async () => { await cache.dispose(); await rm(root, { recursive: true, force: true }); });
  return { root, source, cacheRoot, cache, calls: () => calls };
}

test('view cache returns original immediately, deduplicates work and reuses persisted output', async context => {
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  context.after(() => { finish(); return Promise.resolve(); });
  const item = await fixture(context, async (_, output) => { await gate; await writeFile(output, '%PDF-1.7\noptimized'); });
  const first = await item.cache.acquire(1, item.source);
  assert.equal(first.cached, false);
  assert.equal(first.pending, true);
  await item.cache.acquire(1, item.source, first.id);
  finish(); await item.cache.settled();
  const ready = await item.cache.acquire(1, item.source, first.id);
  assert.equal(ready.cached, true);
  assert.equal(ready.key, first.key);
  assert.equal(item.calls(), 1);
  assert.equal(await readFile(item.source, 'utf8'), '%PDF-1.7\noriginal');
  item.cache.release(1, first.id);
  const reopened = new PdfViewCache(item.cacheRoot, async () => { throw new Error('unexpected-generation'); }, { largeBytes: 1, maxBytes: 4096 });
  try { assert.equal((await reopened.acquire(2, item.source)).cached, true); }
  finally { await reopened.dispose(); }
});

test('view cache invalidates on path, modification time and size, and enforces owner boundaries', async context => {
  const item = await fixture(context);
  const first = await item.cache.acquire(1, item.source);
  await item.cache.settled();
  await assert.rejects(item.cache.acquire(2, item.source, first.id), /invalid-request/);
  item.cache.release(2, first.id);
  assert.equal((await item.cache.acquire(1, item.source, first.id)).cached, true);
  const info = await stat(item.source);
  await utimes(item.source, new Date(), new Date(info.mtimeMs + 5000));
  const changedTime = await item.cache.acquire(1, item.source, first.id);
  assert.notEqual(changedTime.key, first.key);
  assert.equal(changedTime.cached, false);
  await item.cache.settled();
  await writeFile(item.source, '%PDF-1.7\nlonger original');
  const changedSize = await item.cache.acquire(1, item.source, first.id);
  assert.notEqual(changedSize.key, changedTime.key);
  await item.cache.settled();
  const other = path.join(item.root, 'other.pdf');
  await writeFile(other, await readFile(item.source));
  await utimes(other, new Date(), (await stat(item.source)).mtime);
  assert.notEqual((await item.cache.acquire(1, other)).key, changedSize.key);
});

test('view cache evicts least recently opened entries while protecting active readers', async context => {
  const item = await fixture(context, async (_, output) => { await writeFile(output, '%PDF-' + 'x'.repeat(700)); }, 2100);
  const first = await item.cache.acquire(1, item.source);
  await item.cache.settled();
  await item.cache.acquire(1, item.source, first.id);
  const secondPath = path.join(item.root, 'second.pdf');
  await writeFile(secondPath, '%PDF-1.7\nsecond');
  const second = await item.cache.acquire(2, secondPath);
  await item.cache.settled();
  assert.equal((await item.cache.acquire(2, secondPath, second.id)).cached, false);
  item.cache.release(1, first.id);
  const thirdPath = path.join(item.root, 'third.pdf');
  await writeFile(thirdPath, '%PDF-1.7\nthird');
  const third = await item.cache.acquire(3, thirdPath);
  await item.cache.settled();
  assert.equal((await item.cache.acquire(3, thirdPath, third.id)).cached, true);
  const files = await readdir(item.cacheRoot);
  assert.ok(!files.includes(first.key + '.pdf'));
  let total = 0;
  for (const name of files) total += (await stat(path.join(item.cacheRoot, name))).size;
  assert.ok(total <= 2100);
});

test('view cache rejects bogus or over-budget optimizer output and preserves original fallback', async context => {
  for (const output of ['not a PDF', '%PDF-' + 'x'.repeat(5000)]) {
    const item = await fixture(context, async (_, destination) => { await writeFile(destination, output); });
    const first = await item.cache.acquire(1, item.source);
    await item.cache.settled();
    const ready = await item.cache.acquire(1, item.source, first.id);
    assert.equal(ready.cached, false);
    assert.equal(ready.pending, false);
    assert.deepEqual(await readdir(item.cacheRoot), []);
    assert.deepEqual(await readdir(item.cacheRoot + '-work'), []);
  }
});

test('view cache discards output when source changes during background optimization', async context => {
  const item = await fixture(context, async (source, destination) => {
    await writeFile(source, '%PDF-1.7\nchanged during job');
    await writeFile(destination, '%PDF-1.7\nold derivative');
  });
  await item.cache.acquire(1, item.source);
  await item.cache.settled();
  assert.deepEqual(await readdir(item.cacheRoot), []);
  assert.deepEqual(await readdir(item.cacheRoot + '-work'), []);
});

test('view cache shutdown aborts generation and rejects later acquisitions', async context => {
  let started!: () => void;
  const running = new Promise<void>(resolve => { started = resolve; });
  let aborted = false;
  const item = await fixture(context, async (_, output, __, signal) => {
    await writeFile(output, '%PDF-1.7\nincomplete');
    await new Promise<void>(resolve => {
      signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true });
      started();
    });
  });
  await item.cache.acquire(1, item.source);
  await running;
  await item.cache.dispose();
  assert.equal(aborted, true);
  assert.deepEqual(await readdir(item.cacheRoot), []);
  assert.deepEqual(await readdir(item.cacheRoot + '-work'), []);
  await assert.rejects(item.cache.acquire(1, item.source), /cancelled/);
});

test('view cache enforces a reduced cap on startup without deleting unrelated files', async context => {
  const item = await fixture(context);
  await item.cache.acquire(1, item.source);
  await item.cache.settled();
  await item.cache.dispose();
  await writeFile(path.join(item.cacheRoot, 'unrelated.txt'), 'keep');
  const reduced = new PdfViewCache(item.cacheRoot, async () => { throw new Error('should-not-run'); }, { maxBytes: 10 });
  try {
    assert.equal((await reduced.acquire(1, item.source)).cached, false);
    assert.deepEqual(await readdir(item.cacheRoot), ['unrelated.txt']);
  } finally { await reduced.dispose(); }
});
