import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider, useTabKeysActive, useTabs, useWorkspace } from '../../src/renderer/components/context';
import {
  WorkspaceHistoryStrip, WorkspaceTabPanels, WorkspaceTabRow, tabCommandEffect, useWorkspaceTabShortcuts,
} from '../../src/renderer/components/layout/WorkspaceTabs';
import { newTab, tabsReducer, type TabsState, type WorkspaceView } from '../../src/shared/workspace-tabs';

function setup() {
  const { window } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  const globals: Record<string, unknown> = {
    window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
    CustomEvent: window.CustomEvent, Event: window.Event, React, IS_REACT_ACT_ENVIRONMENT: true, CSS: { escape: (value: string) => value },
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  };
  const previous = new Map(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  const root = createRoot(window.document.getElementById('root')!);
  const restore = () => {
    act(() => root.unmount());
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    }
  };
  return { window, root, restore };
}

/** Presses a key on the window the way the browser would. */
function press(window: Window, init: { key: string; code?: string; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }) {
  const event = new window.Event('keydown', { cancelable: true, bubbles: true });
  Object.assign(event, { metaKey: false, repeat: false, ctrlKey: false, shiftKey: false, altKey: false, ...init });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

/** Library (t1), Quran (t2), Notes (t3), with t1 focused. */
function threeTabs(): TabsState {
  let state: TabsState = { tabs: [newTab('t1', { view: 'library', title: '' }, 1)], activeId: 't1' };
  state = tabsReducer(state, { type: 'open', id: 't2', location: { view: 'quran', title: 'البقرة ٢٥٥' }, now: 2, background: true });
  state = tabsReducer(state, { type: 'open', id: 't3', location: { view: 'notes', title: '' }, now: 3, afterId: 't2', background: true });
  return state;
}

/** A screen with its own counter, so a tab that stayed mounted keeps it and a fresh mount starts at 0. */
const Screen: React.FC<{ view: WorkspaceView }> = ({ view }) => {
  const [count, setCount] = React.useState(0);
  const { setViewMode } = useWorkspace();
  // A window-level key handler like the reader's page keys: only the focused tab may act.
  const keysActive = useTabKeysActive();
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (keysActive.current && event.key === 'PageDown') setCount(n => n + 1); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keysActive]);
  return createElement('div', { 'data-screen': view },
    createElement('button', { 'data-count': count, onClick: () => setCount(n => n + 1) }, String(count)),
    createElement('button', { 'data-go-quran': '', onClick: () => setViewMode('quran') }));
};
const render = (view: WorkspaceView) => createElement(Screen, { view });

const probe: { tabs: ReturnType<typeof useTabs> | null } = { tabs: null };
const Shell: React.FC = () => {
  useWorkspaceTabShortcuts();
  const tabs = useTabs();
  React.useEffect(() => { probe.tabs = tabs; });
  return createElement(React.Fragment, null,
    createElement(WorkspaceTabRow),
    createElement(WorkspaceHistoryStrip),
    createElement('main', null, createElement(WorkspaceTabPanels, { render })));
};

function fire(element: Element, handler: string, event: Record<string, unknown> = {}) {
  const props = Object.keys(element).find(name => name.startsWith('__reactProps'))!;
  const fn = (element as unknown as Record<string, Record<string, (event: unknown) => void>>)[props][handler];
  assert.ok(fn, `${handler} exists`);
  fn({ preventDefault: () => {}, stopPropagation: () => {}, currentTarget: element, button: 0, ...event });
}

const visibleScreens = (window: Window) => [...window.document.querySelectorAll('[data-tab-panel]')]
  .filter(panel => !panel.hasAttribute('hidden')).map(panel => panel.querySelector('[data-screen]')?.getAttribute('data-screen'));
const tabIds = (window: Window) => [...window.document.querySelectorAll('[data-tab-id]')].map(tab => tab.getAttribute('data-tab-id'));

describe('tab command effects', () => {
  it('maps shortcuts to what happens', () => {
    const state = threeTabs();
    assert.deepEqual(tabCommandEffect(state, { type: 'new' }), { kind: 'new' });
    assert.deepEqual(tabCommandEffect(state, { type: 'close' }), { kind: 'close', id: 't1' });
    assert.deepEqual(tabCommandEffect(state, { type: 'next' }), { kind: 'activate', id: 't2' });
    assert.deepEqual(tabCommandEffect(state, { type: 'last' }), { kind: 'activate', id: 't3' });
    assert.equal(tabCommandEffect(state, { type: 'index', index: 0 }), null, 'already focused');
  });
});

describe('workspace tabs wired to the providers', () => {
  it('shows the tab bar and only the focused tab; each tab renders its own view', async () => {
    const { window, root, restore } = setup();
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, { initialTabs: threeTabs() }, createElement(Shell))));
      assert.deepEqual(tabIds(window), ['t1', 't2', 't3']);
      assert.deepEqual(visibleScreens(window), ['library']);
      await act(async () => fire(window.document.querySelector('[data-tab-id="t2"]')!, 'onClick'));
      assert.deepEqual(visibleScreens(window), ['quran']);
      // t1 stays mounted (hidden) with its state; t2 is now on screen.
      const panels = [...window.document.querySelectorAll('[data-tab-panel]')].map(panel => panel.getAttribute('data-tab-panel'));
      assert.deepEqual(panels.sort(), ['t1', 't2']);
    } finally { restore(); }
  });

  it('a hidden tab keeps its screen state when the user comes back', async () => {
    const { window, root, restore } = setup();
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, { initialTabs: threeTabs() }, createElement(Shell))));
      const counter = () => window.document.querySelector('[data-tab-panel]:not([hidden]) [data-count]')!;
      await act(async () => fire(counter(), 'onClick'));
      await act(async () => fire(counter(), 'onClick'));
      assert.equal(counter().getAttribute('data-count'), '2');
      press(window, { key: 'Tab', code: 'Tab', ctrlKey: true });
      await act(async () => {});
      assert.deepEqual(visibleScreens(window), ['quran']);
      press(window, { key: '1', code: 'Digit1', ctrlKey: true });
      await act(async () => {});
      assert.deepEqual(visibleScreens(window), ['library']);
      assert.equal(counter().getAttribute('data-count'), '2', 'the library tab was kept alive');
    } finally { restore(); }
  });

  it('a hidden tab ignores window-level keys; only the focused tab acts', async () => {
    const { window, root, restore } = setup();
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, { initialTabs: threeTabs() }, createElement(Shell))));
      press(window, { key: 'Tab', code: 'Tab', ctrlKey: true });
      await act(async () => {});
      assert.deepEqual(visibleScreens(window), ['quran']);
      await act(async () => { press(window, { key: 'PageDown', code: 'PageDown' }); });
      const count = (id: string) => window.document.querySelector('[data-tab-panel="' + id + '"] [data-count]')!.getAttribute('data-count');
      assert.equal(count('t2'), '1', 'the focused tab handled the key');
      assert.equal(count('t1'), '0', 'the hidden tab did not');
    } finally { restore(); }
  });

  it('Ctrl+T opens Home, Ctrl+W closes, Ctrl+Shift+T brings it back with its place', async () => {
    const { window, root, restore } = setup();
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, { initialTabs: threeTabs() }, createElement(Shell))));
      assert.equal(press(window, { key: 't', code: 'KeyT', ctrlKey: true }), true, 'Ctrl+T is taken by the tabs');
      await act(async () => {});
      assert.equal(tabIds(window).length, 4);
      assert.deepEqual(visibleScreens(window), ['dashboard']);
      assert.equal(tabIds(window)[3].startsWith('tab-'), true, 'the new tab opened at the end');
      press(window, { key: '2', code: 'Digit2', ctrlKey: true });
      await act(async () => {});
      assert.deepEqual(visibleScreens(window), ['quran']);
      assert.equal(press(window, { key: 'w', code: 'KeyW', ctrlKey: true }), true, 'Ctrl+W is prevented, so the window stays open');
      await act(async () => {});
      assert.ok(!tabIds(window).includes('t2'));
      press(window, { key: 'T', code: 'KeyT', ctrlKey: true, shiftKey: true });
      await act(async () => {});
      assert.equal(tabIds(window).length, 4);
      assert.deepEqual(visibleScreens(window), ['quran']);
      assert.equal(probe.tabs!.closedTabs.length, 0);
    } finally { restore(); }
  });

  it('back and forward follow the tab\'s own history, from the arrows and from Alt+arrows', async () => {
    const { window, root, restore } = setup();
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, { initialTabs: threeTabs() }, createElement(Shell))));
      const back = () => window.document.querySelector('[data-history="back"]')!;
      assert.equal(back().hasAttribute('disabled'), true);
      await act(async () => fire(window.document.querySelector('[data-tab-panel]:not([hidden]) [data-go-quran]')!, 'onClick'));
      assert.deepEqual(visibleScreens(window), ['quran']);
      assert.equal(back().hasAttribute('disabled'), false);
      await act(async () => fire(back(), 'onClick'));
      assert.deepEqual(visibleScreens(window), ['library']);
      const dir = window.document.querySelector('[data-tab-history-strip]')!.getAttribute('dir');
      // Forward is Alt+Right in English and Alt+Left in Arabic.
      assert.equal(press(window, { key: dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight', code: dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight', altKey: true }), true);
      await act(async () => {});
      assert.deepEqual(visibleScreens(window), ['quran']);
      assert.equal(press(window, { key: dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight', code: dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight', altKey: true }), false, 'nothing forward: the key is left alone');
    } finally { restore(); }
  });

  it('the seventh tab puts the least recently used one to sleep; it wakes when focused', async () => {
    const { window, root, restore } = setup();
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, { initialTabs: threeTabs() }, createElement(Shell))));
      for (let n = 0; n < 5; n += 1) {
        press(window, { key: 't', code: 'KeyT', ctrlKey: true });
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
      }
      const mounted = () => [...window.document.querySelectorAll('[data-tab-panel]')].map(panel => panel.getAttribute('data-tab-panel'));
      assert.equal(tabIds(window).length, 8);
      assert.equal(mounted().length, 6);
      assert.ok(!mounted().includes('t2') && !mounted().includes('t3'), 'never-opened background tabs stay asleep');
      await act(async () => fire(window.document.querySelector('[data-tab-id="t3"]')!, 'onClick'));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
      assert.ok(mounted().includes('t3'));
      assert.deepEqual(visibleScreens(window), ['notes']);
      assert.equal(mounted().length, 6);
    } finally { restore(); }
  });
});
