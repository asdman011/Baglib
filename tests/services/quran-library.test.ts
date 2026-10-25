import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { zipSync, strToU8 } from 'fflate';
import { QuranLibraryService } from '../../src/main/services/quran/quran-library.service';
import { installPackage } from '../../src/main/services/quran/install-package';
import { category, normalizeQuranSearch, parseResourceListing, parseResourceDetails, validateSourceUrl } from '../../src/main/services/quran/qul-catalog';
import { QuranStore } from '../../src/main/services/quran/quran-store';
import { QURAN_CATEGORIES } from '../../src/shared/types/quran';

const listing = '<h3><a href="/resources/quran-script/86">نَصّ القرآن — Hafs</a></h3><h3><a href="/resources/quran-script/warsh">نص ورش — Warsh</a></h3>';
const resource = parseResourceListing(listing, 'quran-script')[0];

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'baglib-quran-'));
  try { await run(root); } finally {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
}

test('all fourteen resource categories have explicit keys and invalid source URLs are rejected', () => {
  assert.equal(QURAN_CATEGORIES.length, 14);
  for (const value of QURAN_CATEGORIES) assert.equal(category(value), value);
  assert.throws(() => category('private-api'));
  for (const url of ['http://qul.tarteel.ai/resources', 'https://qul.tarteel.ai.evil.test/', 'file:///etc/passwd', 'https://user:password@qul.tarteel.ai/']) assert.throws(() => validateSourceUrl(url));
});

test('resource profiles are independent and unknown Qiraah/riwayah/tariq are not invented', () => {
  const parsed = parseResourceListing(listing, 'quran-script');
  assert.equal(parsed.length, 2);
  assert.notEqual(parsed[0].profile.key, parsed[1].profile.key);
  assert.equal(parsed[0].profile.qiraah, null);
  assert.equal(parsed[0].profile.riwayah, null);
  assert.equal(parsed[0].profile.tariq, null);
  assert.equal(parsed[0].profile.verified, false);
  assert.equal(parseResourceListing('<h3><a href="https://evil.test/resources/quran-script/86">x</a></h3>', 'quran-script').length, 0);
});

test('download tokens are ephemeral and restricted source pages expose no actionable links', () => {
  const html = '<body><h1>Resource</h1><a href="/resources/quran-script/01234567890123456789012345678901/download">Download sqlite</a></body>';
  const details = parseResourceDetails(html, resource);
  assert.equal(details.downloads.length, 1);
  assert.equal(JSON.stringify(details.resource).includes('01234567890123456789012345678901'), false);
  assert.equal(parseResourceDetails(html.replace('Resource', 'This resource is © copyrighted'), resource).downloads.length, 0);
});

test('catalog SQLite supports conservative Arabic search, paging and offline reopening', async () => fixture(async root => {
  const store = new QuranStore(root);
  try {
  store.saveResources(parseResourceListing(listing, 'quran-script'));
  assert.equal(store.library({ search: 'نص القرآن' }).resources.length, 1);
  assert.notEqual(normalizeQuranSearch('رحمة'), normalizeQuranSearch('رحمه'));
  assert.notEqual(normalizeQuranSearch('على'), normalizeQuranSearch('علي'));
  store.saveResources(Array.from({ length: 70 }, (_, position) => ({ ...resource, id: `quran-script/test-${position}`, title: `Title ${position}` })));
  assert.equal(store.library().resources.length, 60);
  assert.equal(store.library().hasMore, true);
  for (let index = 0; index < 75; index++) store.savePack({ id: randomUUID(), resource, digest: `${index}`, bytes: 1, files: [], installedAt: '', capability: 'stored' });
  assert.equal(store.library({ view: 'installed' }).installed.length, 60);
  assert.equal(store.library({ view: 'installed' }).hasMore, true);
  assert.equal(store.library({ view: 'installed', offset: 60 }).installed.length, 15);
  assert.equal(store.library({ search: 'نص القرآن' }).installed.length, 1);
  } finally { store.close(); }
  const reopened = new QuranStore(root);
  try { assert.ok(reopened.library({ offset: 60 }).resources.length > 0); } finally { reopened.close(); }
}));

test('isolated installer persists SQLite bytes and failed updates retain the existing version', async () => fixture(async root => {
  const service = new QuranLibraryService(root, async () => listing, async request => installPackage(request.root, request.id, request.archive, request.resource));
  await service.initialize();
  try {
    await service.refresh('quran-script');
    const filename = path.join(root, 'source.sqlite');
    const database = new Database(filename);
    database.exec('CREATE TABLE verses(verse_key TEXT, text TEXT)');
    database.prepare('INSERT INTO verses VALUES (?, ?)').run('1:1', 'بِسْمِ الله');
    database.close();
    const bytes = await readFile(filename);
    const archive = path.join(root, 'selected.zip');
    await writeFile(archive, zipSync({ 'source.db': bytes }));
    const first = service.createJob(resource.id);
    await service.installFile(first, archive);
    assert.equal(service.store.packs().length, 1);
    const saved = await readFile(path.join(root, 'packs', first.id, '0.sqlite'));
    assert.deepEqual(saved, bytes);
    const bad = path.join(root, 'bad.zip');
    await writeFile(bad, zipSync({ '../escape.sqlite': bytes }));
    const next = service.createJob(resource.id);
    await service.installFile(next, bad);
    assert.equal(service.store.jobs().find(job => job.id === next.id)?.state, 'failed');
    assert.equal(service.store.packs().length, 1);
    assert.deepEqual(await readdir(path.join(root, 'staging')), []);
    await service.remove(first.id);
    assert.equal(service.store.packs().length, 0);
    assert.deepEqual(await readFile(filename), bytes);
  } finally { await service.dispose(); }
}));

test('restart recovery marks interrupted jobs and removes only manager-owned incomplete folders', async () => fixture(async root => {
  const store = new QuranStore(root);
  const id = randomUUID();
  store.saveJob({ id, resourceId: resource.id, title: resource.title, state: 'installing', received: 0, total: 0, error: null, updatedAt: new Date().toISOString() });
  store.close();
  await mkdir(path.join(root, 'staging', id), { recursive: true });
  await mkdir(path.join(root, 'staging', 'not-manager-owned'), { recursive: true });
  const service = new QuranLibraryService(root, async () => listing, async request => installPackage(request.root, request.id, request.archive, request.resource));
  await service.initialize();
  try {
    assert.equal(service.store.jobs()[0].error, 'interrupted');
    assert.deepEqual(await readdir(path.join(root, 'staging')), ['not-manager-owned']);
  } finally { await service.dispose(); }
}));

test('cancelled queued jobs do not publish a pack', async () => fixture(async root => {
  let installs = 0;
  const service = new QuranLibraryService(root, async () => listing, async () => { installs++; throw new Error('cancelled'); });
  await service.initialize();
  try {
    await service.refresh('quran-script');
    const job = service.createJob(resource.id);
    service.cancel(job.id);
    service.update({ ...job, state: 'downloading' });
    await service.installFile(job, 'unused');
    assert.equal(installs, 0);
    assert.equal(service.store.jobs()[0].state, 'cancelled');
    assert.equal(service.store.packs().length, 0);
  } finally { await service.dispose(); }
}));

test('downloaded executable SQLite schema and unsupported active formats are rejected', async () => fixture(async root => {
  const filename = path.join(root, 'source.db');
  const database = new Database(filename);
  database.exec('CREATE TABLE verses(id INTEGER); CREATE VIEW active AS SELECT * FROM verses');
  database.close();
  await assert.rejects(installPackage(root, randomUUID(), filename, resource), /invalid-package/);
  const html = path.join(root, 'login.html');
  await writeFile(html, '<html><script>unsafe()</script></html>');
  await assert.rejects(installPackage(root, randomUUID(), html, resource), /unsupported-format/);
  const zip = path.join(root, 'nested.zip');
  await writeFile(zip, zipSync({ 'worker.js': strToU8('unsafe()') }));
  await assert.rejects(installPackage(root, randomUUID(), zip, resource), /unsupported-format/);
}));
