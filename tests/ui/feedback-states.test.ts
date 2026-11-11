import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { useToast } from '../../src/renderer/components/ui/Toast';
import { StatusBar } from '../../src/renderer/components/layout/StatusBar';
import { PersonalCommentary } from '../../src/renderer/components/knowledge/PersonalCommentary';
import { SavedCardsPanel } from '../../src/renderer/components/knowledge/SavedCardsPanel';
import { SearchHubModal } from '../../src/renderer/components/search/SearchHubModal';
import { translations } from '../../src/renderer/translations';

function properties(element: Element) {
  const key = Object.keys(element).find(key => key.startsWith('__reactProps$'))!;
  return (element as unknown as Record<string, Record<string, (event: unknown) => void>>)[key];
}

async function harness(language: 'ar' | 'en', component: () => React.ReactNode, api: object, run: (window: Window & typeof globalThis, workspace: ReturnType<typeof useWorkspace>) => Promise<void>) {
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
    await run(window as unknown as Window & typeof globalThis, workspace);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

for (const language of ['ar', 'en'] as const) {
  test(`feedback service awaits one undo and expires automatically in ${language}`, async () => {
    let show!: ReturnType<typeof useToast>['showToast'];
    let calls = 0;
    let finish!: () => void;
    function Feedback() { show = useToast().showToast; return null; }
    await harness(language, Feedback, {}, async window => {
      await act(async () => { show({ message: translations[language].feedbackMarkDeleted, duration: 5000, action: { label: translations[language].undo, onClick: () => { calls++; return new Promise<void>(resolve => { finish = resolve; }); } } }); });
      const toast = window.document.querySelector('[data-feedback-toast]')!;
      const button = toast.querySelector('button')!;
      await act(async () => { button.click(); button.click(); });
      assert.equal(calls, 1);
      assert.equal(button.disabled, true);
      await act(async () => finish());
      assert.equal(window.document.querySelector('[data-feedback-toast]'), null);
      await act(async () => { show({ message: translations[language].feedbackMarkDeleted, action: { label: translations[language].undo, onClick: async () => { throw new Error('Expected action failure'); } } }); });
      await act(async () => window.document.querySelector<HTMLButtonElement>('[data-feedback-toast] button')!.click());
      assert.ok(window.document.querySelector('[role=alert]')?.textContent?.includes(translations[language].feedbackActionFailed));
      await act(async () => window.document.querySelector<HTMLButtonElement>('[role=alert] button')!.click());
      await act(async () => { show({ message: translations[language].feedbackSaved, duration: 15 }); });
      await act(async () => new Promise(resolve => setTimeout(resolve, 40)));
      assert.equal(window.document.querySelector('[data-feedback-toast]'), null);
    });
  });

  test(`readiness reflects the missing PDF engine and recovers in ${language}`, async () => {
    let configured = true;
    await harness(language, StatusBar, {
      getFtsStats: async () => ({ databaseReady: true, indexReady: true, booksCount: 0, pagesCount: 0 }),
      pdfEditor: { engineStatus: async () => ({ ok: true, data: { configured, status: 'stopped' } }) },
    }, async window => {
      assert.equal(window.document.querySelector('[data-readiness]')?.getAttribute('data-readiness'), 'ready');
      configured = false;
      await act(async () => window.dispatchEvent(new window.Event('focus')));
      const status = window.document.querySelector('[data-readiness]')!;
      assert.equal(status.getAttribute('data-readiness'), 'limited');
      assert.ok(status.getAttribute('title')?.includes(translations[language].feedbackPdfUnavailable));
      configured = true;
      await act(async () => window.dispatchEvent(new window.Event('focus')));
      assert.equal(status.getAttribute('data-readiness'), 'ready');
    });
  });

  test(`cards ignore delayed older search successes and failures after typing/clear in ${language}`, async () => {
    const pending: { resolve: (cards: unknown[]) => void; reject: (error: Error) => void }[] = [];
    await harness(language, SavedCardsPanel, {
      knowledgeCards: { list: () => new Promise((resolve, reject) => pending.push({ resolve, reject })), listPreserved: async () => [], listAttempts: async () => [], decks: async () => [], reviewQueue: async () => ({ due: 0 }) },
    }, async window => {
      const input = window.document.querySelector('input[placeholder]')!;
      assert.ok(window.document.querySelector('.animate-pulse'));
      await act(async () => properties(input).onChange({ target: { value: 'عِلْم Knowledge' } }));
      await act(async () => properties(input).onChange({ target: { value: '' } }));
      await act(async () => pending.at(-1)!.resolve([]));
      await act(async () => pending[1].reject(new Error('OLD_FAILURE')));
      await act(async () => pending[0].resolve([{ id: 'old', front: 'STALE_CARD', sourceKind: 'question', back: '' }]));
      assert.ok(!window.document.body.textContent?.includes('STALE_CARD'));
      assert.ok(!window.document.querySelector('[data-saved-cards] > [role=alert]'));
      assert.ok(window.document.body.textContent?.includes(translations[language].savedCardsEmpty));
    });
  });

  test(`global search ignores a delayed older response after a newer query in ${language}`, async () => {
    const pending: { id: string; resolve: (result: unknown) => void }[] = [];
    await harness(language, SearchHubModal, {
      search: { getProviders: async () => [], cancel: async () => {}, query: (_query: unknown, options: { searchId: string }) => new Promise(resolve => pending.push({ id: options.searchId, resolve })) },
    }, async (window, workspace) => {
      await act(async () => workspace.setSearchHubOpen(true));
      const input = window.document.querySelector('input')!;
      const type = async (value: string) => act(async () => properties(input).onChange({ target: { value } }));
      const enter = async () => act(async () => properties(input).onKeyDown({ key: 'Enter' }));
      await type('older العلم'); await enter();
      await type('newer knowledge'); await enter();
      assert.notEqual(pending[0].id, pending[1].id);
      await act(async () => pending[1].resolve({ results: [] }));
      await act(async () => pending[0].resolve({ results: [{ id: 'old', title: 'STALE_GLOBAL' }] }));
      assert.ok(!window.document.body.textContent?.includes('STALE_GLOBAL'));
      await type('');
      assert.equal((input as HTMLInputElement).value, '');
    });
  });
  test(`commentary ignores a delayed response after clearing in ${language}`, async () => {
    let finish!: (rows: unknown[]) => void;
    await harness(language, PersonalCommentary, {
      commentary: { search: () => new Promise(resolve => { finish = resolve; }) },
    }, async window => {
      const input = window.document.querySelector('input')!;
      await act(async () => properties(input).onChange({ target: { value: '????? Knowledge' } }));
      await act(async () => properties(input).onChange({ target: { value: '' } }));
      await act(async () => finish([{ id: 'old', text: 'STALE_COMMENTARY' }]));
      assert.equal(window.document.querySelector('[data-commentary-entry]'), null);
    });
  });



}

test('PDF measurement canvases stay outside the shell flex layout', () => {
  const styles = readFileSync('src/renderer/app/globals.css', 'utf8');
  assert.match(styles, /\.hiddenCanvasElement\s*\{\s*display:\s*none;/);
});
