import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { useDialogFocus } from '../../src/renderer/hooks/useDialogFocus';

test('dialog focus guards, empty dialogs, nested cleanup and current close callbacks', async () => {
  const { window } = parseHTML('<html><body><button id="opener">Open</button><div id="root"></div></body></html>');
  const replacements = { window, document: window.document, HTMLElement: window.HTMLElement,
    getComputedStyle: () => ({ visibility: 'visible' }), IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const opener = window.document.getElementById('opener')!;
  const focusState = { current: opener };
  Object.defineProperty(window.document, 'activeElement', { configurable: true, get: () => focusState.current });
  const originalFocus = window.HTMLElement.prototype.focus;
  window.HTMLElement.prototype.focus = function () { focusState.current = this; };
  let closed = 0;
  function Dialog({ nested = false, busy = false }: { nested?: boolean; busy?: boolean }) {
    const ref = useDialogFocus(true, () => { if (!busy) closed++; });
    return createElement('div', { ref, role: 'dialog', tabIndex: -1 }, nested ? createElement(Child) : null);
  }
  function Child() {
    const ref = useDialogFocus(true, () => { closed += 10; });
    return createElement('div', { ref, role: 'dialog', tabIndex: -1 });
  }
  const root = createRoot(window.document.getElementById('root')!);
  const key = (value: string, shiftKey = false) => {
    const event = new window.Event('keydown', { bubbles: true, cancelable: true });
    Object.assign(event, { key: value, shiftKey });
    window.document.dispatchEvent(event);
    return event;
  };
  try {
    await act(async () => root.render(createElement(Dialog, { busy: true })));
    assert.equal(focusState.current.getAttribute('role'), 'dialog');
    assert.equal(key('Tab').defaultPrevented, true);
    assert.equal(key('Tab', true).defaultPrevented, true);
    key('Escape');
    assert.equal(closed, 0);
    await act(async () => root.render(createElement(Dialog, { busy: false })));
    key('Escape');
    assert.equal(closed, 1);
    await act(async () => root.render(null));
    assert.equal(focusState.current, opener);
    await act(async () => root.render(createElement(Dialog, { nested: true })));
    key('Escape');
    assert.equal(closed, 11);
    await act(async () => root.render(null));
    assert.equal(focusState.current, opener);
  } finally {
    await act(async () => root.unmount());
    window.HTMLElement.prototype.focus = originalFocus;
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
