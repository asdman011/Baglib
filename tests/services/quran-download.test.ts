import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { downloadToFile, selectedExport } from '../../src/main/services/quran/resource-download';
import { QuranLibraryService } from '../../src/main/services/quran/quran-library.service';
import { canonicalResourceId, presetResource, readerPreset } from '../../src/main/services/quran/reader-resources';
import type { QuranPack } from '../../src/shared/types/quran';

test('official semantic resource IDs repair placeholder URLs without invalidating legacy packs', () => {
  for (const [legacy, current] of [['surah-info/en', 'surah-info/3'], ['ayah-theme/default', 'ayah-theme/62'], ['ayah-topics/default', 'ayah-topics/45']]) {
    assert.equal(canonicalResourceId(legacy), current);
    assert.equal(presetResource(legacy).sourcePath, `/resources/${current}`);
    const pack: QuranPack = { id: 'legacy', resource: { ...presetResource(current), id: legacy }, digest: '', bytes: 0, files: [{ name: 'source.sqlite', bytes: 0, type: 'sqlite' }], installedAt: '', capability: 'stored' };
    assert.equal(readerPreset(pack)?.id, current);
    assert.equal(pack.resource.id, legacy);
  }
});

test('batch export selection is first-party, format-aware and respects authentication/restrictions', () => {
  const resource = presetResource('translation/193');
  const token = '/resources/translation/01234567890123456789012345678901/download';
  assert.equal(selectedExport(`<a href="${token}">SQLite with inline footnotes</a>`, resource), `https://qul.tarteel.ai${token}`);
  assert.throws(() => selectedExport(`<a href="${token}">Plain SQLite</a>`, resource), /unsupported-format/);
  assert.throws(() => selectedExport('<a href="https://evil.test/export">SQLite</a>', resource), /restricted/);
  assert.throws(() => selectedExport(`<html><body>This resource is copyrighted<a href="${token}">SQLite inline</a></body></html>`, resource), /restricted/);
});

test('bounded streaming validates each redirect, cleans failed transfers and preserves existing files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'baglib-download-'));
  const filename = path.join(root, 'file');
  const signal = new AbortController().signal;
  const options = { url: 'https://qul.tarteel.ai/start', filename, signal, limit: 10, origins: new Set(['https://qul.tarteel.ai', 'https://storage.test']) };
  try {
    const requests: string[] = [];
    await downloadToFile({ ...options, fetcher: async url => { requests.push(url); return requests.length === 1 ? new Response(null, { status: 302, headers: { location: 'https://storage.test/pack' } }) : new Response('pack', { headers: { 'content-length': '4' } }); } });
    assert.equal(await readFile(filename, 'utf8'), 'pack');
    assert.deepEqual(requests, ['https://qul.tarteel.ai/start', 'https://storage.test/pack']);
    await assert.rejects(() => downloadToFile({ ...options, fetcher: async () => new Response('other') }));
    assert.equal(await readFile(filename, 'utf8'), 'pack');
    await rm(filename);
    await assert.rejects(() => downloadToFile({ ...options, fetcher: async () => new Response(null, { status: 302, headers: { location: 'https://evil.test/file' } }) }), /invalid-resource/);
    await assert.rejects(() => downloadToFile({ ...options, fetcher: async () => new Response('far too many bytes') }), /invalid-package/);
    await assert.rejects(() => readFile(filename), /ENOENT/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(() => downloadToFile({ ...options, signal: controller.signal, fetcher: async () => new Response('data') }));
    await assert.rejects(() => readFile(filename), /ENOENT/);
    await writeFile(filename, 'untouched');
  } finally { assert.equal(path.dirname(root), path.resolve(tmpdir())); await rm(root, { recursive: true, force: true }); }
});

test('mixed resource batches are sequential, deduplicated, cancellable and continue after failure', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'baglib-batch-'));
  const service = new QuranLibraryService(root, async () => '', async () => { throw new Error('unexpected installer'); });
  try {
    await service.initialize();
    const ids = ['quran-script/312', 'tafsir/22', 'translation/193'];
    service.store.saveResources(ids.map(presetResource));
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    const calls: string[] = [];
    const jobs = service.enqueue([...ids, ids[0]], async job => { calls.push(job.resourceId); await gate; if (job.resourceId === ids[0]) throw new Error('network'); return null; });
    assert.equal(jobs.length, 3);
    assert.equal(service.enqueue(ids, async () => null).length, 3);
    service.cancel(jobs[1]);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(calls, [ids[0]]);
    release();
    for (let attempt = 0; service.busy && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(service.busy, false);
    assert.deepEqual(calls, [ids[0], ids[2]]);
    assert.equal(service.store.jobs().find(job => job.id === jobs[0])?.state, 'failed');
    assert.equal(service.store.jobs().find(job => job.id === jobs[1])?.state, 'cancelled');
    assert.equal(service.store.jobs().find(job => job.id === jobs[2])?.state, 'complete');
    assert.throws(() => service.enqueue(['../unknown'], async () => null), /invalid-resource/);
  } finally { await service.dispose(); assert.equal(path.dirname(root), path.resolve(tmpdir())); await rm(root, { recursive: true, force: true }); }
});
