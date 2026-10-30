import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAssetRange, streamAssetResponse } from '../../src/main/services/digital/asset-range';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('local PDF ranges support bounded, open-ended and suffix requests', () => {
  assert.deepEqual(parseAssetRange('bytes=0-99', 1000), { start: 0, end: 99 });
  assert.deepEqual(parseAssetRange('bytes=900-', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseAssetRange('bytes=-100', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseAssetRange('bytes=900-1500', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseAssetRange('bytes=-1500', 1000), { start: 0, end: 999 });
});

test('local PDF ranges reject invalid, multiple, empty and unsatisfiable requests', () => {
  for (const header of ['bytes=-', 'bytes=-0', 'bytes=1000-', 'bytes=10-9', 'bytes=abc-10', 'bytes=0-1,2-3', 'bytes=1.5-10', 'bytes=9007199254740992-', 'items=0-1']) {
    assert.equal(parseAssetRange(header, 1000), null, header);
  }
  assert.equal(parseAssetRange('bytes=0-', 0), null);
});

test('production asset streaming serves exact byte ranges and body-free HEAD responses', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-range-'));
  try {
    const filename = path.join(directory, 'ملف — book.pdf');
    await writeFile(filename, '0123456789');
    const head = await streamAssetResponse(new Request('https://local.test', { method: 'HEAD' }), filename, 'application/pdf');
    assert.equal(head.headers.get('content-length'), '10');
    assert.equal(head.headers.get('accept-ranges'), 'bytes');
    assert.equal(head.body, null);
    const partial = await streamAssetResponse(new Request('https://local.test', { headers: { Range: 'bytes=2-5' } }), filename, 'application/pdf', { 'Access-Control-Allow-Origin': 'app://-' });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(partial.headers.get('content-length'), '4');
    assert.equal(partial.headers.get('access-control-allow-origin'), 'app://-');
    assert.equal(await partial.text(), '2345');
    const invalid = await streamAssetResponse(new Request('https://local.test', { headers: { Range: 'bytes=99-' } }), filename, 'application/pdf');
    assert.equal(invalid.status, 416);
    assert.equal(invalid.body, null);
    assert.equal(await (await streamAssetResponse(new Request('https://local.test'), filename, 'application/pdf')).text(), '0123456789');
    const controller = new AbortController(); controller.abort();
    await assert.rejects(async () => (await streamAssetResponse(new Request('https://local.test', { signal: controller.signal }), filename, 'application/pdf')).arrayBuffer());
  } finally { await rm(directory, { recursive: true, force: true }); }
});
