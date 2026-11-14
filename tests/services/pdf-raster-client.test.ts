import { setTimeout as sleep } from 'node:timers/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PdfRasterClient } from '../../src/shared/pdf-raster-client';

function fixture(timeout = 1000) {
  const sent: { type: string; id?: number }[] = [];
  let terminated = false;
  const port = { onmessage: null as Worker['onmessage'], onerror: null as Worker['onerror'], onmessageerror: null as Worker['onmessageerror'], postMessage: (message: { type: string; id?: number }) => { sent.push(message); }, terminate: () => { terminated = true; } };
  const client = new PdfRasterClient(port, 'baglib-asset:///book.pdf', 'file:///vendor/pdfjs/', timeout);
  const emit = (data: unknown) => port.onmessage?.call(port as unknown as Worker, { data } as MessageEvent);
  return { client, sent, emit, terminated: () => terminated };
}

test('raster client never delays first-page fallback while its worker initializes', async () => {
  const item = fixture();
  try {
    assert.equal(await item.client.render(1, 1, 1, new AbortController().signal), null);
    assert.deepEqual(item.sent.map(message => message.type), ['init']);
    item.emit({ type: 'ready' });
    const rendering = item.client.render(2, 1, 1, new AbortController().signal);
    const bitmap = { close: () => assert.fail('Caller owns a successfully transferred bitmap') } as unknown as ImageBitmap;
    item.emit({ type: 'bitmap', id: item.sent.at(-1)?.id, bitmap });
    assert.equal(await rendering, bitmap);
  } finally { item.client.dispose(); }
});

test('raster client cancels stale jobs, closes late frames and isolates other requests', async () => {
  const item = fixture();
  try {
    item.emit({ type: 'ready' });
    const controller = new AbortController();
    const first = item.client.render(1, 1, 1, controller.signal), firstId = item.sent.at(-1)?.id;
    const second = item.client.render(2, 1, 1, new AbortController().signal), secondId = item.sent.at(-1)?.id;
    controller.abort();
    assert.equal(await first, null);
    assert.ok(item.sent.some(message => message.type === 'cancel' && message.id === firstId));
    let closed = false;
    item.emit({ type: 'bitmap', id: firstId, bitmap: { close: () => { closed = true; } } });
    assert.equal(closed, true);
    item.emit({ type: 'error', id: secondId });
    assert.equal(await second, null);
    assert.equal(item.client.ready, true);
  } finally { item.client.dispose(); }
});

test('raster client timeouts and shutdown settle every waiting request', async () => {
  const item = fixture(10);
  item.emit({ type: 'ready' });
  assert.equal(await item.client.render(1, 1, 1, new AbortController().signal), null);
  await sleep(350);
  assert.equal(item.terminated(), true);
  const pending = item.client.render(2, 1, 1, new AbortController().signal);
  item.client.dispose();
  assert.equal(await pending, null);
  await sleep(350);
  assert.equal(item.terminated(), true);
  assert.equal(item.client.ready, false);
  assert.equal(await item.client.render(3, 1, 1, new AbortController().signal), null);
});

test('raster client worker crashes immediately release pending draws for local fallback', async () => {
  const item = fixture();
  item.emit({ type: 'ready' });
  const pending = item.client.render(1, 1, 1, new AbortController().signal);
  item.emit({ type: 'error', error: 'worker-failed' });
  assert.equal(await pending, null);
  await sleep(350);
  assert.equal(item.terminated(), true);
  assert.equal(item.client.ready, false);
});
