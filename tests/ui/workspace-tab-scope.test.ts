import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import {
  TabScope,
  WorkspaceProvider,
  useTab,
  useTabs,
  useWorkspace,
  type WorkspaceContextType,
  type WorkspaceViewMode,
} from '../../src/renderer/components/context';
import { homeLocation, newTab, type TabsState } from '../../src/shared/workspace-tabs';
import {
  consumePendingCfi,
  consumePendingPage,
  consumeStudyNote,
  consumeSunnahReference,
  isTabEventTarget,
  openStudyNote,
  openSunnahReference,
  STUDY_NOTE_OPEN,
} from '../../src/renderer/utils/study-navigation';
import { consumeQuranAyah, openQuranAyah, QURAN_OPEN_EVENT } from '../../src/renderer/utils/quran-navigation';
import { consumePoetryReference, openPoetryReference, POETRY_OPEN_EVENT } from '../../src/renderer/utils/poetry-navigation';
import { consumeLecture, LECTURE_OPEN_EVENT, openLecture } from '../../src/renderer/utils/lecture-navigation';

function setupDom() {
  const { window } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    CustomEvent: globalThis.CustomEvent,
    Event: globalThis.Event,
  };
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    window,
    document: window.document,
    navigator: window.navigator,
    CustomEvent: window.CustomEvent,
    Event: window.Event,
  });
  return {
    container: window.document.getElementById('root')!,
    cleanup: () => Object.assign(globalThis, prev),
  };
}

// Type-level check: WorkspaceContextType preserves all expected keys and types.
type AssertHasKeys<T, K extends keyof T> = K;
const _assertWorkspaceKeys: AssertHasKeys<
  WorkspaceContextType,
  | 'researchEditorAvailable'
  | 'dir'
  | 'theme'
  | 'lang'
  | 'isCommandPaletteOpen'
  | 'isSearchHubOpen'
  | 'isZenMode'
  | 'isSidebarCollapsed'
  | 'isNavPinned'
  | 'isNavPeekOpen'
  | 'books'
  | 'booksLoading'
  | 'booksError'
  | 'categoryTree'
  | 'allTags'
  | 'activeBook'
  | 'readingPage'
  | 'totalPages'
  | 'splitOrientation'
  | 'bookNotes'
  | 'highlights'
  | 'viewMode'
  | 'activeLibraryCategory'
  | 'toggleDirection'
  | 'toggleTheme'
  | 'toggleLanguage'
  | 'toggleZenMode'
  | 'toggleSidebar'
  | 'setSidebarCollapsed'
  | 'collapseSidebar'
  | 'expandSidebar'
  | 'toggleNavPinned'
  | 'setNavPinned'
  | 'setIsNavPeekOpen'
  | 'openNavPeek'
  | 'closeNavPeek'
  | 'scheduleCloseNavPeek'
  | 'cancelCloseNavPeek'
  | 'setIsMobileNavOpen'
  | 'toggleMobileNav'
  | 'setIsSupportSheetOpen'
  | 'setCommandPaletteOpen'
  | 'setSearchHubOpen'
  | 'isImportWizardOpen'
  | 'setIsImportWizardOpen'
  | 'droppedImportPaths'
  | 'setDroppedImportPaths'
  | 'setViewMode'
  | 'setActiveLibraryCategory'
  | 't'
  | 'refreshBooks'
  | 'refreshCategoryTree'
  | 'refreshTags'
  | 'addBook'
  | 'updateBook'
  | 'deleteBook'
  | 'updateBookReadingStatus'
  | 'openBookForReading'
  | 'closeReaderToLibrary'
  | 'setReadingPage'
  | 'setSplitOrientation'
  | 'addPageNote'
  | 'deletePageNote'
  | 'addHighlight'
> = 'viewMode';
void _assertWorkspaceKeys;

describe('WorkspaceContext TabScope split (KEY-418)', () => {
  it('preserves useWorkspace() shape and records history on setViewMode', async () => {
    const dom = setupDom();
    let capturedWorkspace: WorkspaceContextType | null = null;
    let capturedTabs: ReturnType<typeof useTabs> | null = null;
    let capturedTab: ReturnType<typeof useTab> | null = null;

    function InnerView() {
      const ws = useWorkspace();
      const tab = useTab();
      const tabs = useTabs();
      capturedWorkspace = ws;
      capturedTab = tab;
      capturedTabs = tabs;
      return createElement('div', { 'data-view': ws.viewMode }, ws.viewMode);
    }

    const root = createRoot(dom.container);
    try {
      await act(async () => {
        root.render(
          createElement(
            WorkspaceProvider,
            null,
            createElement(TabScope, { tabId: 'tab-1' }, createElement(InnerView)),
          ),
        );
      });

      assert.ok(capturedWorkspace);
      assert.strictEqual(capturedWorkspace!.viewMode, 'dashboard');
      assert.strictEqual(typeof capturedWorkspace!.setViewMode, 'function');
      assert.strictEqual(typeof capturedWorkspace!.openBookForReading, 'function');
      assert.strictEqual(typeof capturedWorkspace!.addPageNote, 'function');
      assert.strictEqual(typeof capturedWorkspace!.addHighlight, 'function');
      assert.strictEqual(capturedTab!.id, 'tab-1');
      assert.strictEqual(capturedTab!.isFocused, true);
      assert.strictEqual(typeof capturedTab!.registerSnapshot, 'function');
      assert.strictEqual(capturedTabs!.state.tabs[0].history.length, 1);

      await act(async () => {
        capturedWorkspace!.setViewMode('library');
      });

      assert.strictEqual(capturedWorkspace!.viewMode, 'library');
      assert.strictEqual(capturedTabs!.state.tabs[0].history.length, 2);
      assert.deepStrictEqual(
        capturedTabs!.state.tabs[0].history.map(h => h.view),
        ['dashboard', 'library'],
      );
    } finally {
      await act(async () => { root.unmount(); });
      dom.cleanup();
    }
  });

  it('routes unnamed navigation events only to the focused tab, and named events only to the named tab', async () => {
    const dom = setupDom();
    const initialTabs: TabsState = {
      tabs: [
        newTab('tab-1', homeLocation(), 1),
        newTab('tab-2', homeLocation(), 2),
      ],
      activeId: 'tab-1',
    };

    const hits: Record<string, string[]> = { 'tab-1': [], 'tab-2': [] };

    function ListenerProbe({ label }: { label: string }) {
      const tab = useTab();
      const tabRef = useRef(tab);
      useEffect(() => { tabRef.current = tab; }, [tab]);

      useEffect(() => {
        const onQuran = (event: Event) => {
          if (!isTabEventTarget(tabRef.current, event)) return;
          const target = consumeQuranAyah(tabRef.current);
          if (target && 'surah' in target) hits[label].push(`quran:${target.surah}:${target.ayah}`);
        };
        const onSunnah = (event: Event) => {
          if (!isTabEventTarget(tabRef.current, event)) return;
          const target = consumeSunnahReference(tabRef.current);
          if (target) hits[label].push(`sunnah:${target.collection}:${target.hadith}`);
        };
        const onPoetry = (event: Event) => {
          if (!isTabEventTarget(tabRef.current, event)) return;
          const target = consumePoetryReference(tabRef.current);
          if (target) hits[label].push(`poetry:${target.poemId}`);
        };
        const onLecture = (event: Event) => {
          if (!isTabEventTarget(tabRef.current, event)) return;
          const target = consumeLecture(tabRef.current);
          if (target) hits[label].push(`lecture:${target.id}`);
        };
        const onNote = (event: Event) => {
          if (!isTabEventTarget(tabRef.current, event)) return;
          const target = consumeStudyNote(tabRef.current);
          if (target) hits[label].push(`note:${target.id ?? 'new'}`);
        };

        window.addEventListener(QURAN_OPEN_EVENT, onQuran);
        window.addEventListener('baglib:sunnah-open', onSunnah);
        window.addEventListener(POETRY_OPEN_EVENT, onPoetry);
        window.addEventListener(LECTURE_OPEN_EVENT, onLecture);
        window.addEventListener(STUDY_NOTE_OPEN, onNote);
        return () => {
          window.removeEventListener(QURAN_OPEN_EVENT, onQuran);
          window.removeEventListener('baglib:sunnah-open', onSunnah);
          window.removeEventListener(POETRY_OPEN_EVENT, onPoetry);
          window.removeEventListener(LECTURE_OPEN_EVENT, onLecture);
          window.removeEventListener(STUDY_NOTE_OPEN, onNote);
        };
      }, [label]);

      return createElement('div', null, label);
    }

    const root = createRoot(dom.container);
    try {
      await act(async () => {
        root.render(
          createElement(
            WorkspaceProvider,
            { initialTabs },
            createElement(TabScope, { tabId: 'tab-1' }, createElement(ListenerProbe, { label: 'tab-1' })),
            createElement(TabScope, { tabId: 'tab-2' }, createElement(ListenerProbe, { label: 'tab-2' })),
          ),
        );
      });

      // Unnamed events go only to the focused tab (tab-1).
      await act(async () => {
        openQuranAyah({ script: 'hafs', surah: 2, ayah: 255 });
        openSunnahReference({ collection: 'bukhari', chapter: 1, hadith: '1' });
        openPoetryReference({ poemId: 10, from: 1, to: 2 });
        openLecture({ id: 'lec-1', seconds: 30 });
        openStudyNote({ id: 'note-1' });
      });

      assert.deepStrictEqual(hits['tab-1'], [
        'quran:2:255',
        'sunnah:bukhari:1',
        'poetry:10',
        'lecture:lec-1',
        'note:note-1',
      ]);
      assert.deepStrictEqual(hits['tab-2'], []);

      // Named event targets tab-2 even while tab-1 is focused.
      await act(async () => {
        openQuranAyah({ script: 'hafs', surah: 1, ayah: 1, tabId: 'tab-2' });
      });

      assert.deepStrictEqual(hits['tab-1'], [
        'quran:2:255',
        'sunnah:bukhari:1',
        'poetry:10',
        'lecture:lec-1',
        'note:note-1',
      ]);
      assert.deepStrictEqual(hits['tab-2'], ['quran:1:1']);
    } finally {
      await act(async () => { root.unmount(); });
      dom.cleanup();
    }
  });

  it('keeps global UI reading the focused tab and isolates re-renders across tabs and theme', async () => {
    const dom = setupDom();
    const initialTabs: TabsState = {
      tabs: [
        newTab('tab-1', homeLocation(), 1),
        newTab('tab-2', { view: 'quran', title: 'Quran' }, 2),
      ],
      activeId: 'tab-1',
    };

    let globalView: WorkspaceViewMode = 'dashboard';
    let tabsApi: ReturnType<typeof useTabs> | null = null;
    let tab1Ws: WorkspaceContextType | null = null;
    let tab2Renders = 0;
    let tab1Mounts = 0;

    function GlobalShellProbe() {
      const { viewMode } = useWorkspace();
      tabsApi = useTabs();
      globalView = viewMode;
      return createElement('div', { 'data-global-view': viewMode });
    }

    function Tab1Probe() {
      const ws = useWorkspace();
      tab1Ws = ws;
      useEffect(() => { tab1Mounts++; }, []);
      return createElement('div', null, `${ws.viewMode}:${ws.readingPage}`);
    }

    function Tab2Probe() {
      const ws = useWorkspace();
      tab2Renders++;
      return createElement('div', null, `${ws.viewMode}:${ws.readingPage}`);
    }

    const root = createRoot(dom.container);
    try {
      await act(async () => {
        root.render(
          createElement(
            WorkspaceProvider,
            { initialTabs },
            createElement(GlobalShellProbe),
            createElement(TabScope, { tabId: 'tab-1' }, createElement(Tab1Probe)),
            createElement(TabScope, { tabId: 'tab-2' }, createElement(Tab2Probe)),
          ),
        );
      });

      assert.strictEqual(globalView, 'dashboard');
      assert.strictEqual(tab1Mounts, 1);
      const rendersBeforePageTurn = tab2Renders;

      // Page turn in tab-1 must not re-render tab-2.
      await act(async () => {
        tab1Ws!.setReadingPage(7);
      });
      assert.strictEqual(tab2Renders, rendersBeforePageTurn);

      // Theme toggle in global must not remount tab-1.
      await act(async () => {
        tab1Ws!.toggleTheme();
      });
      assert.strictEqual(tab1Mounts, 1);

      // Switching focus to tab-2 makes global UI read tab-2's viewMode.
      await act(async () => {
        tabsApi!.activate('tab-2');
      });
      assert.strictEqual(globalView, 'quran');

      // Pending page/CFI helpers respect tabId.
      assert.strictEqual(consumePendingPage('w1', { id: 'tab-1', isFocused: false }), null);
      assert.strictEqual(consumePendingCfi('w1', { id: 'tab-1', isFocused: false }), null);
    } finally {
      await act(async () => { root.unmount(); });
      dom.cleanup();
    }
  });
});
