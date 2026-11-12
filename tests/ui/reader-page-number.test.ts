import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { ReaderHeader } from '../../src/renderer/components/reader/ReaderHeader';
import { ZenBottomScrubber } from '../../src/renderer/components/reader/ZenBottomScrubber';
import { formatReaderNumber, parseReaderPage } from '../../src/renderer/components/reader/reader-chrome-state';
import { translations } from '../../src/renderer/translations';
import { WorkspaceProvider } from '../../src/renderer/components/context/WorkspaceContext';

test('reader page numbers retain one-based identity and parse all supported digit sets', () => {
  assert.equal(formatReaderNumber(5, 'ar'), '٥');
  assert.equal(formatReaderNumber(5, 'en'), '5');
  assert.equal(formatReaderNumber(1200, 'ar'), '١٢٠٠');
  for (const value of ['5', '٥', '۵']) assert.equal(parseReaderPage(value, 100), 5);
  assert.equal(parseReaderPage('١', 100), 1);
  assert.equal(parseReaderPage('٩٩٩', 100), 100);
  for (const value of ['', '0', '٠', '-1', '1.5', '1e2', 'abc']) assert.equal(parseReaderPage(value, 100), undefined);
});

test('header and legacy scrubber show the same page and accept localized page submission in ar/en', async () => {
  const { window } = parseHTML('<html><body><div role="region"><div id="root"></div></div></body></html>');
  const replacements = { window, document: window.document, HTMLElement: window.HTMLElement, Node: window.Node, IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class { observe() {} disconnect() {} } };
  const previous = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const root = createRoot(window.document.getElementById('root')!);
  Object.defineProperty(window, 'electronAPI', { value: { getAllBooks: async () => [], getAllNotes: async () => [], getCategoryTree: async () => [] } });
  const noop = () => {};
  const props = (element: Element) => (element as unknown as Record<string, Record<string, (event: unknown) => void>>)[Object.keys(element).find(key => key.startsWith('__reactProps$'))!];
  try {
    for (const language of ['ar', 'en'] as const) {
      const pages: number[] = [];
      const t = (key: keyof typeof translations.en) => translations[language][key];
      const render = (page: number) => root.render(createElement(WorkspaceProvider, { key: language }, createElement(React.Fragment, null,
        createElement(ReaderHeader, { title: 'عِلْم Knowledge', format: 'PDF', dir: language === 'ar' ? 'rtl' : 'ltr', page, total: 20, onPage: next => pages.push(next),
          viewMode: 'single', onViewMode: noop, onClose: noop, onPanel: noop, onSearch: noop, onTools: noop, t }),
        createElement(ZenBottomScrubber, { isVisible: true, readingPage: page, maxBookPages: 20, language, readerDirection: 'ltr', onPageChange: noop,
          previousPage: null, onReturnToPrevious: noop, onMouseEnter: noop, onMouseLeave: noop, t }))));
      for (const page of [1, 5, 20]) {
        await act(async () => render(page));
        const header = window.document.querySelector<HTMLInputElement>('[data-reader-go-to]')!;
        const slider = window.document.querySelector('input[type=range]')!;
        assert.equal(header.value, formatReaderNumber(page, language));
        assert.equal(slider.getAttribute('title'), header.value);
        assert.equal(slider.getAttribute('aria-valuetext'), header.value);
      }
      const header = window.document.querySelector<HTMLInputElement>('[data-reader-go-to]')!;
      header.value = language === 'ar' ? '٥' : '5';
      await act(async () => props(header.closest('form')!).onSubmit({ preventDefault: noop, currentTarget: header.closest('form') }));
      assert.equal(pages.at(-1), 5);
      await act(async () => props(header).onKeyDown({ key: 'ArrowDown', preventDefault: noop }));
      assert.equal(header.value, formatReaderNumber(19, language));
    }
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
