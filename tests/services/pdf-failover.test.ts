import { setTimeout as sleep } from 'node:timers/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { PdfViewCache } from '../../src/main/services/pdf-editor/view-cache';
import { PdfRasterClient } from '../../src/shared/pdf-raster-client';
import { idlePdfTextStream } from '../../src/shared/pdf-text-stream';

const preview = { image: 'data:image/webp;base64,AAAA', width: 595, height: 842, pages: 3 };

async function fixture(context: { after: (callback: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'baglib-failover-'));
  const source = path.join(root, 'source.pdf');
  await writeFile(source, '%PDF-1.7\noriginal');
  const cacheRoot = path.join(root, 'cache');
  const cache = new PdfViewCache(cacheRoot, async (_, output) => writeFile(output, '%PDF-1.7\noptimized'), { largeBytes: 1, maxBytes: 4096, previewBytes: 200 });
  context.after(async () => { await cache.dispose(); await rm(root, { recursive: true, force: true }); });
  return { root, source, cacheRoot, cache };
}

function rasterFixture(onSourceFailed: () => void) {
  let terminated = false;
  const sent: { type: string; id?: number; method?: string }[] = [];
  const port = { onmessage: null as Worker['onmessage'], onerror: null as Worker['onerror'], onmessageerror: null as Worker['onmessageerror'], postMessage: (message: { type: string }) => { sent.push(message); }, terminate: () => { terminated = true; } };
  const client = new PdfRasterClient(port, 'baglib-asset:///book.pdf', 'file:///vendor/pdfjs/', { timeoutMs: 1000, onSourceFailed });
  const emit = (data: unknown) => port.onmessage?.call(port as unknown as Worker, { data } as MessageEvent);
  return { client, emit, sent, terminated: () => terminated };
}

test('a failed derivative is evicted and later opens read the original without regenerating', async context => {
  const { cacheRoot, source, cache } = await fixture(context);
  const first = await cache.acquire(1, source);
  await cache.settled();
  const cached = await cache.acquire(1, source, first.id);
  assert.equal(cached.cached, true);
  await cache.evict(1, first.id);
  assert.deepEqual((await readdir(cacheRoot)).filter(name => name.endsWith('.json')), []);
  const after = await cache.acquire(1, source, first.id);
  assert.equal(after.cached, false);
  await cache.settled();
  assert.equal((await cache.acquire(1, source, first.id)).cached, false);
  assert.ok(!after.url.includes(cacheRoot.replaceAll('\\', '/')));
});

test('another owner cannot evict a derivative it does not lease', async context => {
  const { source, cache } = await fixture(context);
  const first = await cache.acquire(1, source);
  await cache.settled();
  await cache.evict(2, first.id);
  assert.equal((await cache.acquire(1, source, first.id)).cached, true);
});

test('late range failure in the host reports once and ends the client', async () => {
  let failures = 0;
  const item = rasterFixture(() => { failures++; });
  item.emit({ type: 'ready', pages: 3, firstPage: { width: 1, height: 1, rotation: 0, rawDims: {} } });
  assert.equal(item.client.ready, true);
  item.emit({ type: 'source-failed', error: 'late read' });
  assert.equal(failures, 1);
  assert.equal(item.client.ready, false);
  // The client gives the host a bounded moment to destroy its nested parser before terminating it.
  await sleep(350);
  assert.equal(item.terminated(), true);
});

test('worker document calls resolve by id and shutdown rejects whatever is still waiting', async () => {
  const item = rasterFixture(() => undefined);
  item.emit({ type: 'ready', pages: 3, firstPage: { width: 1, height: 1, rotation: 0, rawDims: {} } });
  assert.equal((await item.client.whenReady)?.pages, 3);
  const text = item.client.call<{ items: unknown[] }>('text', 2);
  const call = item.sent.at(-1)!;
  assert.equal(call.method, 'text');
  item.emit({ type: 'result', id: call.id, value: { items: [] } });
  assert.deepEqual(await text, { items: [] });
  const stranded = item.client.call('outline');
  item.client.dispose();
  await assert.rejects(stranded, /engine-failed/u);
});

test('a host that never becomes ready settles to null so the renderer path can open the book', async () => {
  const item = rasterFixture(() => undefined);
  item.emit({ type: 'error', error: 'worker boot failed' });
  assert.equal(await item.client.whenReady, null);
  await sleep(350);
  assert.equal(item.terminated(), true);
});

test('first-paint previews follow the source identity and stay inside their budget', async context => {
  const { source, cache } = await fixture(context);
  const lease = await cache.acquire(1, source);
  assert.equal(lease.preview, undefined);
  await cache.savePreview(1, lease.id, 2, preview);
  assert.deepEqual((await cache.acquire(1, source, undefined, 2)).preview, preview);
  assert.equal((await cache.acquire(1, source, undefined, 1)).preview, undefined);
  await assert.rejects(cache.savePreview(2, lease.id, 2, preview), /invalid-request/u);
  await assert.rejects(cache.savePreview(1, lease.id, 2, { ...preview, image: 'https://example.com/x.png' }), /invalid-request/u);
  const later = new Date(Date.now() + 5000);
  await utimes(source, later, later);
  assert.equal((await cache.acquire(1, source, undefined, 2)).preview, undefined);
});

test('old previews are dropped once the preview budget is exceeded', async context => {
  const { cacheRoot, source, cache } = await fixture(context);
  const lease = await cache.acquire(1, source);
  for (let page = 1; page <= 5; page++) {
    await cache.savePreview(1, lease.id, page, { ...preview, pages: 5 });
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.ok((await readdir(`${cacheRoot}-preview`)).length < 5);
  assert.deepEqual((await cache.acquire(1, source, undefined, 5)).preview, { ...preview, pages: 5 });
});

test('text layers receive bounded idle slices with styles only on the first', async () => {
  const items = Array.from({ length: 7 }, (_, index) => ({ str: `${index}` }));
  const reader = idlePdfTextStream({ items, styles: { font: 1 }, lang: 'ar' }, 3, work => { setTimeout(work, 0); }).getReader();
  const chunks = [];
  for (let next = await reader.read(); !next.done; next = await reader.read()) chunks.push(next.value);
  assert.deepEqual(chunks.map(chunk => chunk.items.length), [3, 3, 1]);
  assert.deepEqual(chunks[0].styles, { font: 1 });
  assert.deepEqual(chunks[1].styles, {});
  assert.equal(chunks[2].lang, 'ar');
});

test('an empty page still completes its text stream', async () => {
  const reader = idlePdfTextStream({ items: [], styles: {}, lang: null }, 3, work => { setTimeout(work, 0); }).getReader();
  const first = await reader.read();
  assert.deepEqual(first.value?.items, []);
  assert.equal((await reader.read()).done, true);
});

test('cancelling a text layer drops the slice still waiting for idle time', async () => {
  const waiting: (() => void)[] = [];
  const reader = idlePdfTextStream({ items: [{ str: 'a' }, { str: 'b' }], styles: {}, lang: null }, 1, work => { waiting.push(work); }).getReader();
  const read = reader.read();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(waiting.length, 1);
  await reader.cancel();
  assert.doesNotThrow(() => waiting[0]());
  assert.equal((await read).done, true);
});
