import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { NotesOverviewView } from '../../src/renderer/components/notes/NotesOverviewView';
import { translations } from '../../src/renderer/translations';

for (const language of ['ar', 'en'] as const) {
  test(`notes export filtered data, recover from export errors, and export one note in ${language}`, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    const globals = { window, document: window.document, React, IS_REACT_ACT_ENVIRONMENT: true };
    const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const notes = ['open', 'closed'].map(id => ({ id, title: `ملاحظة Test ${id}`, content: 'مُحْتَوًى English', aliases: [], tags: [], createdAt: '2026-11-10', updatedAt: '2026-11-10' }));
    const markdown: string[][] = [];
    const word: { ids: string[]; lang: string; layout: unknown }[] = [];
    let exportFails = true;
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      getAllBooks: async () => [], getAllNotes: async () => [], getCategoryTree: async () => [],
      studyNotes: {
        list: async () => notes, onChanged: () => () => {},
        exportMarkdown: async (ids: string[]) => { markdown.push(ids); if (exportFails) throw new Error('export unavailable'); return { folder: 'notes-export', count: ids.length }; },
        exportWord: async (ids: string[], lang: string, layout: unknown) => { word.push({ ids, lang, layout }); return { file: 'notes.docx', count: ids.length }; },
      },
      knowledge: { getAll: async () => [] },
      knowledgeHistory: { comments: async () => [], commentCounts: async () => ({ open: 2 }) },
    } });
    let workspace!: ReturnType<typeof useWorkspace>;
    function Harness() { workspace = useWorkspace(); return createElement(NotesOverviewView); }
    const root = createRoot(window.document.getElementById('root')!);
    const props = (element: Element) => (element as unknown as Record<string, { onChange: (event: unknown) => void; onSubmit: (event: unknown) => void }>)[Object.keys(element).find(key => key.startsWith('__reactProps$'))!];
    const click = async (selector: string) => act(async () => window.document.querySelector<HTMLButtonElement>(selector)!.click());
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(Harness))));
      await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
      if (language === 'en') await act(async () => workspace.toggleLanguage());
      const previewButton = [...window.document.querySelectorAll<HTMLButtonElement>('[data-note-editor-pane] header button')].find(button => button.getAttribute('aria-label') === translations[language].dashScratchpadPreview)!;
      assert.equal(previewButton.textContent?.trim(), '', 'Preview control displays its icon');
      await act(async () => previewButton.click());
      assert.equal(previewButton.getAttribute('aria-label'), translations[language].dashScratchpadEdit);
      await act(async () => previewButton.click());
      const filter = window.document.querySelector('[data-notes-list-pane] select')!;
      await act(async () => props(filter).onChange({ target: { value: 'comments' } }));
      assert.ok(window.document.querySelector('[data-study-note="open"]'));
      assert.equal(window.document.querySelector('[data-study-note="closed"]'), null);
      assert.ok(filter.textContent?.includes(translations[language].commentsOnlyOpen.replace('{count}', '2')));
      await click('[data-notes-export-markdown]');
      assert.ok(window.document.querySelector('[role="alert"]')?.textContent?.includes(translations[language].studyActionFailed));
      assert.ok(window.document.querySelector('[data-study-note="open"]'), 'Export failure keeps displayed data');
      exportFails = false;
      await click('[data-notes-export-markdown]');
      assert.deepEqual(markdown, [['open'], ['open']]);
      assert.ok(window.document.querySelector('[data-notes-exported]'));
      await click('[data-notes-export-word]');
      await act(async () => props(window.document.querySelector('[data-word-options]')!).onSubmit({ preventDefault() {} }));
      assert.deepEqual(word[0].ids, ['open']);
      assert.equal(word[0].lang, language);
      assert.ok(window.document.querySelector('[data-notes-word-exported]'));
      // Single-note export remains reachable in the editor menu independently of list filtering.
      await act(async () => props(filter).onChange({ target: { value: 'all' } }));
      await click('[data-study-note="closed"]');
      await click('[data-note-editor-pane] button[aria-haspopup="menu"]');
      const item = [...window.document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.textContent?.trim() === translations[language].noteExportMarkdown)!;
      assert.ok(item);
      await act(async () => item.click());
      assert.deepEqual(markdown.at(-1), ['closed']);
      assert.equal(window.document.documentElement.getAttribute('dir'), language === 'ar' ? 'rtl' : 'ltr');
    } finally {
      await act(async () => root.unmount());
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
      }
    }
  });
}
