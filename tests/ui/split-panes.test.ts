import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { SplitPanes, type PaneId } from '../../src/renderer/components/layout/SplitPanes';
import { DEFAULT_SPLIT_RATIO, MIN_PANE_RATIO, clampRatio, edgeZone, ratioFromKey, ratioFromPointer } from '../../src/renderer/components/layout/split-model';
import { translations, type TranslationKey } from '../../src/renderer/translations';

function setup() {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  const globals: Record<string, unknown> = {
    window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
    React, IS_REACT_ACT_ENVIRONMENT: true,
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
  fn({ preventDefault: () => {}, stopPropagation: () => {}, currentTarget: element, pointerId: 1, button: 0, clientX: 0, shiftKey: false, ...event });
}

const tr = (lang: 'ar' | 'en') => (key: TranslationKey) => translations[lang][key];

describe('split model', () => {
  it('keeps each pane at least a fifth of the width', () => {
    assert.equal(clampRatio(0.05), MIN_PANE_RATIO);
    assert.equal(clampRatio(0.95), 1 - MIN_PANE_RATIO);
    assert.equal(clampRatio(Number.NaN), DEFAULT_SPLIT_RATIO);
  });

  it('reads the divider position from the pointer, mirrored in Arabic', () => {
    const box = { left: 100, width: 1000 };
    assert.equal(ratioFromPointer(400, box, 'ltr'), 0.3);
    assert.equal(ratioFromPointer(400, box, 'rtl'), 0.7);
    assert.equal(ratioFromPointer(1090, box, 'ltr'), 1 - MIN_PANE_RATIO);
  });

  it('moves the divider the way the arrow points in both languages', () => {
    assert.equal(ratioFromKey(0.5, 'ArrowRight', 'ltr'), 0.52);
    assert.equal(ratioFromKey(0.5, 'ArrowRight', 'rtl'), 0.48, 'right shrinks the first (right-hand) pane in Arabic');
    assert.equal(ratioFromKey(0.5, 'ArrowLeft', 'ltr', true), 0.42);
    assert.equal(ratioFromKey(0.5, 'Home', 'rtl'), MIN_PANE_RATIO);
    assert.equal(ratioFromKey(0.5, 'End', 'ltr'), 1 - MIN_PANE_RATIO);
    assert.equal(ratioFromKey(0.5, 'Enter', 'ltr'), null);
  });

  it('finds the side edges for a dragged tab; the second pane\'s side is "end"', () => {
    const box = { left: 0, width: 1200 };
    assert.equal(edgeZone(1150, box, 'ltr'), 'end');
    assert.equal(edgeZone(30, box, 'ltr'), 'start');
    assert.equal(edgeZone(30, box, 'rtl'), 'end', 'in Arabic the second pane is on the left');
    assert.equal(edgeZone(600, box, 'ltr'), null);
    assert.equal(edgeZone(1300, box, 'ltr'), null);
    assert.equal(edgeZone(70, { left: 0, width: 200 }, 'ltr'), null, 'a narrow box shrinks the zone');
  });
});

for (const lang of ['ar', 'en'] as const) {
  describe(`SplitPanes (${lang})`, () => {
    function Harness({ log }: { log: string[] }) {
      const [focused, setFocused] = React.useState<PaneId>('first');
      const [split, setSplit] = React.useState(true);
      return createElement(SplitPanes, {
        dir: lang === 'ar' ? 'rtl' : 'ltr', t: tr(lang), focusedPane: focused,
        onFocusPane: pane => { log.push(`focus:${pane}`); setFocused(pane); },
        onCloseSplit: () => { log.push('close'); setSplit(false); },
        onRatioChange: ratio => log.push(`ratio:${ratio.toFixed(2)}`),
        first: createElement('div', { 'data-screen': 'reader' }, 'صحيح البخاري'),
        second: split ? createElement('div', { 'data-screen': 'manuscript' }, 'Manuscript') : undefined,
      });
    }

    it('shows two panes in reading order with a labelled divider; the focused pane is marked', async () => {
      const { window, root, restore } = setup();
      try {
        await act(async () => root.render(createElement(Harness, { log: [] })));
        const box = window.document.querySelector('[data-split-panes="two"]')!;
        assert.equal(box.getAttribute('dir'), lang === 'ar' ? 'rtl' : 'ltr');
        const panes = [...box.querySelectorAll('[data-split-pane]')].map(pane => pane.getAttribute('data-split-pane'));
        assert.deepEqual(panes, ['first', 'second']);
        const divider = window.document.querySelector('[role="separator"]')!;
        assert.equal(divider.getAttribute('aria-label'), translations[lang].workspaceSplitDivider);
        assert.equal(divider.getAttribute('aria-valuenow'), '50');
        assert.ok(window.document.querySelector('[data-split-pane="first"]')!.hasAttribute('data-focused'));
      } finally { restore(); }
    });

    it('clicking into the other pane focuses it; keys and a double-click move the divider', async () => {
      const { window, root, restore } = setup();
      const log: string[] = [];
      try {
        await act(async () => root.render(createElement(Harness, { log })));
        await act(async () => fire(window.document.querySelector('[data-split-pane="second"]')!, 'onPointerDownCapture'));
        assert.ok(window.document.querySelector('[data-split-pane="second"]')!.hasAttribute('data-focused'));
        const divider = window.document.querySelector('[data-split-divider]')!;
        await act(async () => fire(divider, 'onKeyDown', { key: 'ArrowRight' }));
        assert.equal(divider.getAttribute('aria-valuenow'), lang === 'ar' ? '48' : '52');
        await act(async () => fire(divider, 'onDoubleClick'));
        assert.equal(divider.getAttribute('aria-valuenow'), '50');
        assert.deepEqual(log, ['focus:second', `ratio:${lang === 'ar' ? '0.48' : '0.52'}`, 'ratio:0.50']);
      } finally { restore(); }
    });

    it('dragging the divider resizes, mirrored in Arabic', async () => {
      const { window, root, restore } = setup();
      try {
        await act(async () => root.render(createElement(Harness, { log: [] })));
        const box = window.document.querySelector('[data-split-panes="two"]') as unknown as { getBoundingClientRect: () => unknown };
        box.getBoundingClientRect = () => ({ left: 0, width: 1000 });
        const divider = window.document.querySelector('[data-split-divider]')!;
        await act(async () => fire(divider, 'onPointerDown'));
        await act(async () => fire(window.document.querySelector('[data-split-divider]')!, 'onPointerMove', { clientX: 300 }));
        await act(async () => fire(window.document.querySelector('[data-split-divider]')!, 'onPointerUp'));
        assert.equal(window.document.querySelector('[data-split-divider]')!.getAttribute('aria-valuenow'), lang === 'ar' ? '70' : '30');
      } finally { restore(); }
    });

    it('the × on the second pane ends side by side', async () => {
      const { window, root, restore } = setup();
      const log: string[] = [];
      try {
        await act(async () => root.render(createElement(Harness, { log })));
        const close = window.document.querySelector('[data-split-close]')!;
        assert.equal(close.getAttribute('aria-label'), translations[lang].workspaceSplitClose);
        await act(async () => fire(close, 'onClick'));
        assert.ok(window.document.querySelector('[data-split-panes="single"]'));
        assert.equal(window.document.querySelector('[data-screen="manuscript"]'), null);
        assert.ok(log.includes('close'));
      } finally { restore(); }
    });
  });
}
