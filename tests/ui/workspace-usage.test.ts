import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { isDestination, mergeRecents, recentFor, useQuickOpenData } from '../../src/renderer/components/layout/workspace-usage';
import { WORKSPACE_RECENT_SETTING, WORKSPACE_USAGE_SETTING, newTab, tabsReducer, type RecentItem, type TabsState } from '../../src/shared/workspace-tabs';

function setup(saved: Record<string, unknown> = {}) {
  const { window } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  const store = new Map<string, unknown>(Object.entries(saved));
  const electronAPI = { settings: { get: async (key: string) => store.get(key) ?? null, set: async (key: string, value: unknown) => { store.set(key, value); } } };
  Object.assign(window, { electronAPI });
  const globals: Record<string, unknown> = { window, document: window.document, navigator: window.navigator, CustomEvent: window.CustomEvent, Event: window.Event, React, IS_REACT_ACT_ENVIRONMENT: true };
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
  return { root, store, restore };
}

const wait = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });

describe('quick-open data rules', () => {
  it('counts destinations, not Home or the reader', () => {
    assert.equal(isDestination('library'), true);
    assert.equal(isDestination('quran'), true);
    assert.equal(isDestination('dashboard'), false);
    assert.equal(isDestination('reader'), false);
  });

  it('only places with an item become recents', () => {
    assert.equal(recentFor({ view: 'library', title: '' }, 5), null);
    assert.deepEqual(recentFor({ view: 'reader', target: 'book:42', title: 'صحيح البخاري' }, 5), { view: 'reader', target: 'book:42', title: 'صحيح البخاري', openedAt: 5 });
  });

  it('puts the user\'s own recents first and skips continue-reading places already listed', () => {
    const own: RecentItem[] = [{ view: 'reader', target: 'book:1', title: 'A', openedAt: 3 }, { view: 'quran', target: 'quran:hafs:2:255', title: 'البقرة ٢٥٥', openedAt: 2 }];
    const continues: RecentItem[] = [{ view: 'quran', target: 'quran:hafs:2:255', title: 'dup', openedAt: 0 }, { view: 'bayan', target: 'poetry:ashaar:1:0:2', title: 'Poem', openedAt: 0 }];
    assert.deepEqual(mergeRecents(own, continues).map(item => item.title), ['A', 'البقرة ٢٥٥', 'Poem']);
    assert.equal(mergeRecents(Array.from({ length: 12 }, (_, n) => ({ view: 'notes' as const, target: `note:n${n}`, title: `${n}`, openedAt: n })), []).length, 8);
  });
});

describe('useQuickOpenData', () => {
  let latest: ReturnType<typeof useQuickOpenData> | null = null;
  const Probe: React.FC<{ state: TabsState }> = ({ state }) => {
    const data = useQuickOpenData(state, () => 1_000_000);
    React.useEffect(() => { latest = data; });
    return null;
  };
  const home = (): TabsState => ({ tabs: [newTab('t1', { view: 'dashboard', title: '' }, 1)], activeId: 't1' });
  const go = (state: TabsState, view: 'library' | 'quran' | 'reader', target?: string, title = '') =>
    tabsReducer(state, { type: 'navigate', id: 't1', location: target ? { view, target, title } : { view, title }, now: 2 });

  it('shows the defaults at first, then ranks Library first after it is opened often, and saves both lists', async () => {
    const { root, store, restore } = setup();
    try {
      let state = home();
      await act(async () => root.render(createElement(Probe, { state })));
      await wait(20);
      assert.deepEqual(latest!.destinations, ['library', 'quran', 'sunnah'], 'the start tab is not counted');
      for (let n = 0; n < 5; n += 1) {
        state = go(state, 'library'); await act(async () => root.render(createElement(Probe, { state })));
        state = go(state, n === 0 ? 'quran' : 'reader', n === 0 ? undefined : `book:b${n}`, `Book ${n}`); await act(async () => root.render(createElement(Probe, { state })));
      }
      assert.equal(latest!.destinations[0], 'library');
      assert.deepEqual(latest!.recent.map(item => item.target), ['book:b4', 'book:b3', 'book:b2', 'book:b1']);
      await wait(500);
      assert.equal((store.get(WORKSPACE_USAGE_SETTING) as Record<string, { count: number }>).library.count, 5);
      assert.equal((store.get(WORKSPACE_RECENT_SETTING) as RecentItem[]).length, 4);
    } finally { restore(); }
  });

  it('reads saved usage, recents and the continue-reading places', async () => {
    const { root, restore } = setup({
      [WORKSPACE_USAGE_SETTING]: { bayan: { count: 9, lastUsedAt: 999_000 } },
      [WORKSPACE_RECENT_SETTING]: [{ view: 'reader', target: 'book:saved', title: 'كتاب محفوظ', openedAt: 5 }],
      'islamic.continue.v1.sunnah': { target: 'sunnah:Bukhari:1:1', label: 'البخاري ١' },
    });
    try {
      await act(async () => root.render(createElement(Probe, { state: home() })));
      await wait(30);
      assert.equal(latest!.destinations[0], 'bayan');
      assert.deepEqual(latest!.recent.map(item => item.title), ['كتاب محفوظ', 'البخاري ١']);
    } finally { restore(); }
  });
});
