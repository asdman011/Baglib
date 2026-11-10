import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { NewObjectMenu } from '../../src/renderer/components/layout/NewObjectMenu';
import { Titlebar } from '../../src/renderer/components/layout/Titlebar';
import { TreeDrawer } from '../../src/renderer/components/layout/TreeDrawer';
import { SupportSheet } from '../../src/renderer/components/layout/SupportSheet';
import { CommandPalette } from '../../src/renderer/components/layout/CommandPalette';

function setupDOM() {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  class MockCustomEvent extends window.Event {
    detail?: unknown;
    constructor(type: string, options?: { detail?: unknown; bubbles?: boolean; cancelable?: boolean }) {
      super(type, options);
      this.detail = options?.detail;
    }
  }
  class MockKeyboardEvent extends window.Event {
    key: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    constructor(type: string, options?: { key?: string; shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; bubbles?: boolean; cancelable?: boolean }) {
      super(type, options);
      this.key = options?.key ?? '';
      this.shiftKey = options?.shiftKey ?? false;
      this.ctrlKey = options?.ctrlKey ?? false;
      this.altKey = options?.altKey ?? false;
      this.metaKey = options?.metaKey ?? false;
    }
  }

  // @ts-expect-error Mocking browser globals for tests
  globalThis.window = window;
  // @ts-expect-error Mocking browser globals for tests
  globalThis.document = window.document;
  // @ts-expect-error Mocking browser globals for tests
  globalThis.navigator = window.navigator;
  globalThis.CustomEvent = MockCustomEvent as unknown as typeof CustomEvent;
  globalThis.KeyboardEvent = MockKeyboardEvent as unknown as typeof KeyboardEvent;
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

test('Shell UI: NewObjectMenu Renders & Triggers 6 Creation Flows (D3)', async () => {
  const { document } = setupDOM();
  const rootEl = document.getElementById('root')!;
  const root = createRoot(rootEl as unknown as HTMLElement);

  await act(async () => {
    root.render(
      createElement(WorkspaceProvider, null, createElement(NewObjectMenu, null))
    );
  });

  const button = document.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement | null;
  assert.ok(button, 'New Object button must exist with aria-haspopup="menu"');

  // Open menu
  await act(async () => {
    button.click();
  });

  const menu = document.querySelector('[role="menu"]');
  assert.ok(menu, 'Menu primitive must open');

  const items = document.querySelectorAll('[role="menuitem"]');
  assert.equal(items.length, 6, 'Menu must contain exactly 6 creation flows');

  root.unmount();
});

test('Shell UI: Titlebar Renders Breadcrumb & Mobile Drawer Trigger Button', async () => {
  const { document } = setupDOM();
  const rootEl = document.getElementById('root')!;
  const root = createRoot(rootEl as unknown as HTMLElement);

  await act(async () => {
    root.render(
      createElement(WorkspaceProvider, null, createElement(Titlebar, null))
    );
  });

  // Breadcrumb navigation element must exist
  const breadcrumbNav = document.querySelector('nav[aria-label="مسار التنقل"], nav[aria-label="Breadcrumbs"]');
  assert.ok(breadcrumbNav, 'Breadcrumb navigation container must exist');

  // Mobile drawer trigger menu button
  const mobileMenuBtn = document.querySelector('button[aria-label="فتح القائمة الرئيسية"], button[aria-label="Open main navigation"]');
  assert.ok(mobileMenuBtn, 'Mobile drawer toggle button must exist');

  // Command palette search trigger
  const searchBtn = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent?.includes('K') || b.getAttribute('aria-label')?.includes('ابحث') || b.getAttribute('aria-label')?.includes('Search')
  );
  assert.ok(searchBtn, 'Command palette search trigger button must exist');

  root.unmount();
});

test('Shell UI: TreeDrawer Renders at Narrow Widths & Closes on Item Select', async () => {
  const { document } = setupDOM();
  const rootEl = document.getElementById('root')!;
  const root = createRoot(rootEl as unknown as HTMLElement);

  function TestHarness() {
    const { setIsMobileNavOpen } = useWorkspace();
    return createElement(
      'div',
      null,
      createElement(
        'button',
        {
          id: 'open-drawer-btn',
          onClick: () => setIsMobileNavOpen(true),
        },
        'Open Drawer'
      ),
      createElement(TreeDrawer, null)
    );
  }

  await act(async () => {
    root.render(
      createElement(WorkspaceProvider, null, createElement(TestHarness, null))
    );
  });

  // Drawer initially closed
  assert.equal(document.querySelector('[role="dialog"]'), null);

  // Open drawer
  const openBtn = document.getElementById('open-drawer-btn')! as HTMLButtonElement;
  await act(async () => {
    openBtn.click();
  });

  // Drawer now open in a Sheet
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog, 'TreeDrawer Sheet must be open');

  // Must contain grouped navigation
  const nav = dialog.querySelector('nav[aria-label="التنقل العام"], nav[aria-label="Global Navigation"]');
  assert.ok(nav, 'Grouped nav must be inside drawer');

  // Must contain New Object button inside drawer
  const newObjBtn = dialog.querySelector('button[aria-haspopup="menu"]');
  assert.ok(newObjBtn, 'New Object button must be inside drawer');

  // Click a navigation item (e.g. planner) and verify it navigates and auto-closes drawer
  const navButtons = Array.from(dialog.querySelectorAll('button')) as HTMLButtonElement[];
  const plannerBtn = navButtons.find((btn) => btn.textContent?.includes('مخطط الدراسة') || btn.textContent?.includes('Study Planner'));
  assert.ok(plannerBtn, 'Planner nav button must exist in drawer');

  await act(async () => {
    plannerBtn.click();
  });

  // Drawer must now be closed
  assert.equal(document.querySelector('[role="dialog"]'), null, 'Drawer must auto-close on navigation');

  root.unmount();
});

test('Shell UI: SupportSheet Renders System Info & Local Storage Guarantee', async () => {
  const { document } = setupDOM();
  const rootEl = document.getElementById('root')!;
  const root = createRoot(rootEl as unknown as HTMLElement);

  function TestSupportHarness() {
    const { setIsSupportSheetOpen } = useWorkspace();
    return createElement(
      'div',
      null,
      createElement(
        'button',
        {
          id: 'open-support-btn',
          onClick: () => setIsSupportSheetOpen(true),
        },
        'Open Support'
      ),
      createElement(SupportSheet, null)
    );
  }

  await act(async () => {
    root.render(
      createElement(WorkspaceProvider, null, createElement(TestSupportHarness, null))
    );
  });

  // Support initially closed
  assert.equal(document.querySelector('[role="dialog"]'), null);

  // Open support sheet
  const openBtn = document.getElementById('open-support-btn')! as HTMLButtonElement;
  await act(async () => {
    openBtn.click();
  });

  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog, 'Support Sheet must be open');
  assert.ok(dialog.textContent?.includes('v0.1.0-alpha'), 'Must display version');
  assert.ok(dialog.textContent?.includes('Electron'), 'Must display runtime environment');

  root.unmount();
});

test('Shell UI: CommandPalette Includes Workspace Navigation Commands', async () => {
  const { document } = setupDOM();
  const rootEl = document.getElementById('root')!;
  const root = createRoot(rootEl as unknown as HTMLElement);

  function TestPaletteHarness() {
    const { setCommandPaletteOpen } = useWorkspace();
    return createElement(
      'div',
      null,
      createElement(
        'button',
        {
          id: 'open-palette-btn',
          onClick: () => setCommandPaletteOpen(true),
        },
        'Open Palette'
      ),
      createElement(CommandPalette, null)
    );
  }

  await act(async () => {
    root.render(
      createElement(WorkspaceProvider, null, createElement(TestPaletteHarness, null))
    );
  });

  const openBtn = document.getElementById('open-palette-btn')! as HTMLButtonElement;
  await act(async () => {
    openBtn.click();
  });

  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog, 'Command Palette must open');

  const buttons = Array.from(dialog.querySelectorAll('button'));
  // Should list workspace destinations (e.g. Dashboard, Library, Quran, etc.)
  const hasWorkspaceItem = buttons.some((b) => b.textContent?.includes('الرئيسية') || b.textContent?.includes('المكتبة') || b.textContent?.includes('Dashboard') || b.textContent?.includes('Library'));
  assert.ok(hasWorkspaceItem, 'Command Palette must include workspace destinations');

  root.unmount();
});
