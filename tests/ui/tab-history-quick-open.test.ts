import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { TabHistoryStrip } from '../../src/renderer/components/layout/TabHistoryStrip';
import { QuickOpenPanel } from '../../src/renderer/components/layout/QuickOpenPanel';
import { TabBar } from '../../src/renderer/components/layout/TabBar';
import { historyShortcut, mouseHistoryButton, HISTORY_HOLD_MS } from '../../src/renderer/components/layout/tab-bar-model';
import { translations, type TranslationKey } from '../../src/renderer/translations';
import { EMPTY_TABS, activeTab, rankDestinations, tabsReducer, type RecentItem, type TabLocation, type TabsState } from '../../src/shared/workspace-tabs';

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

function fire(element: Element, handler: string, event: Record<string, unknown> = {}) {
  const props = Object.keys(element).find(name => name.startsWith('__reactProps'))!;
  const fn = (element as unknown as Record<string, Record<string, (event: unknown) => void>>)[props][handler];
  assert.ok(fn, `${handler} exists`);
  fn({ preventDefault: () => {}, stopPropagation: () => {}, currentTarget: element, pointerId: 1, button: 0, clientX: 0, ...event });
}

const wait = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
const tr = (lang: 'ar' | 'en') => (key: TranslationKey, params?: Record<string, string | number>) =>
  Object.entries(params ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), translations[lang][key]);

/** One tab that went Library → Quran (Al-Baqarah) → Sunnah (Bukhari 1) → Notes, then back once. */
function travelled(): TabsState {
  let state = tabsReducer(EMPTY_TABS, { type: 'open', id: 't1', location: { view: 'library', title: '' }, now: 1 });
  const steps: TabLocation[] = [
    { view: 'quran', target: 'quran:2:255', title: 'البقرة ٢٥٥' },
    { view: 'sunnah', target: 'sunnah:Bukhari:1:1', title: 'Bukhari 1' },
    { view: 'notes', title: '' },
  ];
  for (const [n, location] of steps.entries()) state = tabsReducer(state, { type: 'navigate', id: 't1', location, now: 2 + n });
  return tabsReducer(state, { type: 'back', id: 't1', now: 10 });
}

function StripHarness({ lang, initial }: { lang: 'ar' | 'en'; initial: TabsState }) {
  const [state, dispatch] = React.useReducer(tabsReducer, initial);
  return createElement(TabHistoryStrip, {
    tab: activeTab(state), dir: lang === 'ar' ? 'rtl' : 'ltr', t: tr(lang),
    onGo: index => dispatch({ type: 'go', id: state.activeId!, index, now: 20 }),
  });
}

describe('historyShortcut and mouseHistoryButton', () => {
  const key = (k: string, mods: Partial<{ alt: boolean; ctrl: boolean; shift: boolean }> = {}) =>
    ({ key: k, code: k, altKey: !!mods.alt, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, metaKey: false });

  it('reads Alt+Left/Right by what the user sees, mirrored in Arabic', () => {
    assert.equal(historyShortcut(key('ArrowLeft', { alt: true }), 'ltr'), 'back');
    assert.equal(historyShortcut(key('ArrowRight', { alt: true }), 'ltr'), 'forward');
    assert.equal(historyShortcut(key('ArrowRight', { alt: true }), 'rtl'), 'back');
    assert.equal(historyShortcut(key('ArrowLeft', { alt: true }), 'rtl'), 'forward');
    assert.equal(historyShortcut(key('BrowserBack'), 'rtl'), 'back');
    assert.equal(historyShortcut(key('BrowserForward'), 'ltr'), 'forward');
  });

  it('ignores plain arrows and other modifier combinations', () => {
    assert.equal(historyShortcut(key('ArrowLeft'), 'ltr'), null);
    assert.equal(historyShortcut(key('ArrowLeft', { alt: true, shift: true }), 'ltr'), null);
    assert.equal(historyShortcut(key('ArrowLeft', { alt: true, ctrl: true }), 'ltr'), null);
    assert.equal(historyShortcut(key('KeyA', { alt: true }), 'ltr'), null);
  });

  it('maps the mouse back and forward buttons', () => {
    assert.equal(mouseHistoryButton(3), 'back');
    assert.equal(mouseHistoryButton(4), 'forward');
    assert.equal(mouseHistoryButton(0), null);
    assert.equal(mouseHistoryButton(1), null);
  });
});

for (const lang of ['ar', 'en'] as const) {
  describe(`TabHistoryStrip (${lang})`, () => {
    it('steps back and forward, disabling an arrow at the end of the history', async () => {
      const { window, root, restore } = setup();
      try {
        await act(async () => root.render(createElement(StripHarness, { lang, initial: travelled() })));
        const back = () => window.document.querySelector('[data-history="back"]') as HTMLButtonElement;
        const forward = () => window.document.querySelector('[data-history="forward"]') as HTMLButtonElement;
        assert.equal(back().getAttribute('aria-label'), translations[lang].workspaceTabBack);
        assert.equal(forward().hasAttribute('disabled'), false);
        await act(async () => fire(forward(), 'onClick'));
        assert.equal(forward().hasAttribute('disabled'), true, 'at the newest entry');
        for (let n = 0; n < 3; n += 1) await act(async () => fire(back(), 'onClick'));
        assert.equal(back().hasAttribute('disabled'), true, 'at the oldest entry');
      } finally { restore(); }
    });

    it('mirrors the arrows: back points left in English and right in Arabic', async () => {
      const { window, root, restore } = setup();
      try {
        await act(async () => root.render(createElement(StripHarness, { lang, initial: travelled() })));
        const strip = window.document.querySelector('[data-tab-history-strip]')!;
        assert.equal(strip.getAttribute('dir'), lang === 'ar' ? 'rtl' : 'ltr');
        const backIcon = window.document.querySelector('[data-history="back"] svg')!.getAttribute('class') ?? '';
        assert.ok(backIcon.includes(lang === 'ar' ? 'arrow-right' : 'arrow-left'), backIcon);
      } finally { restore(); }
    });

    it('right-click lists the back history nearest first; picking an entry jumps there', async () => {
      const { window, root, restore } = setup();
      try {
        await act(async () => root.render(createElement(StripHarness, { lang, initial: travelled() })));
        await act(async () => fire(window.document.querySelector('[data-history="back"]')!, 'onContextMenu'));
        const menu = window.document.querySelector('[data-history-list]')!;
        assert.equal(menu.getAttribute('aria-label'), translations[lang].workspaceTabBackList);
        const items = [...menu.querySelectorAll('[role="menuitem"]')];
        assert.deepEqual(items.map(item => item.textContent), ['البقرة ٢٥٥', translations[lang].navLibrary]);
        await act(async () => fire(items[1], 'onClick'));
        assert.equal(window.document.querySelector('[data-history-list]'), null, 'the list closes');
        assert.equal(window.document.querySelector('[data-history="back"]')!.hasAttribute('disabled'), true, 'jumped to the first entry');
      } finally { restore(); }
    });

    it('pressing and holding an arrow opens the list without also stepping', async () => {
      const { window, root, restore } = setup();
      try {
        await act(async () => root.render(createElement(StripHarness, { lang, initial: travelled() })));
        const forward = window.document.querySelector('[data-history="forward"]')!;
        await act(async () => fire(forward, 'onPointerDown'));
        await wait(HISTORY_HOLD_MS + 50);
        const menu = window.document.querySelector('[data-history-list]')!;
        assert.equal(menu.getAttribute('aria-label'), translations[lang].workspaceTabForwardList);
        assert.equal(menu.querySelectorAll('[role="menuitem"]').length, 1);
        await act(async () => fire(forward, 'onPointerUp'));
        await act(async () => fire(forward, 'onClick'));
        assert.ok(window.document.querySelector('[data-history-list]'), 'the click that ends a hold does not step');
        assert.equal(window.document.querySelector('[data-history="forward"]')!.hasAttribute('disabled'), false);
      } finally { restore(); }
    });
  });

  describe(`QuickOpenPanel (${lang})`, () => {
    const recent: RecentItem[] = [
      { view: 'reader', target: 'book:42', title: 'صحيح البخاري', openedAt: 5 },
      { view: 'quran', target: 'quran:2:255', title: 'Al-Baqarah 255', openedAt: 4 },
      ...Array.from({ length: 9 }, (_, n) => ({ view: 'notes' as const, target: `note:n${n}`, title: `Note ${n}`, openedAt: 3 - n })),
    ];

    it('shows Library, Quran and Sunnah until enough use is recorded, then up to 8 recent items', async () => {
      const { window, root, restore } = setup();
      const opened: TabLocation[] = [];
      let closed = 0;
      try {
        await act(async () => root.render(createElement(QuickOpenPanel, {
          destinations: rankDestinations({}, 0), recent, t: tr(lang), onOpen: location => opened.push(location), onClose: () => { closed += 1; },
        })));
        const panel = window.document.querySelector('[data-quick-open]')!;
        assert.equal(panel.getAttribute('aria-label'), translations[lang].workspaceQuickOpenLabel);
        assert.ok(panel.textContent!.includes(translations[lang].workspaceQuickOpenMostUsed));
        const views = [...panel.querySelectorAll('[data-quick-open-item="destination"]')].map(item => item.getAttribute('data-quick-open-view'));
        assert.deepEqual(views, ['library', 'quran', 'sunnah']);
        const recents = [...panel.querySelectorAll('[data-quick-open-item="recent"]')];
        assert.equal(recents.length, 8);
        assert.equal(recents[0].textContent, 'صحيح البخاري');
        await act(async () => fire(recents[1], 'onClick'));
        assert.deepEqual(opened, [{ view: 'quran', target: 'quran:2:255', title: 'Al-Baqarah 255' }]);
        assert.equal(closed, 1);
      } finally { restore(); }
    });

    it('says when nothing has been opened yet, and Escape closes', async () => {
      const { window, root, restore } = setup();
      let closed = 0;
      try {
        await act(async () => root.render(createElement(QuickOpenPanel, {
          destinations: ['library'], recent: [], t: tr(lang), onOpen: () => {}, onClose: () => { closed += 1; },
        })));
        assert.equal(window.document.querySelector('[data-quick-open-empty]')!.textContent, translations[lang].workspaceQuickOpenNoRecent);
        await act(async () => fire(window.document.querySelector('[data-quick-open]')!, 'onKeyDown', { key: 'Escape' }));
        assert.equal(closed, 1);
      } finally { restore(); }
    });

    it('opens from the + button on hover or ↓, and a click on + still opens a new tab', async () => {
      const { window, root, restore } = setup();
      const log: string[] = [];
      try {
        const state = tabsReducer(EMPTY_TABS, { type: 'open', id: 't1', location: { view: 'library', title: '' }, now: 1 });
        await act(async () => root.render(createElement(TabBar, {
          tabs: state.tabs, activeId: state.activeId, dir: lang === 'ar' ? 'rtl' : 'ltr', t: tr(lang),
          onActivate: () => {}, onClose: () => {}, onMove: () => {}, onNew: () => log.push('new'),
          renderQuickOpen: ({ close, autoFocus }) => createElement('div', { 'data-panel': autoFocus ? 'keyboard' : 'hover' },
            createElement('button', { 'data-panel-close': '', onClick: close })),
        })));
        const plus = window.document.querySelector('[data-tab-new]')!;
        const anchor = window.document.querySelector('[data-quick-open-anchor]')!;
        assert.equal(plus.getAttribute('aria-expanded'), 'false');
        await act(async () => fire(anchor, 'onMouseEnter'));
        await wait(300);
        assert.equal(window.document.querySelector('[data-panel]')!.getAttribute('data-panel'), 'hover');
        await act(async () => fire(anchor, 'onMouseLeave'));
        await wait(250);
        assert.equal(window.document.querySelector('[data-panel]'), null, 'leaving closes the hover panel');
        await act(async () => fire(plus, 'onKeyDown', { key: 'ArrowDown' }));
        assert.equal(window.document.querySelector('[data-panel]')!.getAttribute('data-panel'), 'keyboard');
        await act(async () => fire(plus, 'onClick'));
        assert.equal(window.document.querySelector('[data-panel]'), null);
        assert.deepEqual(log, ['new']);
      } finally { restore(); }
    });
  });
}
