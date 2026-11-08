import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { PdfCompareDialog } from '../../src/renderer/components/reader/PdfCompareDialog';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';

for (const language of ['ar', 'en'] as const) {
  test(`PDF comparison rejects stale editions/options and scopes shortcuts in ${language}`, async () => {
    const { window } = parseHTML('<html><body><button id="outside">Outside</button><div id="root"></div></body></html>');
    const previous = new Map(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries({ window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const oldAPI = Object.getOwnPropertyDescriptor(window, 'electronAPI');
    const oldScroll = window.HTMLElement.prototype.scrollIntoView;
    window.HTMLElement.prototype.scrollIntoView = () => {};
    const pending: { work: string; other: string; resolve: (response: unknown) => void }[] = [];
    const response = { ok: true, data: { hunks: [1, 2].map(page => ({ aPage: page, bPage: page, removed: 'old', added: 'NEW', before: '', after: '' })), removedWords: 2, addedWords: 2, tooDifferent: false, aWords: 10, bWords: 10, limited: false } };
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      getAllBooks: async () => ['a', 'b', 'c'].map(id => ({ id, title: `Edition ${id}`, filePath: `D:/fixture/${id}.pdf`, categories: [] })), getAllNotes: async () => [], getCategoryTree: async () => [],
      pdfCompare: { run: (work: string, other: string) => new Promise(resolve => pending.push({ work, other, resolve })) },
    } });
    let workspace!: ReturnType<typeof useWorkspace>;
    let workId = 'a';
    function Harness() { workspace = useWorkspace(); return createElement(PdfCompareDialog, { workId, onClose: () => {}, onJump: () => {} }); }
    const root = createRoot(window.document.getElementById('root')!);
    const props = (element: Element) => (element as unknown as Record<string, { onChange: (event: unknown) => void; onClick: () => void }>)[Object.keys(element).find(key => key.startsWith('__reactProps$'))!];
    const choose = async (value: string) => act(async () => props(window.document.querySelector('[data-compare-other]')!).onChange({ target: { value } }));
    const run = async () => act(async () => window.document.querySelector<HTMLButtonElement>('[data-compare-run]')!.click());
    const key = async (selector: string, value: string, ctrlKey = false) => act(async () => { const event = new window.Event('keydown', { bubbles: true, cancelable: true }); Object.assign(event, { key: value, ctrlKey }); window.document.querySelector(selector)!.dispatchEvent(event); });
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(Harness))));
      if (language === 'en') await act(async () => workspace.toggleLanguage());
      await choose('b');
      await act(async () => { const button = window.document.querySelector('[data-compare-run]')!; props(button).onClick(); props(button).onClick(); });
      assert.equal(pending.length, 1);
      await choose('c');
      assert.equal(window.document.querySelector<HTMLButtonElement>('[data-compare-run]')!.disabled, true);
      await act(async () => pending[0].resolve(response));
      assert.equal(window.document.querySelector('[data-compare-summary]'), null);
      await run();
      assert.equal(pending[1].other, 'c');
      await act(async () => pending[1].resolve(response));
      assert.equal(window.document.querySelector('[data-compare-position]')!.textContent, '1 / 2');
      await key('[data-pdf-compare] header button', 'n', true);
      await key('#outside', 'n');
      await key('[data-compare-other]', 'n');
      assert.equal(window.document.querySelector('[data-compare-position]')!.textContent, '1 / 2');
      await key('[data-pdf-compare] header button', 'n');
      assert.equal(window.document.querySelector('[data-compare-position]')!.textContent, '2 / 2');
      await key('[data-pdf-compare] header button', 'F3');
      await act(async () => props(window.document.querySelector('[data-compare-diacritics]')!).onChange({ target: { checked: false } }));
      assert.equal(window.document.querySelector('[data-compare-summary]'), null);
      await run();
      workId = 'b';
      await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(Harness))));
      await act(async () => pending[2].resolve(response));
      assert.equal(window.document.querySelector('[data-compare-summary]'), null);
      assert.equal(window.document.querySelector<HTMLSelectElement>('[data-compare-other]')!.value, '');
      await choose('a');
      await run();
      await act(async () => root.render(null));
      await act(async () => pending[3].resolve(response));
    } finally {
      await act(async () => root.unmount());
      window.HTMLElement.prototype.scrollIntoView = oldScroll;
      if (oldAPI) Object.defineProperty(window, 'electronAPI', oldAPI); else Reflect.deleteProperty(window, 'electronAPI');
      for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    }
  });
}
