import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import {
  CompanionToggle,
  COMPANION_REST_WIDTH_PX,
  COMPANION_EXPANDED_WIDTH_PX,
  COMPANION_MIN_TOP_PERCENT,
  COMPANION_MAX_TOP_PERCENT,
  clampCompanionTopPercent,
  resolveCompanionEdge,
  findNonCollidingTopPercent,
  isCompanionShortcut,
  readCompanionSavedState,
  writeCompanionSavedState,
} from '../../src/renderer/components/notes/CompanionNotePane';
import { translations } from '../../src/renderer/translations';

test('Global themed scrollbars in globals.css define rounded tokens, scrollbar-color/width, and ::-webkit-scrollbar* rules (KEY-315)', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/app/globals.css'), 'utf8');

  const rootMatch = css.match(/:root\s*\{([\s\S]*?)\}/);
  assert.ok(rootMatch, ':root block exists in globals.css');
  const rootBlock = rootMatch[1];
  assert.match(rootBlock, /--scrollbar-track:\s*transparent;/, 'Light mode defines thin transparent scrollbar track');
  assert.match(
    rootBlock,
    /--scrollbar-thumb:\s*color-mix\(in srgb,\s*var\(--color-text-muted-val\)/,
    'Light mode defines warm grey thumb from tokens'
  );
  assert.match(
    rootBlock,
    /--scrollbar-thumb-hover:\s*var\(--color-text-muted-val\);/,
    'Light mode defines darker hover thumb from tokens'
  );

  const darkMatch = css.match(/\.dark\s*\{([\s\S]*?)\}/);
  assert.ok(darkMatch, '.dark block exists in globals.css');
  const darkBlock = darkMatch[1];
  assert.match(darkBlock, /--scrollbar-track:\s*transparent;/, 'Dark mode defines thin transparent scrollbar track');
  assert.match(
    darkBlock,
    /--scrollbar-thumb:\s*color-mix\(in srgb,\s*var\(--color-text-muted-val\)/,
    'Dark mode defines subtle light-grey thumb from tokens (not white)'
  );
  assert.doesNotMatch(darkBlock, /--scrollbar-thumb:\s*#fff/i, 'Dark mode thumb is never white');
  assert.match(
    darkBlock,
    /--scrollbar-thumb-hover:\s*color-mix\(in srgb,\s*var\(--color-text-muted-val\)/,
    'Dark mode defines darker hover thumb from tokens'
  );

  assert.match(css, /scrollbar-width:\s*thin;/, 'Defines scrollbar-width: thin');
  assert.match(
    css,
    /scrollbar-color:\s*var\(--scrollbar-thumb\)\s+var\(--scrollbar-track\);/,
    'Defines scrollbar-color from tokens'
  );
  assert.match(css, /\*::-webkit-scrollbar\s*\{[\s\S]*?width:\s*10px;/, 'Defines ::-webkit-scrollbar dimensions');
  assert.match(
    css,
    /\*::-webkit-scrollbar-thumb\s*\{[\s\S]*?border-radius:\s*9999px;[\s\S]*?border:\s*3px solid transparent;/,
    'Defines fully rounded thin ::-webkit-scrollbar-thumb'
  );
  assert.match(
    css,
    /\*::-webkit-scrollbar-thumb:hover\s*\{[\s\S]*?background-color:\s*var\(--scrollbar-thumb-hover\);[\s\S]*?border-width:\s*1\.5px;/,
    'Thumb gets slightly wider and darker on hover'
  );
  assert.match(
    css,
    /\.pdf-native-viewer-container\s*\{[\s\S]*?scrollbar-width:\s*auto\s*!important;/,
    'Never hides needed scrollbar in PDF viewer container'
  );
});

test('Side-note helpers: edge resolution, collision avoidance, position clamping, and shortcut detection (KEY-315)', () => {
  // Rest width is strictly within 8–12 px
  assert.ok(COMPANION_REST_WIDTH_PX >= 8 && COMPANION_REST_WIDTH_PX <= 12);
  assert.ok(COMPANION_EXPANDED_WIDTH_PX > COMPANION_REST_WIDTH_PX);

  // Clamping vertical position
  assert.equal(clampCompanionTopPercent(5), COMPANION_MIN_TOP_PERCENT);
  assert.equal(clampCompanionTopPercent(95), COMPANION_MAX_TOP_PERCENT);
  assert.equal(clampCompanionTopPercent(54.4), 54);
  assert.equal(clampCompanionTopPercent(Number.NaN), 50);

  // Edge collision check against KEY-310 start-side nav peek edge
  assert.equal(resolveCompanionEdge('end', true), 'end');
  assert.equal(resolveCompanionEdge('start', true), 'end', 'Avoids colliding with start-side nav peek edge');
  assert.equal(resolveCompanionEdge('start', false), 'start');

  // Interactive control collision avoidance
  const collidingControl = [{ top: 380, bottom: 420, left: 1265, right: 1280 }];
  const avoided = findNonCollidingTopPercent(50, 800, collidingControl, { left: 1266, right: 1280 }, 32);
  assert.notEqual(avoided, 50, 'Moves away from 50% when an interactive control occupies that edge slot');
  assert.ok(avoided >= COMPANION_MIN_TOP_PERCENT && avoided <= COMPANION_MAX_TOP_PERCENT);

  // Shortcut detection & zero collision with existing shortcuts
  assert.equal(
    isCompanionShortcut({
      key: 'm',
      code: 'KeyM',
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      altKey: false,
      defaultPrevented: false,
      repeat: false,
    }),
    true
  );
  assert.equal(
    isCompanionShortcut({
      key: 'ة',
      code: 'KeyM',
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      altKey: false,
      defaultPrevented: false,
      repeat: false,
    }),
    true,
    'Works with Arabic keyboard layout'
  );
  // Must not collide with Alt+M (KEY-291 markup bar), Ctrl+B (KEY-310 nav pin), Ctrl+K, or Ctrl+Shift+N
  assert.equal(
    isCompanionShortcut({
      key: 'm',
      code: 'KeyM',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: true,
      defaultPrevented: false,
      repeat: false,
    }),
    false
  );
  assert.equal(
    isCompanionShortcut({
      key: 'b',
      code: 'KeyB',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
      repeat: false,
    }),
    false
  );
  assert.equal(
    isCompanionShortcut({
      key: 'n',
      code: 'KeyN',
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      altKey: false,
      defaultPrevented: false,
      repeat: false,
    }),
    false
  );
});

for (const language of ['ar', 'en'] as const) {
  test(`CompanionToggle side-note tab states (rest tip, hover, keyboard focus, click, memory, shortcut) in ${language}`, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    const storage = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => {
          storage.set(k, String(v));
        },
        removeItem: (k: string) => {
          storage.delete(k);
        },
      },
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: window.localStorage,
    });

    const globals = {
      window,
      document: window.document,
      React,
      IS_REACT_ACT_ENVIRONMENT: true,
      HTMLElement: window.HTMLElement,
    };
    for (const [key, value] of Object.entries(globals)) {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getAllBooks: async () => [],
        getAllNotes: async () => [],
        getCategoryTree: async () => [],
        studyNotes: {
          list: async () => [],
          onChanged: () => () => {},
        },
        knowledge: { getAll: async () => [] },
      },
    });

    // Seed remembered position in localStorage before mounting
    writeCompanionSavedState({ open: false, topPercent: 64, edge: 'end' });
    assert.equal(readCompanionSavedState().topPercent, 64);

    let toggledCount = 0;
    let isOpen = false;
    let workspace!: ReturnType<typeof useWorkspace>;

    function Harness({ open }: { open: boolean }) {
      workspace = useWorkspace();
      return createElement(
        'div',
        { dir: workspace.dir },
        createElement(CompanionToggle, {
          open,
          onToggle: () => {
            toggledCount += 1;
            isOpen = !isOpen;
          },
        })
      );
    }

    const root = createRoot(window.document.getElementById('root')!);

    try {
      await act(async () => {
        root.render(createElement(WorkspaceProvider, null, createElement(Harness, { open: false })));
      });

      if (workspace.lang !== language) {
        await act(async () => {
          workspace.toggleLanguage();
        });
      }

      const toggle = window.document.querySelector('[data-companion-toggle]') as HTMLButtonElement | null;
      assert.ok(toggle, 'Side-note toggle button should render when closed');

      // 1. At rest: small 10px edge tip, no text, no tooltip, placed on 'end' edge at remembered 64%
      assert.equal(toggle.getAttribute('data-state'), 'rest');
      assert.equal(toggle.getAttribute('data-edge'), 'end');
      assert.equal(toggle.getAttribute('data-top-percent'), '64');
      assert.equal(toggle.style.width, `${COMPANION_REST_WIDTH_PX}px`);
      assert.equal(toggle.textContent?.trim() ?? '', '', 'At rest the tab must contain no visible text label');
      assert.equal(window.document.querySelector('[data-companion-tooltip]'), null, 'No tooltip bubble at rest');
      assert.equal(toggle.getAttribute('aria-label'), translations[language].companionOpen);

      // 2. On hover: slides out into 32px icon button and shows tooltip
      await act(async () => {
        toggle.dispatchEvent(new window.Event('mouseover', { bubbles: true }));
      });
      assert.equal(toggle.getAttribute('data-state'), 'expanded');
      assert.equal(toggle.style.width, `${COMPANION_EXPANDED_WIDTH_PX}px`);
      const hoverTooltip = window.document.querySelector('[data-companion-tooltip]');
      assert.ok(hoverTooltip, 'Tooltip should render on hover');
      assert.equal(hoverTooltip.getAttribute('role'), 'tooltip');
      assert.equal(hoverTooltip.textContent, translations[language].companionOpen);

      // Mouse leave returns to rest tip
      await act(async () => {
        toggle.dispatchEvent(new window.Event('mouseout', { bubbles: true }));
      });
      assert.equal(toggle.getAttribute('data-state'), 'rest');
      assert.equal(toggle.style.width, `${COMPANION_REST_WIDTH_PX}px`);
      assert.equal(window.document.querySelector('[data-companion-tooltip]'), null);

      // 3. On keyboard focus: reachable by keyboard, slides out and shows tooltip
      await act(async () => {
        toggle.focus();
        toggle.dispatchEvent(new window.Event('focusin', { bubbles: true }));
      });
      assert.equal(toggle.getAttribute('data-state'), 'expanded');
      assert.equal(toggle.style.width, `${COMPANION_EXPANDED_WIDTH_PX}px`);
      const focusTooltip = window.document.querySelector('[data-companion-tooltip]');
      assert.ok(focusTooltip, 'Tooltip should render on keyboard focus');
      assert.equal(focusTooltip.textContent, translations[language].companionOpen);

      // 4. Keyboard repositioning (Alt+ArrowDown) updates position and persists to memory
      await act(async () => {
        const keyDown = new window.Event('keydown', { bubbles: true, cancelable: true }) as KeyboardEvent & {
          key: string;
          altKey: boolean;
        };
        Object.defineProperty(keyDown, 'key', { value: 'ArrowDown' });
        Object.defineProperty(keyDown, 'altKey', { value: true });
        toggle.dispatchEvent(keyDown);
      });
      assert.equal(toggle.getAttribute('data-top-percent'), '69');
      assert.equal(readCompanionSavedState().topPercent, 69, 'Position memory persisted in localStorage');

      // Blur returns to rest state
      await act(async () => {
        toggle.blur();
        toggle.dispatchEvent(new window.Event('focusout', { bubbles: true }));
      });
      assert.equal(toggle.getAttribute('data-state'), 'rest');

      // 5. On click: opens side note
      await act(async () => {
        toggle.click();
      });
      assert.equal(toggledCount, 1);
      assert.equal(isOpen, true);

      // 6. Shortcut (Ctrl+Shift+M): triggers toggle
      await act(async () => {
        const shortcutEvent = new window.Event('keydown', { bubbles: true, cancelable: true }) as KeyboardEvent;
        Object.defineProperty(shortcutEvent, 'key', { value: 'M' });
        Object.defineProperty(shortcutEvent, 'code', { value: 'KeyM' });
        Object.defineProperty(shortcutEvent, 'ctrlKey', { value: true });
        Object.defineProperty(shortcutEvent, 'shiftKey', { value: true });
        Object.defineProperty(shortcutEvent, 'altKey', { value: false });
        window.dispatchEvent(shortcutEvent);
      });
      assert.equal(toggledCount, 2);

      // When open=true, CompanionToggle renders nothing
      await act(async () => {
        root.render(createElement(WorkspaceProvider, null, createElement(Harness, { open: true })));
      });
      assert.equal(window.document.querySelector('[data-companion-toggle]'), null);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
}

test('the companion pane saves outside React state updaters and keeps the toggle position', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../../src/renderer/components/notes/CompanionNotePane.tsx', import.meta.url), 'utf8');
  // Saving dispatches an event the toggle listens to; inside an updater that runs while React renders.
  assert.doesNotMatch(source, /setState\(\s*\w+\s*=>\s*writeCompanionSavedState/u);
  const storage = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, String(value)); } } });
  try {
    writeCompanionSavedState({ topPercent: 30, edge: 'start' });
    const saved = writeCompanionSavedState({ noteId: 'note-1', stamp: false });
    assert.deepEqual({ noteId: saved.noteId, stamp: saved.stamp, topPercent: saved.topPercent, edge: saved.edge }, { noteId: 'note-1', stamp: false, topPercent: 30, edge: 'start' });
    assert.equal(readCompanionSavedState().noteId, 'note-1');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
