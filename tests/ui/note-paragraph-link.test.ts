import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { NotesOverviewView } from '../../src/renderer/components/notes/NotesOverviewView';

// KEY-320: a link to a note paragraph opens that note in preview and highlights the paragraph.
for (const language of ['ar', 'en'] as const) {
  test(`a paragraph link opens the target note and highlights the paragraph in ${language}`, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    const raf = (callback: (time: number) => void) => setTimeout(() => callback(Date.now()), 0) as unknown as number;
    const globals = { window, document: window.document, React, IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: raf, cancelAnimationFrame: (id: number) => clearTimeout(id), CSS: { escape: (value: string) => value.replace(/[^\w-]/g, character => `\\${character}`) } };
    const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    // linkedom has no scrollIntoView.
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', { configurable: true, value() {} });
    const notes = [
      { id: 'a', title: 'Linking', content: 'انظر [[note:b#^p1|الصبر]] و [[note:b#^gone99|missing]]', aliases: [], tags: [], createdAt: '2026-11-10', updatedAt: '2026-11-11' },
      { id: 'b', title: 'Source', content: 'مقدمة الكلام\n\nالصبر حبس النفس عن الجزع ^p1', aliases: [], tags: [], createdAt: '2026-11-10', updatedAt: '2026-11-10' },
    ];
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      getAllBooks: async () => [], getAllNotes: async () => [], getCategoryTree: async () => [],
      studyNotes: { list: async () => notes, onChanged: () => () => {} },
      knowledge: { getAll: async () => [] },
      knowledgeHistory: { comments: async () => [], commentCounts: async () => ({}) },
    } });
    let workspace!: ReturnType<typeof useWorkspace>;
    function Harness() { workspace = useWorkspace(); return createElement(NotesOverviewView); }
    const root = createRoot(window.document.getElementById('root')!);
    const $ = (selector: string) => window.document.querySelector<HTMLElement>(selector);
    const settle = () => act(async () => new Promise(resolve => setTimeout(resolve, 30)));
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(Harness))));
      await settle();
      if (language === 'en') await act(async () => workspace.toggleLanguage());
      await act(async () => $('[data-study-note="a"]')!.click());
      assert.equal($('[data-note-preview-toggle]')?.getAttribute('data-note-preview-toggle'), 'edit', 'a note opens in edit mode');
      await act(async () => $('[data-note-preview-toggle]')!.click());
      const link = $('[data-note-preview="a"] [data-study-link="note:b#^p1"]');
      assert.ok(link, 'the paragraph link renders in preview');
      await act(async () => link!.click());
      await settle();
      const paragraph = $('[data-note-preview="b"] [data-paragraph="p1"]');
      assert.ok(paragraph, 'the target note opens in preview');
      assert.equal(paragraph!.getAttribute('data-paragraph-focused'), 'true', 'the paragraph is highlighted');
      assert.ok(paragraph!.textContent?.includes('الصبر حبس النفس'));
      assert.ok(!paragraph!.textContent?.includes('^p1'), 'the anchor stays hidden');
      // A missing anchor opens the whole note with nothing highlighted and no error.
      await act(async () => $('[data-study-note="a"]')!.click());
      await act(async () => $('[data-note-preview-toggle]')!.click());
      await act(async () => $('[data-note-preview="a"] [data-study-link="note:b#^gone99"]')!.click());
      await settle();
      assert.ok($('[data-note-preview="b"]') || $('[data-note-editor-pane]'), 'the target note opens');
      assert.equal($('[data-paragraph-focused]'), null);
      assert.equal($('[data-notes-overview] [role="alert"]'), null);
      assert.equal(window.document.documentElement.getAttribute('dir'), language === 'ar' ? 'rtl' : 'ltr');
    } finally {
      await act(async () => root.unmount());
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
      }
    }
  });
}
