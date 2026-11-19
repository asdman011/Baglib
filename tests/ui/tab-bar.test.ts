import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { TabBar, type TabBarProps } from '../../src/renderer/components/layout/TabBar';
import { TabKeepAlive } from '../../src/renderer/components/layout/TabKeepAlive';
import { useTabKeepAlive } from '../../src/renderer/components/layout/use-tab-keep-alive';
import { translations, type TranslationKey } from '../../src/renderer/translations';
import { EMPTY_TABS, tabsReducer, type TabsState } from '../../src/shared/workspace-tabs';

function setup() {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  const globals: Record<string, unknown> = {
    window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
    React, IS_REACT_ACT_ENVIRONMENT: true, CSS: { escape: (value: string) => value },
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

/** Calls a React handler on an element the way the event system would. */
function fire(element: Element, handler: string, event: Record<string, unknown> = {}) {
  const props = Object.keys(element).find(name => name.startsWith('__reactProps'))!;
  const fn = (element as unknown as Record<string, Record<string, (event: unknown) => void>>)[props][handler];
  assert.ok(fn, `${handler} exists`);
  fn({ preventDefault: () => {}, stopPropagation: () => {}, currentTarget: element, pointerId: 1, button: 0, clientX: 0, ...event });
}

function tabs(count: number): TabsState {
  let state = EMPTY_TABS;
  const views = ['library', 'quran', 'sunnah', 'reader', 'notes'] as const;
  for (let n = 1; n <= count; n += 1) state = tabsReducer(state, { type: 'open', id: `t${n}`, location: { view: views[(n - 1) % views.length], title: n === 2 ? 'البقرة ٢٥٥' : '' }, now: n });
  return state;
}

let clock = 1000;
/** A steadily advancing test clock for the reducer's timestamps. */
const tick = () => (clock += 1);

/** A tab bar wired to the real reducer, so tests see what the user would. */
function Harness({ lang, initial, log }: { lang: 'ar' | 'en'; initial: TabsState; log: string[] }) {
  const [state, dispatch] = React.useReducer(tabsReducer, initial);
  const t: TabBarProps['t'] = (key: TranslationKey, params) => Object.entries(params ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), translations[lang][key]);
  return createElement(TabBar, {
    tabs: state.tabs, activeId: state.activeId, dir: lang === 'ar' ? 'rtl' : 'ltr', t,
    onActivate: id => { log.push(`activate:${id}`); dispatch({ type: 'activate', id, now: tick() }); },
    onClose: id => { log.push(`close:${id}`); dispatch({ type: 'close', id, homeId: 'home', now: tick() }); },
    onMove: (id, toIndex) => { log.push(`move:${id}:${toIndex}`); dispatch({ type: 'move', id, toIndex }); },
    onNew: () => { log.push('new'); dispatch({ type: 'open', id: `n${log.length}`, location: { view: 'dashboard', title: '' }, now: tick() }); },
  });
}

const order = (window: Window) => [...window.document.querySelectorAll('[data-tab-id]')].map(element => (element as HTMLElement).dataset.tabId);

for (const lang of ['ar', 'en'] as const) {
  describe(`TabBar (${lang})`, () => {
    it('shows each tab with its title or view name, and marks the focused tab', async () => {
      const { window, root, restore } = setup();
      try {
        await act(async () => root.render(createElement(Harness, { lang, initial: tabs(3), log: [] })));
        const list = window.document.querySelector('[role="tablist"]')!;
        assert.equal(list.getAttribute('aria-label'), translations[lang].workspaceTabsLabel);
        assert.equal(window.document.querySelector('[data-workspace-tabbar]')!.getAttribute('dir'), lang === 'ar' ? 'rtl' : 'ltr');
        const items = [...window.document.querySelectorAll('[role="tab"]')];
        assert.equal(items.length, 3);
        assert.ok(items[0].textContent!.includes(translations[lang].navLibrary));
        assert.ok(items[1].textContent!.includes('البقرة ٢٥٥'));
        assert.equal(items[2].getAttribute('aria-selected'), 'true');
        assert.equal(items[0].getAttribute('aria-selected'), 'false');
      } finally { restore(); }
    });

    it('click focuses, middle-click and × close, + opens a new tab', async () => {
      const { window, root, restore } = setup();
      const log: string[] = [];
      try {
        await act(async () => root.render(createElement(Harness, { lang, initial: tabs(3), log })));
        await act(async () => fire(window.document.querySelector('[data-tab-id="t1"]')!, 'onClick'));
        assert.equal(window.document.querySelector('[data-tab-id="t1"]')!.getAttribute('aria-selected'), 'true');
        await act(async () => fire(window.document.querySelector('[data-tab-id="t2"]')!, 'onAuxClick', { button: 1 }));
        await act(async () => fire(window.document.querySelector('[data-tab-close="t3"]')!, 'onClick'));
        assert.deepEqual(order(window), ['t1']);
        await act(async () => fire(window.document.querySelector('[data-tab-new]')!, 'onClick'));
        assert.equal(order(window).length, 2);
        assert.equal(window.document.querySelector('[aria-selected="true"]')!.getAttribute('data-tab-view'), 'dashboard');
        assert.deepEqual(log.slice(0, 3), ['activate:t1', 'close:t2', 'close:t3']);
      } finally { restore(); }
    });

    it('arrow keys follow the reading direction; Ctrl+Shift+PageDown moves the tab', async () => {
      const { window, root, restore } = setup();
      const log: string[] = [];
      try {
        await act(async () => root.render(createElement(Harness, { lang, initial: tabsReducer(tabs(3), { type: 'activate', id: 't1', now: 99 }), log })));
        const forward = lang === 'ar' ? 'ArrowLeft' : 'ArrowRight';
        await act(async () => fire(window.document.querySelector('[data-tab-id="t1"]')!, 'onKeyDown', { key: forward }));
        assert.equal(window.document.querySelector('[aria-selected="true"]')!.getAttribute('data-tab-id'), 't2');
        await act(async () => fire(window.document.querySelector('[data-tab-id="t2"]')!, 'onKeyDown', { key: 'PageDown', ctrlKey: true, shiftKey: true }));
        assert.deepEqual(order(window), ['t1', 't3', 't2']);
        assert.ok(window.document.querySelector('[aria-live]')!.textContent!.includes('3'));
        await act(async () => fire(window.document.querySelector('[data-tab-id="t2"]')!, 'onKeyDown', { key: 'Delete' }));
        assert.deepEqual(order(window), ['t1', 't3']);
      } finally { restore(); }
    });

    it('dragging a tab along the bar reorders it, mirrored in Arabic', async () => {
      const { window, root, restore } = setup();
      const log: string[] = [];
      try {
        await act(async () => root.render(createElement(Harness, { lang, initial: tabs(3), log })));
        // Lay the tabs out 100 px wide; in Arabic the first tab is on the right.
        for (const [index, id] of ['t1', 't2', 't3'].entries()) {
          const start = lang === 'ar' ? 200 - index * 100 : index * 100;
          (window.document.querySelector(`[data-tab-id="${id}"]`) as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => ({ left: start, width: 100 });
        }
        const first = window.document.querySelector('[data-tab-id="t1"]')!;
        const startX = lang === 'ar' ? 250 : 50;
        const endX = lang === 'ar' ? 10 : 290;
        await act(async () => fire(first, 'onPointerDown', { clientX: startX }));
        await act(async () => fire(first, 'onPointerMove', { clientX: startX + (lang === 'ar' ? -2 : 2) }));
        assert.deepEqual(order(window), ['t1', 't2', 't3'], 'a 2 px wobble is still a click');
        await act(async () => fire(first, 'onPointerMove', { clientX: endX }));
        assert.ok(window.document.querySelector('[data-dragging]'), 'the dragged tab is marked');
        assert.deepEqual(order(window), ['t2', 't3', 't1'], 'the others make room while it moves');
        await act(async () => fire(window.document.querySelector('[data-tab-id="t1"]')!, 'onPointerUp', { clientX: endX }));
        await act(async () => fire(window.document.querySelector('[data-tab-id="t1"]')!, 'onClick'));
        assert.deepEqual(order(window), ['t2', 't3', 't1']);
        assert.deepEqual(log, ['move:t1:2'], 'the click after a drag does not also activate');
      } finally { restore(); }
    });
  });
}

describe('TabKeepAlive with useTabKeepAlive', () => {
  function Host({ state, exempt, save }: { state: TabsState; exempt: Set<string>; save: (id: string) => Promise<boolean> }) {
    const awake = useTabKeepAlive(state, exempt, save);
    return createElement(TabKeepAlive, { state, awake, renderTab: tab => createElement('span', { 'data-screen': tab.id }, tab.id) });
  }
  const mounted = (window: Window) => [...window.document.querySelectorAll('[data-screen]')].map(element => element.textContent).sort();
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });

  it('keeps 6 tabs mounted, hides all but the focused one, and saves a tab before it sleeps', async () => {
    const { window, root, restore } = setup();
    const saved: string[] = [];
    const save = async (id: string) => { saved.push(id); return true; };
    try {
      let state = EMPTY_TABS;
      const exempt = new Set<string>();
      for (let n = 1; n <= 8; n += 1) {
        state = tabsReducer(state, { type: 'open', id: `t${n}`, location: { view: 'library', title: '' }, now: n });
        await act(async () => root.render(createElement(Host, { state, exempt, save })));
        await settle();
      }
      assert.deepEqual(mounted(window), ['t3', 't4', 't5', 't6', 't7', 't8']);
      assert.deepEqual(saved.sort(), ['t1', 't2']);
      const visible = [...window.document.querySelectorAll('[data-tab-panel]')].filter(panel => !panel.hasAttribute('hidden')).map(panel => panel.getAttribute('data-tab-panel'));
      assert.deepEqual(visible, ['t8']);
      // Focusing a sleeping tab wakes it; the least recently used awake tab saves and sleeps.
      state = tabsReducer(state, { type: 'activate', id: 't1', now: 100 });
      await act(async () => root.render(createElement(Host, { state, exempt, save })));
      await settle();
      assert.deepEqual(mounted(window), ['t1', 't4', 't5', 't6', 't7', 't8']);
    } finally { restore(); }
  });

  it('a tab whose save failed stays mounted; exempt tabs never sleep', async () => {
    const { window, root, restore } = setup();
    const save = async (id: string) => id !== 't1';
    try {
      let state = EMPTY_TABS;
      const exempt = new Set(['t2']);
      for (let n = 1; n <= 8; n += 1) {
        state = tabsReducer(state, { type: 'open', id: `t${n}`, location: { view: 'lectures', title: '' }, now: n });
        await act(async () => root.render(createElement(Host, { state, exempt, save })));
        await settle();
      }
      const shown = mounted(window);
      assert.ok(shown.includes('t1'), 'the failed save keeps t1 mounted');
      assert.ok(shown.includes('t2'), 'the exempt (playing) tab stays mounted');
    } finally { restore(); }
  });
});
