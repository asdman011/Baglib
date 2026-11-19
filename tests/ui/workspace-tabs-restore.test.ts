import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider, useTabs } from '../../src/renderer/components/context';
import { SettingsDirectory } from '../../src/renderer/components/layout/SettingsDirectory';
import { useAppCloseBridge } from '../../src/renderer/utils/close-guard';
import {
  TAB_LIMITS,
  WORKSPACE_CLOSED_SETTING,
  WORKSPACE_PREFS_SETTING,
  WORKSPACE_TABS_SETTING,
  newTab,
  type TabsState,
  type WorkspaceTab,
} from '../../src/shared/workspace-tabs';

interface MockSettingsStore {
  data: Map<string, unknown>;
  setCalls: Array<{ key: string; value: unknown }>;
  get: (key: string, fallback?: unknown) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<boolean>;
}

function createMockSettings(initial: Record<string, unknown> = {}): MockSettingsStore {
  const data = new Map<string, unknown>(Object.entries(initial));
  const setCalls: Array<{ key: string; value: unknown }> = [];
  return {
    data,
    setCalls,
    async get(key: string, fallback?: unknown) {
      return data.has(key) ? data.get(key) : fallback;
    },
    async set(key: string, value: unknown) {
      data.set(key, value);
      setCalls.push({ key, value });
      return true;
    },
  };
}

function setupDom(settings: MockSettingsStore, opts: { lang?: 'ar' | 'en' } = {}) {
  const { window } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  const storage = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, String(value)); },
      removeItem: (key: string) => { storage.delete(key); },
    },
  });
  if (opts.lang) {
    window.localStorage.setItem('baglib-lang', opts.lang);
  }
  let closeRequestedHandler: (() => void) | undefined;
  const closeAnswers: boolean[] = [];

  (window as unknown as Record<string, unknown>).electronAPI = {
    settings: {
      get: settings.get,
      set: settings.set,
    },
    appClose: {
      onRequested(handler: () => void) {
        closeRequestedHandler = handler;
        return () => { closeRequestedHandler = undefined; };
      },
      answer(allowed: boolean) {
        closeAnswers.push(allowed);
      },
    },
  };

  const globals: Record<string, unknown> = {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    CustomEvent: window.CustomEvent,
    Event: window.Event,
    React,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = new Map(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const root = createRoot(window.document.getElementById('root')!);
  const restore = () => {
    act(() => root.unmount());
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    }
  };
  return {
    window,
    root,
    restore,
    triggerAppClose: () => closeRequestedHandler?.(),
    closeAnswers,
  };
}

const probe: { tabs: ReturnType<typeof useTabs> | null } = { tabs: null };
const TabsProbe: React.FC = () => {
  useAppCloseBridge();
  const tabs = useTabs();
  React.useEffect(() => { probe.tabs = tabs; });
  return createElement('div', { 'data-active-id': tabs.state.activeId, 'data-tab-count': tabs.state.tabs.length });
};

const flushMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 10));
  });
};

describe('workspace tabs persistence and restore (KEY-423)', () => {
  it('keeps a single Home tab until settings resolve, then restores saved tabs with a new focused Home tab by default', async () => {
    let resolveTabs!: (value: unknown) => void;
    const savedState: TabsState = {
      tabs: [
        newTab('saved-1', { view: 'library', title: 'Library' }, 10),
        newTab('saved-2', { view: 'reader', target: 'book:b1', title: 'Book 1' }, 20),
      ],
      activeId: 'saved-2',
    };
    const settings = createMockSettings();
    settings.get = async (key: string) => {
      if (key === WORKSPACE_TABS_SETTING) {
        return new Promise(resolve => { resolveTabs = resolve; });
      }
      return undefined;
    };

    const { root, restore } = setupDom(settings);
    try {
      await act(async () => {
        root.render(createElement(WorkspaceProvider, null, createElement(TabsProbe)));
      });
      // Before settings resolve: single Home tab, no flash of saved tabs.
      assert.equal(probe.tabs?.state.tabs.length, 1);
      assert.equal(probe.tabs?.state.tabs[0].history[0].view, 'dashboard');

      await act(async () => {
        resolveTabs(savedState);
        await Promise.resolve();
      });
      await flushMicrotasks();

      // Default prefs: restore previous tabs + add a new focused Home tab.
      assert.equal(probe.tabs?.state.tabs.length, 3);
      assert.equal(probe.tabs?.state.tabs[0].id, 'saved-1');
      assert.equal(probe.tabs?.state.tabs[1].id, 'saved-2');
      assert.equal(probe.tabs?.state.tabs[2].history[0].view, 'dashboard');
      assert.equal(probe.tabs?.state.activeId, probe.tabs?.state.tabs[2].id);
    } finally {
      restore();
    }
  });

  it('focuses the last active tab without adding a Home tab when restoreFocus is "last"', async () => {
    const savedState: TabsState = {
      tabs: [
        newTab('saved-1', { view: 'library', title: 'Library' }, 10),
        newTab('saved-2', { view: 'quran', title: 'Al-Baqarah' }, 20),
      ],
      activeId: 'saved-1',
    };
    const settings = createMockSettings({
      [WORKSPACE_TABS_SETTING]: savedState,
      [WORKSPACE_PREFS_SETTING]: { restoreTabs: true, restoreFocus: 'last', linkTarget: 'new' },
    });
    const { root, restore } = setupDom(settings);
    try {
      await act(async () => {
        root.render(createElement(WorkspaceProvider, null, createElement(TabsProbe)));
      });
      await flushMicrotasks();

      assert.equal(probe.tabs?.state.tabs.length, 2);
      assert.equal(probe.tabs?.state.activeId, 'saved-1');
    } finally {
      restore();
    }
  });

  it('starts fresh with one Home tab when restoreTabs is false', async () => {
    const savedState: TabsState = {
      tabs: [
        newTab('saved-1', { view: 'library', title: 'Library' }, 10),
        newTab('saved-2', { view: 'reader', target: 'book:b1', title: 'Book 1' }, 20),
      ],
      activeId: 'saved-2',
    };
    const settings = createMockSettings({
      [WORKSPACE_TABS_SETTING]: savedState,
      [WORKSPACE_PREFS_SETTING]: { restoreTabs: false, restoreFocus: 'last', linkTarget: 'new' },
    });
    const { root, restore } = setupDom(settings);
    try {
      await act(async () => {
        root.render(createElement(WorkspaceProvider, null, createElement(TabsProbe)));
      });
      await flushMicrotasks();

      assert.equal(probe.tabs?.state.tabs.length, 1);
      assert.equal(probe.tabs?.state.tabs[0].history[0].view, 'dashboard');
    } finally {
      restore();
    }
  });

  it('handles corrupt or old saved values gracefully without throwing', async () => {
    const settings = createMockSettings({
      [WORKSPACE_TABS_SETTING]: '{not-valid-json',
      [WORKSPACE_PREFS_SETTING]: 'corrupt',
      [WORKSPACE_CLOSED_SETTING]: [{ bad: true }],
    });
    const { root, restore } = setupDom(settings);
    try {
      await act(async () => {
        root.render(createElement(WorkspaceProvider, null, createElement(TabsProbe)));
      });
      await flushMicrotasks();

      assert.equal(probe.tabs?.state.tabs.length, 1);
      assert.equal(probe.tabs?.state.tabs[0].history[0].view, 'dashboard');
      assert.equal(probe.tabs?.closedTabs.length, 0);
    } finally {
      restore();
    }
  });

  it('restores closed tabs and allows reopenClosed (Ctrl+Shift+T) after restart', async () => {
    const closedTab: WorkspaceTab = newTab('old-closed', { view: 'sunnah', title: 'Bukhari 1' }, 5);
    const settings = createMockSettings({
      [WORKSPACE_TABS_SETTING]: { tabs: [newTab('saved-1', { view: 'library', title: 'Library' }, 10)], activeId: 'saved-1' },
      [WORKSPACE_CLOSED_SETTING]: [closedTab],
    });
    const { root, restore } = setupDom(settings);
    try {
      await act(async () => {
        root.render(createElement(WorkspaceProvider, null, createElement(TabsProbe)));
      });
      await flushMicrotasks();

      assert.equal(probe.tabs?.closedTabs.length, 1);
      await act(async () => {
        probe.tabs?.reopenClosed();
      });
      assert.equal(probe.tabs?.closedTabs.length, 0);
      assert.ok(probe.tabs?.state.tabs.some(tab => tab.history[0].view === 'sunnah'));
    } finally {
      restore();
    }
  });

  it('persists at most 30 tabs and flushes immediately on beforeunload and appClose bridge', async () => {
    const settings = createMockSettings();
    const { window, root, restore, triggerAppClose, closeAnswers } = setupDom(settings);
    try {
      await act(async () => {
        root.render(createElement(WorkspaceProvider, null, createElement(TabsProbe)));
      });
      await flushMicrotasks();

      // Open 34 additional tabs (total 35)
      await act(async () => {
        for (let i = 0; i < 34; i += 1) {
          probe.tabs?.open({ view: 'library', title: `Lib ${i}` });
        }
      });
      assert.equal(probe.tabs?.state.tabs.length, 35);

      // Flush via beforeunload without waiting 500ms
      await act(async () => {
        window.dispatchEvent(new window.Event('beforeunload'));
        await Promise.resolve();
      });

      const persisted = settings.data.get(WORKSPACE_TABS_SETTING) as TabsState;
      assert.ok(persisted);
      assert.equal(persisted.tabs.length, TAB_LIMITS.maxSavedTabs);
      assert.ok(persisted.tabs.some(tab => tab.id === persisted.activeId));

      // Close a tab and flush via appClose bridge
      const idToClose = probe.tabs!.state.tabs[0].id;
      await act(async () => {
        probe.tabs?.close(idToClose);
      });
      await act(async () => {
        triggerAppClose();
        await Promise.resolve();
        await Promise.resolve();
      });
      assert.deepEqual(closeAnswers, [true]);
      const closedPersisted = settings.data.get(WORKSPACE_CLOSED_SETTING) as WorkspaceTab[];
      assert.ok(Array.isArray(closedPersisted) && closedPersisted.length === 1);
      assert.equal(closedPersisted[0].id, idToClose);
    } finally {
      restore();
    }
  });

  it('renders Workspace restore settings in SettingsDirectory in ar and en, disabling Setting 2 when "start fresh" is chosen', async () => {
    for (const lang of ['ar', 'en'] as const) {
      const settings = createMockSettings({
        [WORKSPACE_PREFS_SETTING]: { restoreTabs: true, restoreFocus: 'new', linkTarget: 'same' },
      });
      const { window, root, restore } = setupDom(settings, { lang });
      try {
        await act(async () => {
          root.render(createElement(WorkspaceProvider, null, createElement(SettingsDirectory)));
        });
        await flushMicrotasks();

        const entryBtn = window.document.querySelector('[data-settings-entry="workspace"]') as HTMLButtonElement | null;
        assert.ok(entryBtn, `workspace settings entry exists in ${lang}`);
        await act(async () => {
          entryBtn.click();
        });
        await flushMicrotasks();

        const freshBtn = window.document.querySelector('[data-workspace-restore-tabs="fresh"]') as HTMLButtonElement | null;
        const showLastBtn = window.document.querySelector('[data-workspace-restore-focus="last"]') as HTMLButtonElement | null;
        assert.ok(freshBtn && showLastBtn);
        assert.equal(showLastBtn.disabled, false);

        // Choose "start fresh" -> disables "After restoring, show" and preserves linkTarget
        await act(async () => {
          freshBtn.click();
        });
        await flushMicrotasks();

        assert.equal(showLastBtn.disabled, true);
        assert.deepEqual(settings.data.get(WORKSPACE_PREFS_SETTING), {
          restoreTabs: false,
          restoreFocus: 'new',
          linkTarget: 'same',
        });

        // Switch back to "restore" -> re-enables and allows choosing "last"
        const restoreBtn = window.document.querySelector('[data-workspace-restore-tabs="restore"]') as HTMLButtonElement;
        await act(async () => {
          restoreBtn.click();
        });
        await flushMicrotasks();
        assert.equal(showLastBtn.disabled, false);

        await act(async () => {
          showLastBtn.click();
        });
        await flushMicrotasks();
        assert.deepEqual(settings.data.get(WORKSPACE_PREFS_SETTING), {
          restoreTabs: true,
          restoreFocus: 'last',
          linkTarget: 'same',
        });
      } finally {
        restore();
      }
    }
  });
});
