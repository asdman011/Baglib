import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { validateResearchBlobId, applyResearchEditorAppearance } from '../../src/shared/research-editor';
import { researchEditorAssets } from '../../src/main/services/research-editor-assets';
import { researchEditorAvailable, researchEditorDirectory, researchEditorFile } from '../../src/main/services/research-editor-serving';
import { createResearchEditorHost, shouldForwardEditorShortcut } from '../../src/renderer/components/research/editor-host';
import { navItemAvailable, NAV_GROUPS, NAV_ITEMS } from '../../src/renderer/components/layout/nav-model';
import { translations } from '../../src/renderer/translations';
import type { ManuscriptDocument, ManuscriptsAPI } from '../../src/shared/manuscripts';
import type { ResearchEditorAssets } from '../../src/shared/research-editor';

for (const available of [false, true]) test(`Editor navigation availability ${available}`, () => {
  const ids = NAV_GROUPS.find(group => group.id === 'notes')!.itemIds.filter(id => navItemAvailable(id, available));
  assert.equal(ids[0], available ? 'notes-editor' : 'notes');
  assert.equal(ids.includes('notes-editor'), available);
  assert.equal(NAV_ITEMS['notes-editor'].labelKey, 'navEditor');
  assert.equal(translations.en.navEditor, 'Editor');
  assert.match(translations.ar.navEditor, /[\u0600-\u06ff]/u);
});
for (const id of ['abc-123_', 'a'.repeat(128), 's1S4y0cMdt3dnq1jxkHmYhY0dG6qhmvZjxq9ovwkqI8=']) test(`valid blob id ${id.slice(0, 8)}`, () => validateResearchBlobId(id));
for (const id of ['', '.', '..', '../file', 'a/b', 'a\\b', 'C:drive', '%2e%2e', 'a\0', 'a'.repeat(129), '=abc', 'abc===']) test(`reject blob id ${JSON.stringify(id)}`, () => assert.throws(() => validateResearchBlobId(id)));

test('filesystem blobs retain bytes and MIME across instances, serialize races and delete', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'baglib-editor-'));
  try {
    const first = researchEditorAssets(path.join(root, 'baglib.db'));
    assert.equal(await first.get('missing'), null);
    const value = { bytes: new Uint8Array([0, 1, 200, 255]), type: 'image/png' };
    await Promise.all([first.set('content=', value), first.set('content=', value)]);
    const second = researchEditorAssets(path.join(root, 'baglib.db'));
    assert.deepEqual(await second.get('content='), value);
    assert.deepEqual(await second.list(), ['content=']);
    assert.deepEqual(new Uint8Array(await readFile(path.join(root, 'manuscript-assets/content=/data'))), value.bytes);
    await assert.rejects(second.set('content=', { ...value, bytes: new Uint8Array([99]) }));
    await assert.rejects(second.get('../baglib.db'));
    await second.delete('content=');
    assert.deepEqual(await first.list(), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('serving optional editor separately from renderer fallback in both directory layouts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'baglib-serving-'));
  try {
    const editor = researchEditorDirectory(false, 'unused', root), renderer = path.join(root, 'out');
    assert.equal(researchEditorDirectory(true, root, 'unused'), path.join(root, 'research-editor'));
    assert.equal(await researchEditorAvailable(editor), false);
    await mkdir(editor, { recursive: true }); await mkdir(renderer);
    await writeFile(path.join(editor, 'index.html'), 'editor'); await writeFile(path.join(renderer, 'index.html'), 'renderer');
    assert.equal(await researchEditorAvailable(editor), true);
    assert.match((await researchEditorFile('app://-/research-editor/index.html', editor, renderer))!, /research-editor\/dist\/index.html$/);
    assert.equal(await researchEditorFile('http://localhost:3000/research-editor/index.html', editor, renderer), await researchEditorFile('app://-/research-editor/index.html', editor, renderer));
    assert.equal(await researchEditorFile('app://-/research-editor/missing.js', editor, renderer), null);
    assert.equal(await researchEditorFile('app://-/research-editor/%2e%2e%2foutside', editor, renderer), null);
    assert.equal(await researchEditorFile('app://-/research-editor/%5c..%5cprivate', editor, renderer), null);
    assert.match((await researchEditorFile('app://-/unknown', editor, renderer))!, /out\/index.html$/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('only unhandled global shortcuts leave the iframe, formatting and undo remain local', () => {
  assert.equal(shouldForwardEditorShortcut({ key: 'k', code: 'KeyK', ctrlKey: true }), true);
  assert.equal(shouldForwardEditorShortcut({ key: 'k', ctrlKey: true, defaultPrevented: true }), false);
  for (const key of ['z', 'y', 'i', '/', '?', 'a']) assert.equal(shouldForwardEditorShortcut({ key, ctrlKey: key !== '/' && key !== '?' }), false);
  assert.equal(shouldForwardEditorShortcut({ key: 'k', ctrlKey: true, isComposing: true }), false);
});
test('appearance writes Arabic/English, direction, theme and scale synchronously', () => {
  const attributes = new Map(), styles = new Map(), classes = new Map();
  const root = { dataset: {}, style: { setProperty: (key: string, value: string) => styles.set(key, value) }, classList: { toggle: (key: string, value: boolean) => classes.set(key, value) }, setAttribute: (key: string, value: string) => attributes.set(key, value) } as unknown as HTMLElement;
  applyResearchEditorAppearance(root, { theme: 'dark', lang: 'ar', dir: 'rtl', fontScale: 1.25 });
  assert.equal(root.lang, 'ar'); assert.equal(root.dir, 'rtl'); assert.equal(root.dataset.theme, 'dark'); assert.equal(styles.get('--affine-font-base'), '20px');
  applyResearchEditorAppearance(root, { theme: 'light', lang: 'en', dir: 'ltr', fontScale: 1 });
  assert.equal(root.lang, 'en'); assert.equal(root.dir, 'ltr'); assert.equal(classes.get('dark'), false);
});
function fixture() {
  const events: string[] = [];
  const documents = new Map<string, ManuscriptDocument>();
  const doc = (id: string) => ({ id, snapshot: '{"text":"original"}', primary_mode: 'page' } as ManuscriptDocument);
  documents.set('one', doc('one')); documents.set('two', doc('two'));
  const api = {
    document: async (id: string) => { events.push('get:' + id); return documents.get(id)!; },
    save: async (input: { id: string; snapshot: string }) => { events.push('save:' + input.id); documents.set(input.id, { ...documents.get(input.id)!, ...input }); return documents.get(input.id)!; },
    checkpoint: async (id: string) => { events.push('checkpoint:' + id); return true; },
  } as ManuscriptsAPI;
  const errors: unknown[] = [];
  const host = createResearchEditorHost(api, {} as ResearchEditorAssets, { theme: 'dark', lang: 'ar', dir: 'rtl', fontScale: 1 }, error => errors.push(error));
  return { host, api, doc, events, documents, errors };
}
test('bridge changes debounce through RE-3, explicit save flushes editor then controller', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const { host, doc, events, documents } = fixture();
  await host.bridge.connect({ load: async value => { events.push('load:' + value.id); }, flush: async () => { events.push('flush'); }, dispose() {} });
  await host.open(doc('one'));
  host.bridge.change('one', '{"text":"mixed Arabic Latin"}', 'page');
  assert.equal(documents.get('one')!.snapshot, '{"text":"original"}');
  context.mock.timers.tick(1500); await Promise.resolve(); await Promise.resolve();
  assert.equal(documents.get('one')!.snapshot, '{"text":"mixed Arabic Latin"}');
  await host.bridge.explicitSave();
  assert.deepEqual(events.slice(-2), ['flush', 'checkpoint:one']);
  await host.close(); host.dispose();
});
test('document switch and close await last editor changes and ignore stale document events', async () => {
  const { host, doc, events, documents } = fixture();
  let current = '';
  await host.bridge.connect({ load: async value => { current = value.id; events.push('load:' + value.id); }, flush: async () => { if (current) host.bridge.change(current, '{"text":"final"}', 'page'); }, dispose() {} });
  await host.open(doc('one')); await host.open(doc('two'));
  assert.equal(documents.get('one')!.snapshot, '{"text":"final"}');
  assert.ok(events.indexOf('save:one') < events.indexOf('load:two'));
  assert.ok(events.indexOf('checkpoint:one') < events.indexOf('load:two'));
  host.bridge.change('one', 'stale', 'page');
  await host.close(); assert.equal(documents.get('two')!.snapshot, '{"text":"final"}'); host.dispose();
});
test('failed save prevents switching and close, preserving draft for retry', async () => {
  const { host, api, doc, documents } = fixture();
  await host.open(doc('one')); host.bridge.change('one', 'retained', 'page');
  const original = api.save; api.save = async () => { throw new Error('disk-full'); };
  await assert.rejects(host.open(doc('two')), /disk-full/);
  await assert.rejects(host.close(), /disk-full/);
  api.save = original; await host.bridge.explicitSave(); assert.equal(documents.get('one')!.snapshot, 'retained');
  await host.close(); host.dispose();
});
test('appearance subscription updates the existing session and unsubscribes', async () => {
  const { host } = fixture(); const seen: string[] = [];
  const remove = host.bridge.subscribeAppearance(value => seen.push(value.lang));
  host.appearance({ theme: 'light', lang: 'en', dir: 'ltr', fontScale: 1.2 });
  assert.equal(host.bridge.appearance().theme, 'light'); assert.deepEqual(seen, ['en']); remove();
  host.appearance({ theme: 'dark', lang: 'ar', dir: 'rtl', fontScale: 1 }); assert.deepEqual(seen, ['en']); await host.close(); host.dispose();
});

test('shortcut forwarding reads native KeyboardEvent prototype properties', () => {
  const event = Object.create({ key: 'k', code: 'KeyK', ctrlKey: true, defaultPrevented: false });
  assert.equal(shouldForwardEditorShortcut(event), true);
  assert.equal(shouldForwardEditorShortcut(Object.create({ key: 'v', code: 'KeyV', ctrlKey: true })), false);
});

test('reopening the same document reads the snapshot after flushing its pending draft', async () => {
  const { host, doc, documents } = fixture();
  let loaded = '';
  await host.bridge.connect({ load: async value => { loaded = value.snapshot; }, flush: async () => {}, dispose() {} });
  await host.open(doc('one'));
  host.bridge.change('one', 'latest-unsaved', 'page');
  await host.open(doc('one'));
  assert.equal(loaded, 'latest-unsaved'); assert.equal(documents.get('one')!.snapshot, loaded);
  await host.close(); host.dispose();
});

test('renaming an open chapter saves pending edits and reloads the renamed snapshot', async () => {
  const { host, api, doc, documents, events } = fixture();
  let loaded = '';
  api.renameDocument = async (id, title) => {
    events.push('rename:' + id);
    documents.set(id, { ...documents.get(id)!, title, snapshot: JSON.stringify({ title, content: documents.get(id)!.snapshot }) });
  };
  await host.bridge.connect({ load: async value => { loaded = value.snapshot; }, flush: async () => {}, dispose() {} });
  await host.open(doc('one'));
  host.bridge.change('one', 'pending-content', 'page');
  await host.renameDocument('one', 'renamed');
  assert.equal(JSON.parse(loaded).content, 'pending-content');
  assert.equal(JSON.parse(loaded).title, 'renamed');
  assert.ok(events.indexOf('save:one') < events.indexOf('rename:one'));
  await host.close(); host.dispose();
});
