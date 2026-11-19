import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider, useTab, useTabKeysActive, useTabs, useWorkspace } from '../../src/renderer/components/context';
import {
  WorkspaceHistoryStrip, WorkspaceTabPanels, WorkspaceTabRow, tabCommandEffect, useWorkspaceTabShortcuts,
} from '../../src/renderer/components/layout/WorkspaceTabs';
import { newTab, tabsReducer, type TabsState, type WorkspaceView } from '../../src/shared/workspace-tabs';
import { editorLeaveGuard, registerEditorLeave } from '../../src/renderer/components/research/editor-leave';

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

  it('each manuscript tab keeps its own leave guard', () => {
    const first = async () => true, second = async () => false;
    const offFirst = registerEditorLeave(first, 'm1');
    const offSecond = registerEditorLeave(second, 'm2');
    assert.equal(editorLeaveGuard('m1'), first);
    assert.equal(editorLeaveGuard('m2'), second);
    offSecond();
    assert.equal(editorLeaveGuard('m1'), first, 'removing one tab\'s guard keeps the other');
    offFirst();
    assert.equal(editorLeaveGuard('m1'), undefined);
  });

  it('closing a background manuscript tab with unsaved work asks its editor first', async () => {
    const { window, root, restore } = setup();
    let initial = threeTabs();
    initial = tabsReducer(initial, { type: 'open', id: 'm1', location: { view: 'notes-editor', title: 'مسودة' }, now: 4, background: true });
    let answer = false;
    let asked = 0;
    const off = registerEditorLeave(async () => { asked += 1; return answer; }, 'm1');
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, { initialTabs: initial }, createElement(Shell))));
      await act(async () => fire(window.document.querySelector('[data-tab-close="m1"]')!, 'onClick'));
      await act(async () => {});
      assert.equal(asked, 1, 'the editor was asked');
      assert.ok(tabIds(window).includes('m1'), 'kept open when the user keeps editing');
      assert.equal(window.document.querySelector('[data-workspace-tab-row] [aria-selected="true"]')!.getAttribute('data-tab-id'), 'm1', 'brought forward so the question is visible');
      answer = true;
      await act(async () => fire(window.document.querySelector('[data-tab-close="m1"]')!, 'onClick'));
      await act(async () => {});
      assert.ok(!tabIds(window).includes('m1'));
    } finally { off(); restore(); }
  });

  it('side by side: both panes show, clicking a pane focuses it without moving it, the divider resizes, × ends it', async () => {
    const { window, root, restore } = setup();
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, { initialTabs: threeTabs() }, createElement(Shell))));
      await act(async () => { probe.tabs!.dispatchTabs({ type: 'openBeside', id: 't2' }); });
      const pane = (which: string) => window.document.querySelector('[data-split-pane="' + which + '"]')!;
      assert.equal(window.document.querySelector('[data-tab-panels]')!.getAttribute('data-tab-panels'), 'split');
      assert.equal(pane('first').getAttribute('data-tab-panel'), 't1');
      assert.equal(pane('second').getAttribute('data-tab-panel'), 't2');
      assert.deepEqual(visibleScreens(window).sort(), ['library', 'quran']);
      await act(async () => fire(pane('second'), 'onPointerDownCapture'));
      assert.equal(probe.tabs!.state.activeId, 't2', 'the clicked pane is focused');
      assert.equal(pane('first').getAttribute('data-tab-panel'), 't1', 'the panes stay put');
      assert.ok(pane('second').hasAttribute('data-focused'));
      const divider = window.document.querySelector('[data-split-divider]')!;
      const dir = window.document.querySelector('[data-tab-panels]')!.getAttribute('dir');
      await act(async () => fire(divider, 'onKeyDown', { key: dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight', shiftKey: false }));
      assert.equal(probe.tabs!.state.splitRatio, 0.52);
      await act(async () => fire(window.document.querySelector('[data-split-close]')!, 'onClick'));
      assert.equal(probe.tabs!.state.splitId, undefined);
      assert.equal(window.document.querySelector('[data-tab-panels]')!.getAttribute('data-tab-panels'), 'single');
    } finally { restore(); }
  });

  it('dragging a tab down out of the bar to the window edge opens it beside the focused tab', async () => {
    const { window, root, restore } = setup();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, { initialTabs: threeTabs() }, createElement(Shell))));
      const list = window.document.querySelector('[role="tablist"]') as unknown as { getBoundingClientRect: () => unknown };
      list.getBoundingClientRect = () => ({ left: 0, width: 600, top: 0, bottom: 40 });
      const dir = window.document.querySelector('[data-workspace-tabbar]')!.getAttribute('dir');
      const endX = dir === 'rtl' ? 20 : 1180;
      const tab = () => window.document.querySelector('[data-tab-id="t3"]')!;
      await act(async () => fire(tab(), 'onPointerDown', { clientX: 300, clientY: 20 }));
      await act(async () => fire(tab(), 'onPointerMove', { clientX: endX, clientY: 400 }));
      assert.equal(window.document.querySelector('[data-split-drop]')!.getAttribute('data-split-drop'), 'end');
      await act(async () => fire(tab(), 'onPointerUp', { clientX: endX, clientY: 400 }));
      assert.equal(probe.tabs!.state.activeId, 't1');
      assert.equal(probe.tabs!.state.splitId, 't3');
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

  it('right-clicking a tab offers "Open beside" when a second tab exists and opens both side by side', async () => {
    const { window, root, restore } = setup();
    try {
      const oneTab: TabsState = { tabs: [newTab('t1', { view: 'library', title: '' }, 1)], activeId: 't1' };
      await act(async () => root.render(createElement(WorkspaceProvider, { key: 'one', initialTabs: oneTab }, createElement(Shell))));
      await act(async () => fire(window.document.querySelector('[data-tab-id="t1"]')!, 'onContextMenu', { clientX: 20, clientY: 10, target: window.document.querySelector('[data-tab-id="t1"]')! }));
      assert.equal(window.document.querySelector('[data-menu-action="open-beside"]'), null, 'no Open beside when only one tab exists');

      await act(async () => root.render(createElement(WorkspaceProvider, { key: 'three', initialTabs: threeTabs() }, createElement(Shell))));
      const t2 = window.document.querySelector('[data-tab-id="t2"]')!;
      await act(async () => fire(t2, 'onContextMenu', { clientX: 80, clientY: 10, target: t2 }));
      const beside = window.document.querySelector('[data-menu-action="open-beside"]');
      assert.ok(beside, 'Open beside appears when a second tab exists');
      await act(async () => fire(beside, 'onClick'));
      assert.equal(window.document.querySelector('[data-tab-panels]')?.getAttribute('data-tab-panels'), 'split');
      assert.deepEqual(visibleScreens(window).sort(), ['library', 'quran']);
    } finally { restore(); }
  });

  it('supports Ctrl+click, Shift+click, Esc, Ctrl+Shift+Arrow multi-select and full tab context menu actions', async () => {
    const { window, root, restore } = setup();
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, { initialTabs: threeTabs() }, createElement(Shell))));
      const selected = () => [...window.document.querySelectorAll('[data-tab-id][data-selected]')].map(el => el.getAttribute('data-tab-id'));
      assert.deepEqual(selected(), ['t1']);

      // Ctrl+click t3 adds it and focuses it.
      await act(async () => fire(window.document.querySelector('[data-tab-id="t3"]')!, 'onClick', { ctrlKey: true, shiftKey: false }));
      assert.deepEqual(selected(), ['t1', 't3']);

      // Esc clears selection back to focused tab (t3).
      await act(async () => fire(window.document.querySelector('[data-tab-id="t3"]')!, 'onKeyDown', { key: 'Escape' }));
      assert.deepEqual(selected(), ['t3']);

      // Shift+click t1 selects range t1..t3.
      await act(async () => fire(window.document.querySelector('[data-tab-id="t1"]')!, 'onClick', { ctrlKey: false, shiftKey: true }));
      assert.deepEqual(selected(), ['t1', 't2', 't3']);

      // Ctrl+click t2 removes t2, leaving t1 and t3 (2 tabs) -> "Open side by side" appears in menu.
      await act(async () => fire(window.document.querySelector('[data-tab-id="t2"]')!, 'onClick', { ctrlKey: true, shiftKey: false }));
      assert.deepEqual(selected(), ['t1', 't3']);
      const t3 = window.document.querySelector('[data-tab-id="t3"]')!;
      await act(async () => fire(t3, 'onContextMenu', { clientX: 80, clientY: 10, target: t3 }));
      assert.ok(window.document.querySelector('[data-menu-action="selection-count"]'));
      assert.ok(window.document.querySelector('[data-menu-action="open-side-by-side"]'));
      assert.ok(window.document.querySelector('[data-menu-action="copy-links"]'));
      assert.ok(window.document.querySelector('[data-menu-action="close-others"]'));
      assert.ok(window.document.querySelector('[data-menu-action="close"]'));
      await act(async () => fire(window.document.querySelector('[data-menu-action="open-side-by-side"]')!, 'onClick'));
      assert.equal(window.document.querySelector('[data-tab-panels]')?.getAttribute('data-tab-panels'), 'split');
    } finally { restore(); }
  });

  it('creates, collapses, expands, and ungroups tab groups from the tab bar UI', async () => {
    const { window, root, restore } = setup();
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, { initialTabs: threeTabs() }, createElement(Shell))));
      const t2 = window.document.querySelector('[data-tab-id="t2"]')!;
      await act(async () => fire(t2, 'onContextMenu', { clientX: 80, clientY: 10, target: t2 }));
      const addToGroup = window.document.querySelector('[data-menu-action="add-to-group"]')!;
      assert.ok(addToGroup);
      await act(async () => fire(addToGroup, 'onClick'));
      const newGroup = window.document.querySelector('[data-menu-action="new-group"]')!;
      assert.ok(newGroup);
      await act(async () => fire(newGroup, 'onClick'));
      assert.ok(window.document.querySelector('[data-group-dialog]'));
      await act(async () => fire(window.document.querySelector('[data-group-color-pick="green"]')!, 'onClick'));
      await act(async () => fire(window.document.querySelector('[data-group-dialog] form')!, 'onSubmit'));

      const chip = () => window.document.querySelector('[data-group-id]')!;
      assert.ok(chip(), 'group label chip rendered');
      assert.equal(chip().getAttribute('data-group-color'), 'green');

      // Collapse hides t2, expand brings t2 back.
      await act(async () => fire(chip(), 'onClick'));
      assert.equal(chip().hasAttribute('data-group-collapsed'), true);
      assert.equal(window.document.querySelector('[data-tab-id="t2"]'), null);
      await act(async () => fire(chip(), 'onClick'));
      assert.equal(chip().hasAttribute('data-group-collapsed'), false);
      assert.ok(window.document.querySelector('[data-tab-id="t2"]'));

      // Group label context menu: ungroup keeps t2 and removes the group chip.
      await act(async () => fire(chip(), 'onContextMenu', { clientX: 40, clientY: 10, target: chip() }));
      const ungroup = window.document.querySelector('[data-menu-action="group-ungroup"]')!;
      assert.ok(ungroup);
      await act(async () => fire(ungroup, 'onClick'));
      assert.equal(window.document.querySelector('[data-group-id]'), null);
      assert.ok(window.document.querySelector('[data-tab-id="t2"]'));
    } finally { restore(); }
  });

  it('saves and restores per-view snapshots on sleep/wake, keeps failed-save tabs awake, and exempts open dialogs', async () => {
    const { window, root, restore } = setup();
    try {
      let shouldFail = false;
      const savedLog: string[] = [];
      const SnapshotScreen: React.FC<{ view: WorkspaceView }> = ({ view }) => {
        const tab = useTab();
        const [draft, setDraft] = React.useState(`init-${tab.id}`);
        const [dialogOpen, setDialogOpen] = React.useState(false);
        const draftRef = React.useRef(draft);
        React.useEffect(() => { draftRef.current = draft; });
        React.useEffect(() => tab.registerSnapshot({
          saveState: async () => {
            if (shouldFail && tab.id === 't1') throw new Error('disk full');
            savedLog.push(`${tab.id}:${draftRef.current}`);
            return { version: 1, data: { draft: draftRef.current } };
          },
          restoreState: snap => {
            if (typeof snap.data.draft === 'string') setDraft(snap.data.draft);
          },
        }), [tab]);
        return createElement('div', { 'data-screen': view },
          createElement('span', { 'data-draft': draft }, draft),
          createElement('button', { 'data-edit-draft': '', onClick: () => setDraft('edited-t1') }),
          createElement('button', { 'data-open-dialog': '', onClick: () => setDialogOpen(true) }),
          dialogOpen ? createElement('div', { role: 'dialog', 'aria-modal': 'true' }, 'dialog') : null);
      };
      const snapRender = (view: WorkspaceView) => createElement(SnapshotScreen, { view });
      const SnapShell: React.FC = () => {
        useWorkspaceTabShortcuts();
        return createElement(React.Fragment, null,
          createElement(WorkspaceTabRow),
          createElement('main', null, createElement(WorkspaceTabPanels, { render: snapRender })));
      };

      await act(async () => root.render(createElement(WorkspaceProvider, { initialTabs: threeTabs() }, createElement(SnapShell))));
      // Edit t1's state, then open 6 more tabs so t1 sleeps and saves its snapshot.
      await act(async () => fire(window.document.querySelector('[data-tab-panel="t1"] [data-edit-draft]')!, 'onClick'));
      for (let n = 0; n < 6; n += 1) {
        press(window, { key: 't', code: 'KeyT', ctrlKey: true });
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
      }
      assert.equal(window.document.querySelector('[data-tab-panel="t1"]'), null, 't1 slept after saving');
      assert.ok(savedLog.includes('t1:edited-t1'), 't1 saved its snapshot before sleeping');

      // Wake t1: its restored snapshot brings back 'edited-t1'.
      await act(async () => fire(window.document.querySelector('[data-tab-id="t1"]')!, 'onClick'));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
      assert.equal(window.document.querySelector('[data-tab-panel="t1"] [data-draft]')?.textContent, 'edited-t1');

      // Now make t1's save fail and open another tab to push t1 out: t1 must stay awake.
      shouldFail = true;
      press(window, { key: 't', code: 'KeyT', ctrlKey: true });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
      assert.ok(window.document.querySelector('[data-tab-panel="t1"]'), 'failed save keeps t1 awake');

      // Open a dialog in the currently active tab, then open 6 more tabs: the dialog tab stays awake.
      const dialogTabId = window.document.querySelector('[data-tab-panel]:not([hidden])')!.getAttribute('data-tab-panel')!;
      await act(async () => fire(window.document.querySelector(`[data-tab-panel="${dialogTabId}"] [data-open-dialog]`)!, 'onClick'));
      await act(async () => { window.document.dispatchEvent(new window.Event('click', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 10)); });
      for (let n = 0; n < 6; n += 1) {
        press(window, { key: 't', code: 'KeyT', ctrlKey: true });
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
      }
      assert.ok(window.document.querySelector(`[data-tab-panel="${dialogTabId}"]`), 'tab with open dialog never sleeps');
    } finally { restore(); }
  });

  it('passes periodic vs sleep reason, restores snapshot once per wake without re-running on updates, and skips no-op dispatches', async () => {
    const { window, root, restore } = setup();
    try {
      const reasons: string[] = [];
      let restoreCount = 0;
      let effectRuns = 0;
      let tabsApi: ReturnType<typeof useTabs> | null = null;

      const WatcherScreen: React.FC<{ view: WorkspaceView }> = () => {
        const tab = useTab();
        const registerSnapshot = tab.registerSnapshot;
        React.useEffect(() => {
          effectRuns += 1;
          return registerSnapshot({
            saveState: async reason => {
              reasons.push(reason || 'none');
              return { version: 1, data: { value: 'same' } };
            },
            restoreState: () => {
              restoreCount += 1;
            },
          });
        }, [registerSnapshot]);
        return createElement('div', { 'data-screen': 'watcher' });
      };

      const ProbeShell: React.FC = () => {
        tabsApi = useTabs();
        return createElement(React.Fragment, null,
          createElement(WorkspaceTabRow),
          createElement('main', null, createElement(WorkspaceTabPanels, { render: view => createElement(WatcherScreen, { view }) })));
      };

      const initial = {
        ...threeTabs(),
        tabs: [
          {
            ...threeTabs().tabs[0],
            history: [{ view: 'library' as const, title: 'T1', snapshot: { version: 1, data: { value: 'initial' } } }],
          },
          ...threeTabs().tabs.slice(1),
        ],
      };

      await act(async () => root.render(createElement(WorkspaceProvider, { initialTabs: initial }, createElement(ProbeShell))));
      assert.equal(restoreCount, 1, 'restoreState ran once on mount');
      assert.equal(effectRuns, 1, 'view effect ran once');

      // 1. Call saveTabSnapshot with default / 'periodic'
      await act(async () => {
        await tabsApi!.saveTabSnapshot('t1');
      });
      assert.deepEqual(reasons, ['periodic'], 'periodic reason passed by default');
      assert.equal(restoreCount, 1, 'restoreState does not run again after periodic save');
      assert.equal(effectRuns, 1, 'view effect did not re-run after periodic save');

      // 2. Call saveTabSnapshot with 'sleep'
      await act(async () => {
        await tabsApi!.saveTabSnapshot('t1', 'sleep');
      });
      assert.deepEqual(reasons, ['periodic', 'sleep'], 'sleep reason passed when requested');

      // 3. Skip update dispatch when snapshot and scroll match the current entry
      const stateBeforeNoOp = tabsApi!.state;
      await act(async () => {
        await tabsApi!.saveTabSnapshot('t1', 'periodic');
      });
      assert.strictEqual(tabsApi!.state, stateBeforeNoOp, 'tabs state reference is unchanged when snapshot is identical');
      assert.equal(restoreCount, 1, 'restoreState still did not re-run');
      assert.equal(effectRuns, 1, 'view effect still did not re-run');
    } finally { restore(); }
  });

  it('KEY-427: "Move to new window" sends the tab history over IPC and closes the tab only after main confirms', async () => {
    const { window, root, restore } = setup();
    const sent: { history: { view: string; target?: string }[]; index: number }[] = [];
    let reply: { ok: boolean } = { ok: true };
    const win = window as unknown as { electronAPI?: unknown };
    try {
      win.electronAPI = { workspaceWindow: { isSecondary: false, moveTab: async (payload: never) => { sent.push(payload); return reply; }, ready: async () => ({ primary: true }) } };
      const initial: TabsState = {
        tabs: [
          newTab('t1', { view: 'library', title: '' }, 1),
          { ...newTab('t2', { view: 'library', title: 'Book' }, 2), history: [{ view: 'library', title: '' }, { view: 'reader', target: 'book:abc#p=3', title: 'Book', scroll: 40 }], index: 1 },
        ],
        activeId: 't1',
      };
      await act(async () => root.render(createElement(WorkspaceProvider, { initialTabs: initial }, createElement(Shell))));
      const openMenu = async (id: string) => {
        const tab = window.document.querySelector(`[data-tab-id="${id}"]`)!;
        await act(async () => fire(tab, 'onContextMenu', { clientX: 80, clientY: 10, target: tab }));
        return window.document.querySelector('[data-menu-action="move-to-new-window"]');
      };

      // A refused move keeps the tab.
      reply = { ok: false };
      let item = await openMenu('t2');
      assert.ok(item, 'the menu offers Move to new window');
      await act(async () => { fire(item!, 'onClick'); await new Promise(resolve => setTimeout(resolve, 5)); });
      assert.equal(sent.length, 1);
      assert.deepEqual(tabIds(window), ['t1', 't2'], 'a refused move keeps the tab');

      // A confirmed move sends only the history entries and closes the tab here.
      reply = { ok: true };
      item = await openMenu('t2');
      await act(async () => { fire(item!, 'onClick'); await new Promise(resolve => setTimeout(resolve, 5)); });
      assert.equal(sent.length, 2);
      assert.deepEqual(Object.keys(sent[1]).sort(), ['history', 'index', 'version']);
      assert.equal(sent[1].index, 1);
      assert.equal(sent[1].history[1].target, 'book:abc#p=3');
      assert.deepEqual(tabIds(window), ['t1'], 'the tab left this window');

      // A torn-off window does not offer the item: its tabs are not saved or restored.
      win.electronAPI = { workspaceWindow: { isSecondary: true, moveTab: async () => reply, ready: async () => ({ primary: false }) } };
      await act(async () => root.render(createElement(WorkspaceProvider, { key: 'second', initialTabs: initial }, createElement(Shell))));
      assert.equal(await openMenu('t2'), null, 'no item in a secondary window');
    } finally { restore(); }
  });
});
