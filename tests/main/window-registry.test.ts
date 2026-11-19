import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createWindowRegistry, type RegistryWindow } from '../../src/main/window-registry';

class FakeWindow implements RegistryWindow {
  sent: [string, unknown[]][] = [];
  destroyed = false;
  minimized = false;
  calls: string[] = [];
  readonly webContents: RegistryWindow['webContents'];
  constructor(readonly id: number) {
    const sent = this.sent;
    this.webContents = { id: id * 10, send: (channel: string, ...args: unknown[]) => { sent.push([channel, args]); } };
  }
  isDestroyed() { return this.destroyed; }
  isMinimized() { return this.minimized; }
  restore() { this.calls.push('restore'); this.minimized = false; }
  show() { this.calls.push('show'); }
  focus() { this.calls.push('focus'); }
}

describe('window registry', () => {
  it('keeps app windows oldest first; the first one is the primary window', () => {
    const registry = createWindowRegistry<FakeWindow>();
    const a = new FakeWindow(1), b = new FakeWindow(2);
    registry.add(a); registry.add(b); registry.add(a);
    assert.deepEqual(registry.all().map(window => window.id), [1, 2]);
    assert.equal(registry.primary(), a);
  });

  it('tracks the last focused window; the newest counts as focused until another is', () => {
    const registry = createWindowRegistry<FakeWindow>();
    const a = new FakeWindow(1), b = new FakeWindow(2);
    registry.add(a); registry.add(b);
    assert.equal(registry.lastFocused(), b);
    registry.noteFocus(a);
    assert.equal(registry.lastFocused(), a);
    registry.noteFocus(new FakeWindow(9));
    assert.equal(registry.lastFocused(), a, 'unregistered windows are ignored');
  });

  it('finds the window that sent an IPC message', () => {
    const registry = createWindowRegistry<FakeWindow>();
    const a = new FakeWindow(1), b = new FakeWindow(2);
    registry.add(a); registry.add(b);
    assert.equal(registry.fromWebContents(20), b);
    assert.equal(registry.fromWebContents(99), undefined);
  });

  it('broadcasts to every live app window, optionally skipping the sender', () => {
    const registry = createWindowRegistry<FakeWindow>();
    const a = new FakeWindow(1), b = new FakeWindow(2), c = new FakeWindow(3);
    registry.add(a); registry.add(b); registry.add(c);
    c.destroyed = true;
    assert.equal(registry.broadcast('settings:changed', [{ key: 'baglib-lang' }]), 2);
    assert.deepEqual(a.sent, [['settings:changed', [{ key: 'baglib-lang' }]]]);
    assert.equal(registry.broadcast('boards:changed', [], { exceptWebContentsId: 10 }), 1);
    assert.equal(a.sent.length, 1);
    assert.equal(b.sent.length, 2);
  });

  it('drops destroyed windows: the primary and last focused move on', () => {
    const registry = createWindowRegistry<FakeWindow>();
    const a = new FakeWindow(1), b = new FakeWindow(2);
    registry.add(a); registry.add(b); registry.noteFocus(a);
    a.destroyed = true;
    assert.equal(registry.primary(), b);
    assert.equal(registry.lastFocused(), b);
    registry.remove(b);
    assert.equal(registry.lastFocused(), undefined);
    assert.equal(registry.bringToFront(), undefined);
  });

  it('brings the last focused window to the front, restoring it if minimized', () => {
    const registry = createWindowRegistry<FakeWindow>();
    const a = new FakeWindow(1), b = new FakeWindow(2);
    registry.add(a); registry.add(b); registry.noteFocus(a);
    a.minimized = true;
    assert.equal(registry.bringToFront(), a);
    assert.deepEqual(a.calls, ['restore', 'show', 'focus']);
    assert.deepEqual(b.calls, []);
  });
});
