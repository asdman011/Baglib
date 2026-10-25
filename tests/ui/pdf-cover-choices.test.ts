import { it } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { PdfCoverChoices } from '../../src/renderer/components/library/PdfCoverChoices';
import { renderPdfCoverChoices, renderPdfPage } from '../../src/renderer/utils/pdf-page-renderer';
import { translations } from '../../src/renderer/translations';

for (const language of ['ar', 'en'] as const) {
  it(`selects actual page thumbnails through IPC without consulting unconfigured PDF.js globals in ${language}`, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
    Object.defineProperty(globalThis, 'document', { value: window.document, configurable: true });
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true, writable: true });
    Object.defineProperty(window, 'PDFJS', { configurable: true, value: { getDocument: () => { throw new Error('Unconfigured client engine must not be used'); } } });
    const pages = [1, 2, 3, 4, 5].map(currentPage => ({ coverUrl: `D:/covers/page-${currentPage}.jpg`, currentPage, totalPages: 5 }));
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      extractPdfCoverPages: async () => ({ success: true, pages }),
      extractPdfCover: async (_file: string, page: number) => ({ success: true, ...pages[page - 1] }),
    } });
    const root = createRoot(window.document.getElementById('root')!);
    try {
      const choices = await renderPdfCoverChoices('D:/كتاب.pdf');
      assert.equal(choices.length, 5);
      assert.equal((await renderPdfPage('D:/كتاب.pdf', 2)).currentPage, 2);
      function Harness() {
        const [selected, setSelected] = useState(1);
        return createElement('div', { dir: language === 'ar' ? 'rtl' : 'ltr' }, createElement(PdfCoverChoices, { pages: choices, selected, onSelect: page => setSelected(page.currentPage), t: (key, params) => {
          let text: string = translations[language][key];
          for (const [name, value] of Object.entries(params || {})) text = text.replace(`{${name}}`, String(value));
          return text;
        } }));
      }
      await act(async () => root.render(createElement(Harness)));
      const buttons = window.document.querySelectorAll('button');
      assert.equal(buttons.length, 5);
      assert.equal(buttons[0].getAttribute('aria-pressed'), 'true');
      await act(async () => buttons[2].click());
      assert.equal(buttons[2].getAttribute('aria-pressed'), 'true');
      assert.equal(buttons[0].getAttribute('aria-pressed'), 'false');
      assert.equal(window.document.querySelector('img')?.getAttribute('src'), 'baglib-asset://D:/covers/page-1.jpg');
      assert.equal(window.document.querySelector('[role="group"]')?.getAttribute('aria-label'), translations[language].pdfCoverChoosePage);
    } finally {
      await act(async () => root.unmount());
      if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow); else Reflect.deleteProperty(globalThis, 'window');
      if (savedDocument) Object.defineProperty(globalThis, 'document', savedDocument); else Reflect.deleteProperty(globalThis, 'document');
    }
  });
}
