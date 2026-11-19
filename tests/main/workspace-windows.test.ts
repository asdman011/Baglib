import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createWindowRegistry, type RegistryWindow } from '../../src/main/window-registry';
import { createTabTransferBroker } from '../../src/main/workspace-windows';
import {
  buildTabTransfer, isOutsideWindowBounds, isPointInBounds, parseSavedSecondaryWindows,
  parseTabMoveRequest, parseTabTransfer, serializeSavedSecondaryWindows, transferToTab,
  WORKSPACE_WINDOW_CHANNELS,
} from '../../src/shared/workspace-window-transfer';
import type { WorkspaceTab } from '../../src/shared/workspace-tabs';

class FakeWindow implements RegistryWindow {
  destroyed = false;
  minimized = false;
  focused = false;
  shown = false;
  sent: Array<{ channel: string; args: unknown[] }> = [];
  bounds: { x: number; y: number; width: number; height: number };
  readonly webContents: RegistryWindow['webContents'];
  constructor(readonly id: number, bounds = { x: 0, y: 0, width: 1000, height: 800 }) {
    this.bounds = bounds;
    this.webContents = {
      id: id * 10,
      send: (channel: string, ...args: unknown[]) => {
        this.sent.push({ channel, args });
      },
    };
  }
  isDestroyed() { return this.destroyed; }
  isMinimized() { return this.minimized; }
  getBounds() { return this.bounds; }
  show() { this.shown = true; }
  focus() { this.focused = true; }
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
  const primary = new FakeWindow(1, { x: 0, y: 0, width: 1000, height: 800 });
  registry.add(primary);
  let nextId = 2;
  const created: FakeWindow[] = [];
  const positions: Array<{ x: number; y: number } | undefined> = [];
  const broker = createTabTransferBroker<FakeWindow>({
    registry,
    createWindow: opts => {
      positions.push(opts?.position);
      const window = new FakeWindow(nextId++, opts?.position ? { x: opts.position.x, y: opts.position.y, width: 1000, height: 800 } : { x: 1100, y: 0, width: 1000, height: 800 });
      registry.add(window);
      created.push(window);
      return window;
    },
  });
  return { registry, primary, broker, created, positions };
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
    assert.deepEqual(result, { ok: true, windowId: created[0].id, target: 'new' });
    const ready = broker.windowReady(created[0].webContents.id);
    assert.equal(ready.primary, false);
    assert.ok(ready.windowKey);
    assert.equal(ready.transfer?.history[1].target, 'book:abc#p=7');
    assert.equal(broker.windowReady(created[0].webContents.id).transfer, undefined, 'delivered once');
  });

  it('routes a tab dropped onto another registered window instead of opening a new window', async () => {
    const { broker, created, primary, registry } = setup();
    const second = new FakeWindow(20, { x: 1200, y: 100, width: 800, height: 600 });
    registry.add(second);

    const result = await broker.moveTabToNewWindow(primary.webContents.id, {
      ...buildTabTransfer(readerTab),
      position: { x: 1400, y: 200 },
    });
    assert.deepEqual(result, { ok: true, windowId: second.id, target: 'existing' });
    assert.equal(created.length, 0, 'no new window created');
    assert.equal(second.sent.length, 1);
    assert.equal(second.sent[0].channel, WORKSPACE_WINDOW_CHANNELS.receiveTab);
    assert.equal(second.shown, true);
    assert.equal(second.focused, true);
  });

  it('opens a new window at the drop position when no window is under the pointer', async () => {
    const { broker, created, primary, positions } = setup();
    const result = await broker.moveTabToNewWindow(primary.webContents.id, {
      ...buildTabTransfer(readerTab),
      position: { x: 1600, y: 300 },
    });
    assert.deepEqual(result, { ok: true, windowId: created[0].id, target: 'new' });
    assert.deepEqual(positions[0], { x: 1600, y: 300 });
  });

  it('delivers savedTabs once when a restored secondary window becomes ready', () => {
    const { broker, registry } = setup();
    const restored = new FakeWindow(30);
    registry.add(restored);
    const savedState = { tabs: [readerTab], activeId: readerTab.id };
    broker.registerRestoredWindow(restored.webContents.id, 'win-7', savedState);
    assert.equal(broker.getWindowKey(restored.webContents.id), 'win-7');
    const ready = broker.windowReady(restored.webContents.id);
    assert.equal(ready.primary, false);
    assert.equal(ready.windowKey, 'win-7');
    assert.deepEqual(ready.savedTabs, savedState);
    assert.equal(broker.windowReady(restored.webContents.id).savedTabs, undefined);
    broker.forgetWindow(restored.webContents.id);
    assert.equal(broker.getWindowKey(restored.webContents.id), undefined);
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

describe('window bounds and secondary window persistence parsing', () => {
  it('parses move request with optional screen position and checks bounds', () => {
    const withPos = parseTabMoveRequest({ ...buildTabTransfer(readerTab), position: { x: 123.6, y: 456.2 } });
    assert.deepEqual(withPos?.position, { x: 124, y: 456 });
    const badPos = parseTabMoveRequest({ ...buildTabTransfer(readerTab), position: { x: NaN, y: 10 } });
    assert.equal(badPos?.position, undefined);

    assert.equal(isPointInBounds({ x: 150, y: 200 }, { x: 100, y: 100, width: 500, height: 400 }), true);
    assert.equal(isPointInBounds({ x: 50, y: 200 }, { x: 100, y: 100, width: 500, height: 400 }), false);

    assert.equal(isOutsideWindowBounds({ screenX: -10, screenY: 50 }, { screenX: 0, screenY: 0, outerWidth: 1000, outerHeight: 800 }), true);
    assert.equal(isOutsideWindowBounds({ screenX: 500, screenY: 50 }, { screenX: 0, screenY: 0, outerWidth: 1000, outerHeight: 800 }), false);
  });

  it('parses and serializes saved secondary windows while dropping corrupt or empty entries', () => {
    const serialized = serializeSavedSecondaryWindows([
      { windowKey: 'win-1', bounds: { x: 10, y: 20, width: 900, height: 700 }, state: { tabs: [readerTab], activeId: readerTab.id } },
      { windowKey: 'win-empty', state: { tabs: [], activeId: '' } },
    ]);
    assert.equal(serialized.length, 1);
    const parsed = parseSavedSecondaryWindows(JSON.stringify([
      ...serialized,
      { windowKey: 'win-1', state: { tabs: [readerTab], activeId: readerTab.id } },
      { windowKey: '', state: { tabs: [readerTab], activeId: readerTab.id } },
      null,
    ]));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].windowKey, 'win-1');
    assert.deepEqual(parsed[0].bounds, { x: 10, y: 20, width: 900, height: 700 });
    assert.equal(parsed[0].state.tabs[0].history[1].target, 'book:abc#p=7');
  });
});
