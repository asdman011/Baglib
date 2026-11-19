import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider, useTabs, useWorkspace } from '../../src/renderer/components/context';
import { SettingsDirectory } from '../../src/renderer/components/layout/SettingsDirectory';
import { StudyNoteContent } from '../../src/renderer/components/notes/StudyNoteContent';
import { NoteDetailsPane } from '../../src/renderer/components/notes/NoteDetailsPane';
import { PersonalListsHub } from '../../src/renderer/components/lists/PersonalListsHub';
import { StudySourcesSearch } from '../../src/renderer/components/search/StudySourcesSearch';
import { consumePendingPage, studyTargetTitle, studyTargetView } from '../../src/renderer/utils/study-navigation';
import { linkClickModifiers, useOpenStudyLink } from '../../src/renderer/utils/use-study-link';
import { WORKSPACE_PREFS_SETTING, currentLocation } from '../../src/shared/workspace-tabs';
import type { BookItem } from '../../src/shared/types/work';
import type { StudyNote } from '../../src/shared/study-notes';

interface MockSettingsStore {
  data: Map<string, unknown>;
  get: (key: string, fallback?: unknown) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<boolean>;
}

function createMockSettings(initial: Record<string, unknown> = {}): MockSettingsStore {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    data,
    async get(key: string, fallback?: unknown) {
      return data.has(key) ? data.get(key) : fallback;
    },
    async set(key: string, value: unknown) {
      data.set(key, value);
      return true;
    },
  };
}

const sampleBooks: BookItem[] = [
  {
    id: 'b1',
    title: 'تفسير القرآن',
    author: 'ابن كثير',
    filePath: '/books/tafsir.pdf',
    digitalFormat: 'pdf',
    workType: 'book',
  } as BookItem,
  {
    id: 'lec1',
    title: 'Lecture 1',
    author: 'Speaker',
    filePath: '/lectures/lec1.mp4',
    digitalFormat: 'mp4',
    workType: 'lecture',
  } as BookItem,
];

const sampleNotes: StudyNote[] = [
  { id: 'n1', title: 'First Note', content: 'See [[book:b1#p=5|Tafsir p.5]] and [[quran:hafs:1:1|Fatiha 1]]', tags: [], createdAt: '2026-11-19T00:00:00Z', updatedAt: '2026-11-19T00:00:00Z' },
  { id: 'n2', title: 'Second Note', content: 'Links back to [[note:n1|First Note]]', tags: [], createdAt: '2026-11-19T00:00:00Z', updatedAt: '2026-11-19T00:00:00Z' },
];

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
  if (opts.lang) window.localStorage.setItem('baglib-lang', opts.lang);

  // Polyfill getBoundingClientRect & requestAnimationFrame for Menu/ContextMenu positioning
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return { x: 100, y: 100, top: 100, left: 100, right: 200, bottom: 130, width: 100, height: 30, toJSON() { return {}; } } as DOMRect;
  };
  (window as unknown as Record<string, unknown>).requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);

  (window as unknown as Record<string, unknown>).electronAPI = {
    getAllBooks: async () => sampleBooks,
    getBooks: async () => sampleBooks,
    getCategoryTree: async () => [],
    getAllTags: async () => [],
    getAllNotes: async () => [],
    settings: {
      get: settings.get,
      set: settings.set,
    },
    quran: {
      readerCatalog: async () => ({ ok: true, data: { sources: [{ id: 'hafs-1', kind: 'script', profile: 'hafs', title: 'Hafs' }] } }),
      searchAyahs: async () => ({ ok: true, data: [{ surah: 1, ayah: 1, text: 'بسم الله الرحمن الرحيم', source: { id: 'hafs-1', title: 'Hafs' } }] }),
    },
    sunnah: {
      chapter: async () => ({ ok: true, data: { hadiths: [{ id: '1' }] } }),
      search: async () => ({ ok: true, data: [{ chapter: { collection: 'bukhari', number: 1 }, hadith: { id: '1', number: '1', text: { ar: { matn: 'إنما الأعمال بالنيات', full: 'إنما الأعمال بالنيات' } } } }] }),
    },
    poetry: {
      search: async () => ({ ok: true, data: { items: [] } }),
    },
    personalLists: {
      invoke: async (action: string) => {
        if (action === 'all') return { ok: true, data: [{ id: 'starred', kind: 'starred', name: 'Starred', position: 0, createdAt: '2026-11-19', counts: { book: 1, ayah: 0, hadith: 0, poem: 0, lecture: 0, note: 0 } }] };
        if (action === 'items') return { ok: true, data: [{ id: 'item-1', listId: 'starred', itemKind: 'book', itemRef: 'book:b1#p=7', label: 'Tafsir p.7', position: 0, createdAt: '2026-11-19' }] };
        if (action === 'membership') return { ok: true, data: {} };
        return { ok: true, data: [] };
      },
    },
    studyNotes: {
      history: async () => [],
    },
    manuscripts: {
      backlinksForNote: async () => [],
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
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    React,
    IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
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
  return { window, root, restore };
}

async function flush(ms = 20) {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
}

describe('workspace-links (KEY-421 WS-5)', () => {
  it('maps study targets to workspace views and titles', () => {
    assert.equal(studyTargetView('book:b1#p=5', sampleBooks), 'reader');
    assert.equal(studyTargetView('book:lec1', sampleBooks), 'lectures');
    assert.equal(studyTargetView('note:n1', sampleBooks), 'notes');
    assert.equal(studyTargetView('quran:hafs:1:1', sampleBooks), 'quran');
    assert.equal(studyTargetView('sunnah:Bukhari:1:1', sampleBooks), 'sunnah');
    assert.equal(studyTargetView('poetry:ashaar:5:0:1', sampleBooks), 'bayan');
    assert.equal(studyTargetView('media:11111111-1111-1111-1111-111111111111:42', sampleBooks), 'lectures');
    assert.equal(studyTargetView('invalid', sampleBooks), null);
    assert.equal(studyTargetTitle('book:b1#p=5', sampleBooks), 'تفسير القرآن');
    assert.deepEqual(linkClickModifiers({ ctrlKey: true, metaKey: false, button: 0 }), { ctrl: true, meta: false, middle: false });
    assert.deepEqual(linkClickModifiers({ ctrlKey: false, metaKey: false, button: 1 }), { ctrl: false, meta: false, middle: true });
  });

  it('persists "Open links in" in SettingsDirectory (ar and en) without dropping other prefs', async () => {
    for (const lang of ['ar', 'en'] as const) {
      const settings = createMockSettings({
        [WORKSPACE_PREFS_SETTING]: { restoreTabs: false, restoreFocus: 'last', linkTarget: 'new' },
      });
      let livePrefs: unknown = null;
      function Probe() {
        livePrefs = useTabs().prefs;
        return createElement(SettingsDirectory);
      }
      const { window, root, restore } = setupDom(settings, { lang });
      try {
        await act(async () => { root.render(createElement(WorkspaceProvider, null, createElement(Probe))); });
        await flush();

        const entry = window.document.querySelector('[data-settings-entry="workspace"]') as HTMLButtonElement;
        await act(async () => { entry.click(); });
        await flush();

        const sameBtn = window.document.querySelector('[data-workspace-link-target="same"]') as HTMLButtonElement;
        const newBtn = window.document.querySelector('[data-workspace-link-target="new"]') as HTMLButtonElement;
        assert.ok(sameBtn && newBtn);
        assert.equal(newBtn.getAttribute('aria-pressed'), 'true');
        assert.equal(sameBtn.getAttribute('aria-pressed'), 'false');

        await act(async () => { sameBtn.click(); });
        await flush();
        assert.deepEqual(settings.data.get(WORKSPACE_PREFS_SETTING), {
          restoreTabs: false,
          restoreFocus: 'last',
          linkTarget: 'same',
          shareSourceOnly: false,
        });
        assert.deepEqual(livePrefs, { restoreTabs: false, restoreFocus: 'last', linkTarget: 'same', shareSourceOnly: false });
      } finally {
        restore();
      }
    }
  });

  it('routes useOpenStudyLink according to prefs, Ctrl/middle modifiers, and explicit overrides', async () => {
    const settings = createMockSettings({
      [WORKSPACE_PREFS_SETTING]: { restoreTabs: true, restoreFocus: 'new', linkTarget: 'new' },
    });
    let tabsApi: ReturnType<typeof useTabs> | null = null;
    let linkApi: ReturnType<typeof useOpenStudyLink> | null = null;
    let workspaceApi: ReturnType<typeof useWorkspace> | null = null;

    function Harness() {
      tabsApi = useTabs();
      linkApi = useOpenStudyLink();
      workspaceApi = useWorkspace();
      return null;
    }

    const { window, root, restore } = setupDom(settings, { lang: 'en' });
    try {
      await act(async () => { root.render(createElement(WorkspaceProvider, null, createElement(Harness))); });
      await flush();

      assert.equal(tabsApi!.state.tabs.length, 1);

      // Default (new): opens new tab at the end
      await act(async () => { await linkApi!.openLink('book:b1#p=5'); });
      await flush();
      assert.equal(tabsApi!.state.tabs.length, 2);
      const tab2 = tabsApi!.state.tabs[1];
      assert.equal(tabsApi!.state.activeId, tab2.id);
      assert.equal(currentLocation(tab2).view, 'reader');
      assert.equal(currentLocation(tab2).target, 'book:b1#p=5');
      assert.equal(consumePendingPage('b1', tab2.id), 5);

      // Ctrl+click flips to same tab (does not add a 3rd tab)
      await act(async () => { await linkApi!.openLink('quran:hafs:1:1', { ctrl: true }); });
      await flush();
      assert.equal(tabsApi!.state.tabs.length, 2);
      assert.equal(workspaceApi!.activeBook?.id, 'b1');

      // Change pref to 'same' via event
      await act(async () => {
        window.dispatchEvent(new window.CustomEvent('baglib:workspace-prefs-changed', {
          detail: { restoreTabs: true, restoreFocus: 'new', linkTarget: 'same' },
        }));
      });
      await flush();

      // Now normal click uses same tab, middle-click opens a new tab at the end
      await act(async () => { await linkApi!.openLink('note:n1'); });
      assert.equal(tabsApi!.state.tabs.length, 2);

      await act(async () => { await linkApi!.openLink('note:n1', { middle: true }); });
      assert.equal(tabsApi!.state.tabs.length, 3);
      assert.equal(currentLocation(tabsApi!.state.tabs[2]).view, 'notes');
      assert.equal(currentLocation(tabsApi!.state.tabs[2]).target, 'note:n1');
    } finally {
      restore();
    }
  });

  it('wires StudyNoteContent, NoteDetailsPane, PersonalListsHub, and StudySourcesSearch with click, Ctrl/middle, and right-click menu', async () => {
    for (const lang of ['ar', 'en'] as const) {
      const settings = createMockSettings({
        [WORKSPACE_PREFS_SETTING]: { restoreTabs: true, restoreFocus: 'new', linkTarget: 'new' },
      });
      let tabsApi: ReturnType<typeof useTabs> | null = null;

      function NoteContentHarness() {
        tabsApi = useTabs();
        const { t } = useWorkspace();
        const { openLink } = useOpenStudyLink();
        return createElement('div', null,
          createElement(StudyNoteContent, {
            content: 'Read [[book:b1#p=9|Book Link]]',
            notes: sampleNotes,
            t,
            onOpen: (target, options) => { void openLink(target, options); },
          }),
          createElement(NoteDetailsPane, {
            note: sampleNotes[0],
            notes: sampleNotes,
            onOpenTarget: (target, options) => { void openLink(target, options); },
            onRefresh: () => {},
            onClose: () => {},
          }),
          createElement(PersonalListsHub),
          createElement(StudySourcesSearch, { query: 'بسم', onLeave: () => {} }),
        );
      }

      const { window, root, restore } = setupDom(settings, { lang });
      try {
        await act(async () => { root.render(createElement(WorkspaceProvider, null, createElement(NoteContentHarness))); });
        await flush(300);

        // 1. StudyNoteContent link: normal click opens new tab
        const noteLink = window.document.querySelector('[data-study-link="book:b1#p=9"]') as HTMLButtonElement;
        assert.ok(noteLink);
        await act(async () => { noteLink.click(); });
        await flush();
        assert.equal(tabsApi!.state.tabs.length, 2);
        assert.equal(consumePendingPage('b1', tabsApi!.state.tabs[1].id), 9);

        // 2. StudyNoteContent link: right-click shows "Open in new tab" and "Open here"
        await act(async () => {
          noteLink.dispatchEvent(Object.assign(new window.Event('contextmenu', { bubbles: true, cancelable: true }), { clientX: 50, clientY: 50 }));
        });
        await flush();
        const menuItems = [...window.document.querySelectorAll('[data-baglib-menu] [role="menuitem"]')].map(el => el.textContent);
        const expectedNew = lang === 'ar' ? 'فتح في علامة تبويب جديدة' : 'Open in new tab';
        const expectedHere = lang === 'ar' ? 'فتح هنا' : 'Open here';
        assert.ok(menuItems.some(text => text?.includes(expectedNew)), `menu has ${expectedNew}`);
        assert.ok(menuItems.some(text => text?.includes(expectedHere)), `menu has ${expectedHere}`);

        // Click "Open here" -> does not add a 3rd tab
        const openHereBtn = [...window.document.querySelectorAll('[data-baglib-menu] [role="menuitem"]')].find(el => el.textContent?.includes(expectedHere)) as HTMLButtonElement;
        await act(async () => { openHereBtn.click(); });
        await flush();
        assert.equal(tabsApi!.state.tabs.length, 2);

        // 3. PersonalListsHub item: click opens new tab
        const listBtn = window.document.querySelector('[data-lists-item-open="book:b1#p=7"]') as HTMLButtonElement;
        assert.ok(listBtn);
        await act(async () => { listBtn.click(); });
        await flush();
        assert.equal(tabsApi!.state.tabs.length, 3);
        assert.equal(consumePendingPage('b1', tabsApi!.state.tabs[2].id), 7);

        // 4. StudySourcesSearch item: right-click menu includes Open in new tab & Open here
        const quranSearchBtn = window.document.querySelector('[data-list-context="quran:hafs:1:1"] button') as HTMLButtonElement;
        assert.ok(quranSearchBtn);
        await act(async () => {
          quranSearchBtn.dispatchEvent(Object.assign(new window.Event('contextmenu', { bubbles: true, cancelable: true }), { clientX: 60, clientY: 60 }));
        });
        await flush();
        const searchMenuItems = [...window.document.querySelectorAll('[data-baglib-menu] [role="menuitem"]')].map(el => el.textContent);
        assert.ok(searchMenuItems.some(text => text?.includes(expectedNew)));
        assert.ok(searchMenuItems.some(text => text?.includes(expectedHere)));

        // Close menu and test middle-click on NoteDetailsPane backlink -> opens in same tab (no 4th tab)
        await act(async () => {
          window.dispatchEvent(Object.assign(new window.Event('keydown', { bubbles: true }), { key: 'Escape' }));
        });
        await flush();
        const backlinkBtn = window.document.querySelector('ul button') as HTMLButtonElement;
        assert.ok(backlinkBtn);
        await act(async () => {
          backlinkBtn.dispatchEvent(Object.assign(new window.Event('auxclick', { bubbles: true, cancelable: true }), { button: 1 }));
        });
        await flush();
        assert.equal(tabsApi!.state.tabs.length, 3);
      } finally {
        restore();
      }
    }
  });
});
