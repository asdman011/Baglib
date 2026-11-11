import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { StatusBar } from '../../src/renderer/components/layout/StatusBar';
import { BoardsWorkspace } from '../../src/renderer/components/notes/BoardsWorkspace';
import { StudySourcesSearch } from '../../src/renderer/components/search/StudySourcesSearch';
import { useUndoFeedback } from '../../src/renderer/hooks/useUndoFeedback';
import { translations } from '../../src/renderer/translations';

async function harness(language: 'ar' | 'en', component: () => React.ReactNode, api: object, run: (document: Document) => Promise<void>) {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  const globals = { React, window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  Object.defineProperty(window, 'electronAPI', { value: { getAllBooks: async () => [], getAllNotes: async () => [], ...api }, configurable: true });
  let workspace!: ReturnType<typeof useWorkspace>;
  function Harness() { workspace = useWorkspace(); return createElement(component); }
  const root = createRoot(window.document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(Harness))));
    if (language === 'en') await act(async () => workspace.toggleLanguage());
    await run(window.document as unknown as Document);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

for (const language of ['ar', 'en'] as const) {
  test(`readiness joins multiple unavailable tools without encoding loss in ${language}`, async () => {
    await harness(language, StatusBar, {
      getFtsStats: async () => ({ databaseReady: false, indexReady: false }),
      pdfEditor: { engineStatus: async () => ({ ok: true, data: { configured: false } }) },
    }, async document => {
      const status = document.querySelector('[data-readiness]')!;
      for (const attribute of ['title', 'aria-label']) {
        const detail = status.getAttribute(attribute)!;
        assert.equal(detail.includes('?'), false);
        assert.ok(detail.includes('\u00b7'));
        assert.ok(detail.includes(translations[language].feedbackDatabaseUnavailable));
        assert.ok(detail.includes(translations[language].feedbackIndexUnavailable));
        assert.ok(detail.includes(translations[language].feedbackPdfUnavailable));
      }
    });
  });

  test(`boards wait for their list before showing a single empty action in ${language}`, async () => {
    let finish!: (rows: unknown[]) => void;
    await harness(language, () => createElement(BoardsWorkspace, { notes: [] }), {
      boards: { list: () => new Promise(resolve => { finish = resolve; }), onChanged: () => () => {} },
    }, async document => {
      assert.ok(document.querySelector('[data-feedback-skeleton]'));
      assert.equal(document.body.textContent?.includes(translations[language].boardsNone), false);
      await act(async () => finish([]));
      assert.equal(document.querySelector('[data-feedback-skeleton]'), null);
      const title = [...document.querySelectorAll('h3')].find(element => element.textContent === translations[language].boardsNone)!;
      assert.equal(title.parentElement?.querySelectorAll('button').length, 1);
    });
  });

  test(`history feedback restores the exact revision once in ${language}`, async () => {
    let remove!: ReturnType<typeof useUndoFeedback>;
    const calls: unknown[][] = [];
    let revision = 7;
    let refreshed = 0;
    function Actions() { remove = useUndoFeedback(); return null; }
    await harness(language, Actions, {
      knowledgeHistory: { versions: async () => [{ revision }], restore: async (...args: unknown[]) => { calls.push(args); } },
    }, async document => {
      await act(async () => remove('item', async () => { revision = 8; }, () => { refreshed++; }));
      assert.equal(document.querySelectorAll('[data-feedback-toast]').length, 1);
      await act(async () => { const undo = document.querySelector<HTMLButtonElement>('[data-feedback-toast] button')!; undo.click(); undo.click(); });
      assert.deepEqual(calls, [['item', 7, 8, true]]);
      assert.equal(refreshed, 2);
    });
  });

  test(`source search shows skeletons through debounce then a recovery action in ${language}`, async () => {
    await harness(language, () => createElement(StudySourcesSearch, { query: '\u0639\u0650\u0644\u0652\u0645 Knowledge', onLeave: () => {} }), {
      quran: { readerCatalog: async () => ({ ok: true, data: { sources: [] } }) },
      sunnah: { search: async () => { throw new Error('offline'); } },
      poetry: { search: async () => ({ ok: true, data: { items: [] } }) },
    }, async document => {
      assert.ok(document.querySelector('[data-feedback-skeleton]'));
      assert.equal(document.body.textContent?.includes(translations[language].sourcesUnavailable), false);
      await act(async () => new Promise(resolve => setTimeout(resolve, 300)));
      assert.equal(document.querySelector('[data-feedback-skeleton]'), null);
      assert.ok(document.body.textContent?.includes(translations[language].sourcesUnavailable));
      assert.ok([...document.querySelectorAll('button')].some(button => button.textContent === translations[language].navSettings));
    });
  });
}

test('bookmark removal uses one shared Undo notification and marks failures have retry', () => {
  const reader = readFileSync('src/renderer/components/reader/FullPageBookReader.tsx', 'utf8');
  const toggle = reader.slice(reader.indexOf('const handleToggleBookmark'), reader.indexOf('// Current page ink'));
  assert.equal(toggle.includes('setShowToast'), false);
  assert.ok(toggle.includes("handleDeleteKnowledgeItem(existingKnowledge.id, t('bookmarkRemoved'"));
  assert.ok(reader.includes('<PdfMarksList error={marksError} onRetry='));
  const marks = readFileSync('src/renderer/components/reader/PdfMarksList.tsx', 'utf8');
  assert.ok(marks.includes(': !error && !shown.length'));
});
