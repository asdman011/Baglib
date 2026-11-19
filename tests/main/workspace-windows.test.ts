import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createWindowRegistry, type RegistryWindow } from '../../src/main/window-registry';
import { createTabTransferBroker } from '../../src/main/workspace-windows';
import { buildTabTransfer, parseTabTransfer, transferToTab } from '../../src/shared/workspace-window-transfer';
import type { WorkspaceTab } from '../../src/shared/workspace-tabs';

class FakeWindow implements RegistryWindow {
  destroyed = false;
  readonly webContents: RegistryWindow['webContents'];
  constructor(readonly id: number) {
    this.webContents = { id: id * 10, send: () => {} };
  }
  isDestroyed() { return this.destroyed; }
}

const readerTab: WorkspaceTab = {
  id: 'tab-a',
  openedAt: 1,
  lastActiveAt: 2,
  groupId: 'grp-1',
  index: 1,
  history: [
    { view: 'library', title: 'Library' },
    { view: 'reader', target: 'book:abc#p=7', title: 'A book', scroll: 120, snapshot: { version: 1, data: { readingPage: 7 } } },
  ],
};

function setup() {
  const registry = createWindowRegistry<FakeWindow>();
  const primary = new FakeWindow(1);
  registry.add(primary);
  let nextId = 2;
  const created: FakeWindow[] = [];
  const broker = createTabTransferBroker<FakeWindow>({
    registry,
    createWindow: () => {
      const window = new FakeWindow(nextId++);
      registry.add(window);
      created.push(window);
      return window;
    },
  });
  return { registry, primary, broker, created };
}

describe('tab transfer payload', () => {
  it('carries only the history entries and the current index, never ids or groups', () => {
    const payload = buildTabTransfer(readerTab);
    assert.deepEqual(Object.keys(payload).sort(), ['history', 'index', 'version']);
    assert.equal(payload.history[1].snapshot?.data.readingPage, 7);
    const tab = transferToTab(payload, 'tab-new', 99);
    assert.equal(tab.id, 'tab-new');
    assert.equal(tab.groupId, undefined);
    assert.equal(tab.index, 1);
    assert.equal(tab.history[1].target, 'book:abc#p=7');
  });

  it('survives a JSON round trip (the IPC path) and rejects malformed payloads', () => {
    const wire = JSON.parse(JSON.stringify(buildTabTransfer(readerTab)));
    assert.deepEqual(parseTabTransfer(wire), buildTabTransfer(readerTab));
    for (const bad of [null, 'x', {}, { version: 2, history: [{ view: 'library', title: '' }], index: 0 },
      { version: 1, history: [], index: 0 },
      { version: 1, history: [{ view: 'not-a-view', title: '' }], index: 0 },
      { version: 1, history: [{ view: 'library', title: '' }], index: 3 },
      { version: 1, history: [{ view: 'library', title: '' }], index: 0.5 },
      { version: 1, history: new Array(60).fill({ view: 'library', title: '' }), index: 0 }]) {
      assert.equal(parseTabTransfer(bad), undefined);
    }
  });

  it('drops an invalid study target but keeps the view', () => {
    const parsed = parseTabTransfer({ version: 1, history: [{ view: 'reader', target: 'javascript:alert(1)', title: 'x' }], index: 0 });
    assert.equal(parsed?.history[0].view, 'reader');
    assert.equal(parsed?.history[0].target, undefined);
  });
});

describe('tab transfer broker', () => {
  it('opens a window and hands the tab to it once, when its renderer asks', async () => {
    const { broker, created, primary } = setup();
    const result = await broker.moveTabToNewWindow(primary.webContents.id, buildTabTransfer(readerTab));
    assert.deepEqual(result, { ok: true, windowId: created[0].id });
    const ready = broker.windowReady(created[0].webContents.id);
    assert.equal(ready.primary, false);
    assert.equal(ready.transfer?.history[1].target, 'book:abc#p=7');
    assert.equal(broker.windowReady(created[0].webContents.id).transfer, undefined, 'delivered once');
  });

  it('reports the first window as primary and gives it no tab', () => {
    const { broker, primary } = setup();
    assert.deepEqual(broker.windowReady(primary.webContents.id), { primary: true });
  });

  it('refuses a sender that is not an app window and a malformed payload without opening a window', async () => {
    const { broker, created, primary } = setup();
    assert.deepEqual(await broker.moveTabToNewWindow(999, buildTabTransfer(readerTab)), { ok: false });
    assert.deepEqual(await broker.moveTabToNewWindow(primary.webContents.id, { version: 1, history: [], index: 0 }), { ok: false });
    assert.equal(created.length, 0);
  });

  it('fails cleanly when the window cannot be created, and caps waiting tabs', async () => {
    const registry = createWindowRegistry<FakeWindow>();
    const primary = new FakeWindow(1);
    registry.add(primary);
    const failing = createTabTransferBroker<FakeWindow>({ registry, createWindow: () => { throw new Error('no window'); } });
    assert.deepEqual(await failing.moveTabToNewWindow(primary.webContents.id, buildTabTransfer(readerTab)), { ok: false });

    const { broker, primary: first } = setup();
    for (let i = 0; i < 8; i++) assert.equal((await broker.moveTabToNewWindow(first.webContents.id, buildTabTransfer(readerTab))).ok, true);
    assert.equal((await broker.moveTabToNewWindow(first.webContents.id, buildTabTransfer(readerTab))).ok, false);
  });
});
