import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdfByteSource } from '../../src/shared/pdf-byte-source';

test('PDF byte source reads only requested ranges and forwards cancellation', async context => {
  const controller = new AbortController();
  const ranges: string[] = [];
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(init.signal, controller.signal);
    if (init.method === 'HEAD') return new Response(null, { headers: { 'Content-Length': '100000', 'Accept-Ranges': 'bytes' } });
    const range = (init.headers as Record<string, string>).Range;
    ranges.push(range);
    const [begin, end] = range.slice(6).split('-').map(Number);
    return new Response(new Uint8Array(end - begin + 1), { status: 206, headers: { 'Content-Range': `bytes ${begin}-${end}/100000` } });
  });
  const source = await openPdfByteSource('baglib-asset:///D:/book.pdf', controller.signal);
  assert.equal(source.initialData.length, 65536);
  assert.equal((await source.read(90000, 90010)).length, 10);
  assert.deepEqual(ranges, ['bytes=0-65535', 'bytes=90000-90009']);
  await assert.rejects(source.read(-1, 10), /invalid-request/);
  await assert.rejects(source.read(0, 100001), /invalid-request/);
  controller.abort();
  await assert.rejects(source.read(0, 1));
  assert.equal(ranges.length, 2);
});

test('range readers cancel unexpected whole-file responses instead of buffering them', async context => {
  let cancelled = false;
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (init.method === 'HEAD') return new Response(null, { headers: { 'Content-Length': '100000', 'Accept-Ranges': 'bytes' } });
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 200 });
  });
  await assert.rejects(openPdfByteSource('baglib-asset:///D:/book.pdf', new AbortController().signal), /invalid-output/);
  assert.equal(cancelled, true);
});

test('range readers reject mismatched range metadata and truncated response bodies', async context => {
  for (const mismatchedHeader of [true, false]) {
    context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      if (init.method === 'HEAD') return new Response(null, { headers: { 'Content-Length': '100000', 'Accept-Ranges': 'bytes' } });
      return new Response(new Uint8Array(mismatchedHeader ? 65536 : 2), { status: 206, headers: { 'Content-Range': mismatchedHeader ? 'bytes 1-65536/100000' : 'bytes 0-65535/100000' } });
    });
    await assert.rejects(openPdfByteSource('baglib-asset:///D:/book.pdf', new AbortController().signal), /invalid-output/);
    context.mock.restoreAll();
  }
});

test('range readers stop oversized response streams at the requested byte budget', async context => {
  let cancelled = false;
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (init.method === 'HEAD') return new Response(null, { headers: { 'Content-Length': '100000', 'Accept-Ranges': 'bytes' } });
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65537)); }, cancel() { cancelled = true; } }), { status: 206, headers: { 'Content-Range': 'bytes 0-65535/100000' } });
  });
  await assert.rejects(openPdfByteSource('baglib-asset:///D:/book.pdf', new AbortController().signal), /invalid-output/);
  assert.equal(cancelled, true);
});
