import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { SearchHubModal } from '../../src/renderer/components/search/SearchHubModal';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { translations } from '../../src/renderer/translations';

for (const language of ['ar', 'en'] as const) {
  test(`clearing search rejects delayed results/progress and cancels debounce in ${language}`, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    const globals = { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true };
    const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const pending: { id: string; resolve: (value: unknown) => void }[] = [];
    const cancelled: string[] = [];
    const fulltext: ((value: unknown) => void)[] = [];
    let progress: (value: unknown) => void = () => {};
    const previousAPI = Object.getOwnPropertyDescriptor(window, 'electronAPI');
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      getAllBooks: async () => [], getAllNotes: async () => [], getCategoryTree: async () => [],
      searchLibraryFullText: () => new Promise(resolve => fulltext.push(resolve)),
      search: {
        getProviders: async () => [],
        onProgress: (handler: typeof progress) => { progress = handler; return () => {}; },
        cancel: async (id: string) => { cancelled.push(id); },
        query: (_query: unknown, options: { searchId: string }) => new Promise(resolve => pending.push({ id: options.searchId, resolve })),
      },
    } });
    let workspace!: ReturnType<typeof useWorkspace>;
    function Harness() { workspace = useWorkspace(); return createElement(SearchHubModal); }
    const root = createRoot(window.document.getElementById('root')!);
    const props = (element: Element) => (element as unknown as Record<string, Record<string, (event: unknown) => void>>)[Object.keys(element).find(key => key.startsWith('__reactProps$'))!];
    const type = async (value: string) => act(async () => props(window.document.querySelector('input')!).onChange({ target: { value } }));
    const enter = async () => act(async () => props(window.document.querySelector('input')!).onKeyDown({ key: 'Enter' }));
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(Harness))));
      if (language === 'en') await act(async () => workspace.toggleLanguage());
      await act(async () => workspace.setSearchHubOpen(true));
      assert.equal(window.document.querySelector('[dir]')?.getAttribute('dir'), language === 'ar' ? 'rtl' : 'ltr');
      await type('اختبار test');
      await enter();
      assert.equal(pending.length, 1);
      await act(async () => window.document.querySelector<HTMLButtonElement>(`button[aria-label="${translations[language].searchClearQuery}"]`)!.click());
      assert.ok(cancelled.includes(pending[0].id));
      await act(async () => {
        progress({ searchId: pending[0].id, providerId: 'local', status: 'completed', resultCount: 1, results: [{ id: 'stale', title: 'STALE_RESULT' }] });
        pending[0].resolve({ results: [{ id: 'stale', title: 'STALE_RESULT' }] });
      });
      assert.ok(!window.document.body.textContent?.includes('STALE_RESULT'));
      assert.equal(window.document.querySelector<HTMLInputElement>('input')!.value, '');
      await type('cancel before debounce');
      await type('');
      await act(async () => new Promise(resolve => setTimeout(resolve, 500)));
      assert.equal(pending.length, 1);
      await act(async () => workspace.setSearchHubOpen(true));
      await type('full text اختبار');
      await act(async () => [...window.document.querySelectorAll('button')].find(button => button.textContent?.trim() === translations[language].libraryFtsTitle)!.click());
      assert.equal(fulltext.length, 1);
      await type('');
      await act(async () => fulltext[0]([{ bookId: 'old', bookTitle: 'STALE_FTS', pageNumber: 1, snippet: 'OLD' }]));
      assert.ok(!window.document.body.textContent?.includes('STALE_FTS'));
      await type('close before debounce');
      await act(async () => workspace.setSearchHubOpen(false));
      await act(async () => new Promise(resolve => setTimeout(resolve, 500)));
      assert.equal(pending.length, 1);
      assert.equal(fulltext.length, 1);
    } finally {
      await act(async () => root.unmount());
      if (previousAPI) Object.defineProperty(window, 'electronAPI', previousAPI);
      else Reflect.deleteProperty(window, 'electronAPI');
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    }
  });
}
