import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEFAULT_SOURCE_URLS,
  isMirrorUrl,
  mirrorReferer,
  mirrorRequestPatterns,
  primaryLibgenOrigin,
  validSourceFile,
  type SourceUrlFile,
} from '../../src/shared/source-urls';

const raw = (sources: Record<string, unknown>) => ({ version: 1, updated: '2026-12-01', sources });

const custom = (overrides: { libgen?: string[]; downloads?: string[] } = {}): SourceUrlFile =>
  validSourceFile(raw({
    libgen: overrides.libgen ?? ['https://libgen.example'],
    annas: ['https://annas.example'],
    ...(overrides.downloads ? { downloads: overrides.downloads } : {}),
  }));

test('an older file without downloads still validates and gets the built-in download hosts', () => {
  const file = validSourceFile(raw({ libgen: ['https://mirror.example'], annas: ['https://annas.example'] }));
  assert.deepEqual(file.sources.downloads, DEFAULT_SOURCE_URLS.sources.downloads);
  assert.deepEqual(file.sources.downloads, ['https://booksdl.lc']);
});

test('a downloads entry must be a plain https origin', () => {
  for (const bad of ['http://booksdl.example', 'https://booksdl.example/path', 'https://booksdl.example:8443']) {
    assert.throws(() => custom({ downloads: [bad] }), /invalid-source-file/, bad);
  }
  assert.throws(() => custom({ downloads: [] }), /invalid-source-file/);
});

test('validation de-duplicates download hosts like the other lists', () => {
  const file = custom({ downloads: ['https://booksdl.example/', 'https://booksdl.example', 'https://other.example'] });
  assert.deepEqual(file.sources.downloads, ['https://booksdl.example', 'https://other.example']);
});

test('the default file gets a pattern per libgen mirror, then per download host, without duplicates', () => {
  const patterns = mirrorRequestPatterns(DEFAULT_SOURCE_URLS);
  assert.ok(patterns.includes('*://*.libgen.li/*'));
  assert.ok(patterns.includes('*://*.booksdl.lc/*'));
  assert.deepEqual(patterns.slice(0, DEFAULT_SOURCE_URLS.sources.libgen.length),
    DEFAULT_SOURCE_URLS.sources.libgen.map(origin => `*://*.${new URL(origin).host}/*`));
  assert.equal(patterns.at(-1), '*://*.booksdl.lc/*');
  assert.equal(new Set(patterns).size, patterns.length);
});

test('a custom mirror gets its pattern and becomes the primary origin', () => {
  const file = custom({ libgen: ['https://libgen.example', 'https://libgen.li'] });
  assert.deepEqual(mirrorRequestPatterns(file).slice(0, 2), ['*://*.libgen.example/*', '*://*.libgen.li/*']);
  assert.equal(primaryLibgenOrigin(file), 'https://libgen.example');
});

test('isMirrorUrl matches an exact host, a subdomain and a download host', () => {
  const file = custom({ libgen: ['https://libgen.example'], downloads: ['https://booksdl.example'] });
  assert.equal(isMirrorUrl(file, 'https://libgen.example/ads.php?md5=abc'), true);
  assert.equal(isMirrorUrl(file, 'https://cdn.libgen.example/get.php'), true);
  assert.equal(isMirrorUrl(file, 'https://booksdl.example/file.pdf'), true);
  assert.equal(isMirrorUrl(file, 'https://download.booksdl.example/file.pdf'), true);
});

test('isMirrorUrl rejects look-alike hosts and invalid urls', () => {
  assert.equal(isMirrorUrl(DEFAULT_SOURCE_URLS, 'https://evil-libgen.li.attacker.com/x'), false);
  assert.equal(isMirrorUrl(DEFAULT_SOURCE_URLS, 'https://attacker.com/libgen.li'), false);
  assert.equal(isMirrorUrl(DEFAULT_SOURCE_URLS, 'not a url'), false);
  assert.equal(isMirrorUrl(DEFAULT_SOURCE_URLS, ''), false);
});

test('mirrorReferer uses the matching mirror for a mirror and the primary origin for a download host', () => {
  const file = custom({ libgen: ['https://libgen.example', 'https://second.example'], downloads: ['https://booksdl.example'] });
  assert.equal(mirrorReferer(file, 'https://second.example/ads.php?md5=abc'), 'https://second.example/');
  assert.equal(mirrorReferer(file, 'https://booksdl.example/get.php?md5=abc'), 'https://libgen.example/');
  assert.equal(mirrorReferer(file, 'https://cdn.booksdl.example/get.php'), 'https://libgen.example/');
});

test('mirrorReferer falls back to the primary origin for an unknown or invalid url', () => {
  const file = custom();
  assert.equal(mirrorReferer(file, 'https://elsewhere.example/file.pdf'), 'https://libgen.example/');
  assert.equal(mirrorReferer(file, 'not a url'), 'https://libgen.example/');
});

test('no download service hard-codes a libgen mirror any more', () => {
  for (const source of ['src/main/services/shield/content-shield.service.ts', 'src/main/services/digital/libgen-download.service.ts']) {
    assert.equal(fs.readFileSync(source, 'utf8').includes('libgen.li'), false, source);
  }
});
