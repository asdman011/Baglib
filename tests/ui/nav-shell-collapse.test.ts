import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import {
  INITIAL_NAV_SHELL_STATE,
  onNavigateWorkspaceTab,
  toggleSidebarCollapsed,
  setSidebarCollapsed,
  type NavShellState,
} from '../../src/renderer/components/layout/nav-pin-model';
import { WorkspaceProvider, useWorkspace, type WorkspaceViewMode } from '../../src/renderer/components/context/WorkspaceContext';
import { NavigationRail } from '../../src/renderer/components/layout/NavigationRail';

describe('Navigation Shell Collapse & Tab Entry State Logic (KEY-379)', () => {
  it('initializes with sidebar collapsed to its rail and pinned in layout flow', () => {
    assert.strictEqual(INITIAL_NAV_SHELL_STATE.isSidebarCollapsed, true, 'Sidebar must default to collapsed rail');
    assert.strictEqual(INITIAL_NAV_SHELL_STATE.isNavPinned, true, 'Navigation rail must remain pinned in flow');
    assert.strictEqual(INITIAL_NAV_SHELL_STATE.isNavPeekOpen, false, 'Peek overlay must start closed');
    assert.strictEqual(INITIAL_NAV_SHELL_STATE.viewMode, 'dashboard', 'Initial view mode is dashboard');
  });

  it('allows manual expansion and manual collapse of the sidebar', () => {
    const s1 = toggleSidebarCollapsed(INITIAL_NAV_SHELL_STATE);
    assert.strictEqual(s1.isSidebarCollapsed, false, 'Sidebar expands on manual toggle');

    const s2 = toggleSidebarCollapsed(s1);
    assert.strictEqual(s2.isSidebarCollapsed, true, 'Sidebar collapses on second toggle');

    const s3 = setSidebarCollapsed(s2, false);
    assert.strictEqual(s3.isSidebarCollapsed, false, 'setSidebarCollapsed expands sidebar');

    const s4 = setSidebarCollapsed(s3, true);
    assert.strictEqual(s4.isSidebarCollapsed, true, 'setSidebarCollapsed collapses sidebar');
  });

  it('automatically collapses sidebar to rail when entering any workspace tab', () => {
    const allTabs: WorkspaceViewMode[] = [
      'dashboard',
      'planner',
      'statistics',
      'library',
      'categories',
      'lectures',
      'notes-editor',
      'notes',
      'pathways',
      'islamic',
      'quran',
      'sunnah',
      'bayan',
      'reader',
      'settings',
    ];

    for (const tab of allTabs) {
      // User manually expanded the sidebar on current view
      const expandedState: NavShellState = {
        viewMode: 'dashboard',
        isSidebarCollapsed: false,
        isNavPinned: true,
        isNavPeekOpen: false,
      };

      const navigated = onNavigateWorkspaceTab(expandedState, tab);
      assert.strictEqual(navigated.viewMode, tab, `ViewMode must update to ${tab}`);
      assert.strictEqual(navigated.isSidebarCollapsed, true, `Sidebar must collapse to rail when entering ${tab}`);
      assert.strictEqual(navigated.isNavPinned, true, `Pinned sidebar must stay pinned when entering ${tab}`);
      assert.strictEqual(navigated.isNavPeekOpen, false, `Peek must remain closed when entering ${tab}`);
    }
  });

  it('respects pin setting: pinned sidebar stays pinned in layout flow when entering tabs', () => {
    const pinnedExpanded: NavShellState = {
      viewMode: 'library',
      isSidebarCollapsed: false,
      isNavPinned: true,
      isNavPeekOpen: false,
    };

    const next = onNavigateWorkspaceTab(pinnedExpanded, 'quran');
    assert.strictEqual(next.isNavPinned, true, 'Pinned setting is preserved');
    assert.strictEqual(next.isSidebarCollapsed, true, 'Sidebar collapses to rail while docked in flow');
  });

  it('respects unpinned setting: unpinned sidebar closes peek overlay when entering tabs', () => {
    const unpinnedWithPeek: NavShellState = {
      viewMode: 'library',
      isSidebarCollapsed: false,
      isNavPinned: false,
      isNavPeekOpen: true,
    };

    const next = onNavigateWorkspaceTab(unpinnedWithPeek, 'notes');
    assert.strictEqual(next.isNavPinned, false, 'Unpinned setting is preserved');
    assert.strictEqual(next.isNavPeekOpen, false, 'Peek overlay is closed on tab selection');
    assert.strictEqual(next.isSidebarCollapsed, true, 'Sidebar collapses to rail');
  });

  it('collapses sidebar to rail when user re-selects the currently active tab', () => {
    const activeTabExpanded: NavShellState = {
      viewMode: 'sunnah',
      isSidebarCollapsed: false,
      isNavPinned: true,
      isNavPeekOpen: false,
    };

    // User is on 'sunnah', manually expanded the sidebar, then clicks 'sunnah' again
    const next = onNavigateWorkspaceTab(activeTabExpanded, 'sunnah');
    assert.strictEqual(next.viewMode, 'sunnah');
    assert.strictEqual(next.isSidebarCollapsed, true, 'Sidebar collapses even when re-selecting current tab');
  });
});

function setupDOM() {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  class MockCustomEvent extends window.Event {
    detail?: unknown;
    constructor(type: string, options?: { detail?: unknown; bubbles?: boolean; cancelable?: boolean }) {
      super(type, options);
      this.detail = options?.detail;
    }
  }

  // @ts-expect-error Mocking browser globals for LinkeDOM
  globalThis.window = window;
  // @ts-expect-error Mocking browser globals for LinkeDOM
  globalThis.document = window.document;
  // @ts-expect-error Mocking browser globals for LinkeDOM
  globalThis.navigator = window.navigator;
  globalThis.CustomEvent = MockCustomEvent as unknown as typeof CustomEvent;
  // @ts-expect-error Mocking localStorage
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  };
  // @ts-expect-error Mocking requestAnimationFrame
  globalThis.requestAnimationFrame = (cb: () => void) => { cb(); return 1; };
  // @ts-expect-error Mocking cancelAnimationFrame
  globalThis.cancelAnimationFrame = () => {};

  return { window, document: window.document };
}

describe('NavigationRail Component Auto-Collapse on Tab Entry (KEY-379)', () => {
  it('renders NavigationRail collapsed by default, allows manual expand, and auto-collapses on tab click', async () => {
    const { document } = setupDOM();
    const rootEl = document.getElementById('root')!;
    const root = createRoot(rootEl as unknown as HTMLElement);

    let contextRef: ReturnType<typeof useWorkspace> | null = null;
    const TestConsumer = () => {
      contextRef = useWorkspace();
      return createElement(NavigationRail, null);
    };

    await act(async () => {
      root.render(
        createElement(WorkspaceProvider, null, createElement(TestConsumer, null))
      );
    });

    const aside = document.querySelector('aside') as HTMLElement;
    assert.ok(aside, 'NavigationRail aside must be rendered');
    assert.strictEqual(aside.getAttribute('data-sidebar-collapsed'), 'true', 'Must start collapsed');
    assert.ok(aside.className.includes('w-14') || aside.className.includes('w-16'), 'Must have narrow rail width');

    // Expand button is visible
    const expandBtn = document.querySelector('button[data-testid="expand-sidebar-btn"]') as HTMLButtonElement;
    assert.ok(expandBtn, 'Expand button must exist in collapsed state');

    // Click expand button to manually expand
    await act(async () => {
      expandBtn.click();
    });

    assert.strictEqual(contextRef!.isSidebarCollapsed, false, 'Sidebar is now expanded');
    assert.strictEqual(aside.getAttribute('data-sidebar-collapsed'), 'false', 'Aside reflects expanded state');
    assert.ok(aside.className.includes('lg:w-56'), 'Aside has full lg:w-56 width when expanded');

    // Collapse button is now visible
    const collapseBtn = document.querySelector('button[data-testid="collapse-sidebar-btn"]') as HTMLButtonElement;
    assert.ok(collapseBtn, 'Collapse button must exist in expanded state');

    // Click a workspace tab item (e.g. library)
    const libraryBtn = document.querySelector('button[data-nav-item="library"]') as HTMLButtonElement;
    assert.ok(libraryBtn, 'Library nav item button must exist');

    await act(async () => {
      libraryBtn.click();
    });

    assert.strictEqual(contextRef!.viewMode, 'library', 'View mode switched to library');
    assert.strictEqual(contextRef!.isSidebarCollapsed, true, 'Sidebar automatically collapsed to rail upon entering tab');
    assert.strictEqual(aside.getAttribute('data-sidebar-collapsed'), 'true', 'Aside attribute updated to collapsed');
    assert.strictEqual(contextRef!.isNavPinned, true, 'Navigation rail remains pinned in flow');

    // Manually expand again
    const expandBtn2 = document.querySelector('button[data-testid="expand-sidebar-btn"]') as HTMLButtonElement;
    assert.ok(expandBtn2, 'Expand button is available again');
    await act(async () => {
      expandBtn2.click();
    });
    assert.strictEqual(contextRef!.isSidebarCollapsed, false, 'Manually expanded again');

    // Navigating via programmatic setViewMode (e.g. from command palette or shortcut)
    await act(async () => {
      contextRef!.setViewMode('quran');
    });

    assert.strictEqual(contextRef!.viewMode, 'quran', 'View mode switched to quran');
    assert.strictEqual(contextRef!.isSidebarCollapsed, true, 'Sidebar automatically collapsed on setViewMode');

    root.unmount();
  });

  it('supports RTL (Arabic) and LTR (English) rendering without layout jumping', async () => {
    const { document } = setupDOM();
    const rootEl = document.getElementById('root')!;
    const root = createRoot(rootEl as unknown as HTMLElement);

    let contextRef: ReturnType<typeof useWorkspace> | null = null;
    const TestConsumer = () => {
      contextRef = useWorkspace();
      return createElement(NavigationRail, null);
    };

    await act(async () => {
      root.render(
        createElement(WorkspaceProvider, null, createElement(TestConsumer, null))
      );
    });

    // Default is Arabic / RTL
    assert.strictEqual(contextRef!.lang, 'ar');
    assert.strictEqual(contextRef!.dir, 'rtl');

    const aside = document.querySelector('aside') as HTMLElement;
    assert.ok(aside.className.includes('border-e'), 'Uses logical border-e for RTL/LTR compatibility');

    // Switch to English / LTR
    await act(async () => {
      contextRef!.toggleLanguage();
    });

    assert.strictEqual(contextRef!.lang, 'en');
    assert.strictEqual(contextRef!.dir, 'ltr');
    assert.ok(aside.className.includes('border-e'), 'Preserves logical properties in English');

    root.unmount();
  });
});
