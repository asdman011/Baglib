import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CardMediaStore, MAX_CARD_MEDIA_BYTES, sniffImageType } from '../../src/main/services/card-media';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]);

test('card media: stored once by content hash, read back as a data URL', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-card-media-'));
  try {
    const store = new CardMediaStore(dir);
    const a = store.save(PNG);
    const b = store.save(PNG);
    assert.equal(a.name, b.name);
    assert.equal(fs.readdirSync(dir).length, 1, 'identical images share one file');
    assert.ok(a.dataUrl.startsWith('data:image/png;base64,'));
    assert.equal(store.save(JPG).name.endsWith('.jpg'), true);
    assert.deepEqual(store.read(a.name)?.dataUrl, a.dataUrl);
    assert.deepEqual(store.list().sort(), fs.readdirSync(dir).sort());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('card media: rejects non-images, oversize files and unsafe names', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-card-media-'));
  try {
    const store = new CardMediaStore(dir);
    assert.throws(() => store.save(new TextEncoder().encode('<svg onload=alert(1)>')), /card-media-unsupported/u);
    assert.throws(() => store.save(new Uint8Array(0)), /card-media-empty/u);
    const big = new Uint8Array(MAX_CARD_MEDIA_BYTES + 1);
    big.set(PNG);
    assert.throws(() => store.save(big), /card-media-too-large/u);
    for (const name of ['../baglib.db', 'x.png', `${'a'.repeat(40)}.svg`, `..\${'a'.repeat(40)}.png`]) {
      assert.equal(store.read(name), null, name);
    }
    assert.equal(sniffImageType(new TextEncoder().encode('GIF89a....')), 'gif');
    assert.equal(sniffImageType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')), 'webp');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
