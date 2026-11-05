import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { load } from 'js-yaml';
import { SourceUrlStore } from '../../src/main/services/source-urls';
import { DEFAULT_SOURCE_URLS, validSourceFile } from '../../src/shared/source-urls';
import type { ISettingsRepository } from '../../src/main/database/repositories/settings.repository';

function memory(): ISettingsRepository {
  const values = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback?: T) => (values.has(key) ? values.get(key) as T : fallback),
    set: (key, value) => { values.set(key, value); },
    getAll: () => Object.fromEntries(values),
    delete: key => values.delete(key),
  };
}
const file = (libgen: string[]) => JSON.stringify({ version: 1, updated: '2026-12-01', sources: { libgen, annas: ['https://annas.example'] } });

test('the address file accepts only https origins', () => {
  assert.deepEqual(validSourceFile(JSON.parse(file(['https://mirror.example/', 'https://mirror.example']))).sources.libgen, ['https://mirror.example']);
  for (const bad of ['http://mirror.example', 'https://user:pass@mirror.example', 'https://mirror.example:8443', 'https://mirror.example/path', 'javascript:alert(1)']) {
    assert.throws(() => validSourceFile(JSON.parse(file([bad]))), /invalid-source-file/, bad);
  }
  assert.throws(() => validSourceFile({ version: 2, updated: '2026-12-01', sources: {} }), /invalid-source-file/);
});

test('an imported file replaces the mirrors, a bad one is refused, and reset restores the built-in list', () => {
  const store = new SourceUrlStore(memory());
  assert.deepEqual(store.mirrors('libgen'), DEFAULT_SOURCE_URLS.sources.libgen);
  store.apply(file(['https://new.example']));
  assert.deepEqual([store.mirrors('libgen'), store.state().custom], [['https://new.example'], true]);
  assert.throws(() => store.apply('{not json'), /invalid-source-file/);
  assert.deepEqual(store.mirrors('libgen'), ['https://new.example']);
  store.reset();
  assert.deepEqual([store.mirrors('libgen'), store.state().custom], [DEFAULT_SOURCE_URLS.sources.libgen, false]);
});

test('updating from an address remembers it and refuses plain http', async () => {
  const fake = (async () => new Response(file(['https://remote.example']), { status: 200 })) as typeof fetch;
  const store = new SourceUrlStore(memory(), fake);
  const state = await store.update('https://example.org/sources.json');
  assert.deepEqual([state.file.sources.libgen, state.updateUrl], [['https://remote.example'], 'https://example.org/sources.json']);
  await assert.rejects(store.update('http://example.org/sources.json'), /invalid-request/);
  const failing = new SourceUrlStore(memory(), (async () => new Response('', { status: 404 })) as typeof fetch);
  await assert.rejects(failing.update('https://example.org/x.json'), /source-update-failed/);
});

test('no provider keeps its own mirror list any more', () => {
  for (const source of ['src/main/services/metadata/libgen.provider.ts', 'src/main/services/metadata/annas.provider.ts']) {
    assert.doesNotMatch(fs.readFileSync(source, 'utf8'), /_MIRRORS = \[/u, source);
  }
});

test('the installer can skip OCR, and keeps that choice on update', () => {
  const config = load(fs.readFileSync('electron-builder.yml', 'utf8')) as { nsis: { include: string }; extraResources: { to: string }[] };
  const script = fs.readFileSync(config.nsis.include, 'utf8');
  assert.match(script, /\$\{NSD_CreateCheckbox\} 0 74u 100% 14u "\$\(baglibOptionOcr\)"/u);
  assert.match(script, /ReadRegStr \$baglibSkipOcr HKCU "Software\\\$\{APP_GUID\}\\Setup" "SkipOcr"/u);
  // Every folder the installer may remove is one electron-builder actually ships there.
  const removed = [...script.matchAll(/RMDir \/r "\$INSTDIR\\resources\\([^"]+)"/gu)].map(match => match[1].replaceAll('\\', '/')).sort();
  assert.deepEqual(removed, ['pdf-engine/ocr-best', 'pdf-engine/tessdata', 'pdf-engine/tesseract']);
  for (const folder of removed) assert.ok(config.extraResources.some(item => item.to === folder), folder);
});
