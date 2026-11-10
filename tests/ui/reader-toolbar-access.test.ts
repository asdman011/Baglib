import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { ZenTopBar } from '../../src/renderer/components/reader/ZenTopBar';
import { ReaderMarkupBar } from '../../src/renderer/components/reader/ReaderMarkupBar';
import { translations } from '../../src/renderer/translations';

test('reader toolbar reveals on focus, retains descendant focus, toggles for touch and exposes markup shortcut in both languages', async () => {
  const { window } = parseHTML('<html><body><div role="region"><div id="root"></div></div></body></html>');
  const replacements = { window, document: window.document, HTMLElement: window.HTMLElement, Node: window.Node, IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class { observe() {} disconnect() {} } };
  const previous = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const focusState: { current: HTMLElement | null } = { current: null };
  Object.defineProperty(window.document, 'activeElement', { configurable: true, get: () => focusState.current });
  window.HTMLElement.prototype.focus = function () {
    focusState.current = this;
    this.dispatchEvent(new window.Event('focusin', { bubbles: true }));
  };
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ bottom: 200 }) as DOMRect;
  const root = createRoot(window.document.getElementById('root')!);
  const noop = () => {};
  try {
    for (const language of ['ar', 'en'] as const) {
      const t = (key: keyof typeof translations.en) => translations[language][key];
      await act(async () => root.render(createElement(ZenTopBar, {
        key: language, isVisible: false, activeBook: { id: 'test', title: 'عِلْم Knowledge' }, detectedFormat: 'EPUB', readerDirection: language === 'ar' ? 'rtl' : 'ltr',
        setReaderDirection: noop, viewMode: 'single', setViewMode: noop, viewType: 'text_manuscript', setViewType: noop,
        pdfFitMode: 'Fit', setPdfFitMode: noop, autoCropMargins: false, setAutoCropMargins: noop,
        onClose: noop, onToggleToc: noop, isTocOpen: false, onToggleSearch: noop, onToggleAIDrawer: noop, onToggleDictionary: noop,
        onToggleSettings: noop, isSettingsOpen: false, onTogglePlugins: noop, onMouseEnter: noop, onMouseLeave: noop,
        markupBar: createElement(ReaderMarkupBar, { color: 'amber', onColor: noop, locked: false, onToggleLock: noop, onShowShortcuts: noop, onTool: noop, t }), t,
      } as React.ComponentProps<typeof ZenTopBar>)));
      const header = window.document.querySelector('header')!;
      const toggle = window.document.querySelector('[data-reader-toolbar-toggle]')!;
      assert.ok(toggle, 'persistent labelled toggle exists');
      assert.equal(toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(header.style.opacity, '0');
      const first = header.querySelector('button')!;
      await act(async () => first.focus());
      assert.equal(header.style.opacity, '1', 'Tab into hidden header reveals it');
      const second = header.querySelectorAll('button')[1];
      await act(async () => {
        const event = new window.Event('focusout', { bubbles: true });
        Object.assign(event, { relatedTarget: second });
        first.dispatchEvent(event);
        second.focus();
      });
      assert.equal(header.style.opacity, '1', 'focus within header holds it open');
      await act(async () => {
        const event = new window.Event('focusout', { bubbles: true });
        Object.assign(event, { relatedTarget: toggle });
        second.dispatchEvent(event);
      });
      assert.equal(header.style.opacity, '0');
      await act(async () => toggle.dispatchEvent(new window.Event('click', { bubbles: true })));
      assert.equal(header.style.opacity, '1', 'tap/click pins toolbar');
      assert.equal(toggle.getAttribute('aria-expanded'), 'true');
      await act(async () => toggle.dispatchEvent(new window.Event('click', { bubbles: true })));
      assert.equal(header.style.opacity, '0');
      await act(async () => {
        const event = new window.Event('keydown', { bubbles: true, cancelable: true });
        Object.assign(event, { key: 'م', code: 'KeyM', altKey: true });
        window.dispatchEvent(event);
      });
      assert.equal(focusState.current?.getAttribute('data-markup-tool-button'), 'select');
      assert.equal(header.style.opacity, '1', 'Alt+M focuses and reveals markup');
    }
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
