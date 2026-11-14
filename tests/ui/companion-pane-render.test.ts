import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider } from '../../src/renderer/components/context/WorkspaceContext';
import { CompanionNotePane, CompanionToggle, readCompanionSavedState, writeCompanionSavedState } from '../../src/renderer/components/notes/CompanionNotePane';

// The reported console error: choosing a note in the side-note pane updated the edge tab while React was rendering the pane.
for (const lang of ['ar', 'en'] as const) {
  test(`choosing a note in the side-note pane does not update the edge tab during render (${lang})`, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    const storage = new Map<string, string>([['baglib-lang', lang]]);
    const localStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, String(value)); }, removeItem: (key: string) => { storage.delete(key); } };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: localStorage });
    const globals: Record<string, unknown> = { window, document: window.document, localStorage, navigator: window.navigator, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, React, IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id) };
    const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const notes = [{ id: 'note-1', title: 'ملاحظة Note', content: 'نص', aliases: [], tags: [], createdAt: '', updatedAt: '' }];
    const empty = async () => [];
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      getAllBooks: empty, getAllNotes: empty, getCategoryTree: empty, categories: { getTree: empty }, tags: { getAll: empty }, knowledge: { getAll: empty },
      settings: { get: async () => undefined, set: async () => undefined },
      studyNotes: { list: async () => notes, onChanged: () => () => {} },
    } });
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };
    writeCompanionSavedState({ open: true, noteId: null, topPercent: 30, edge: 'start' });
    const root = createRoot(window.document.getElementById('root')!);
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, null,
        createElement(CompanionToggle, { open: true, onToggle: () => {} }),
        createElement(CompanionNotePane, { onClose: () => {} }))));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      const select = window.document.querySelector<HTMLSelectElement>('[data-companion-note]');
      assert.ok(select, 'the note picker renders');
      const props = Object.keys(select).find(key => key.startsWith('__reactProps'))!;
      const onChange = (select as unknown as Record<string, { onChange: (event: { target: { value: string } }) => void }>)[props].onChange;
      await act(async () => onChange({ target: { value: 'note-1' } }));
      assert.deepEqual(errors.filter(line => /Cannot update a component/u.test(line)), []);
      const saved = readCompanionSavedState();
      assert.equal(saved.noteId, 'note-1');
      // The pane's write keeps the edge tab's own remembered place.
      assert.deepEqual([saved.topPercent, saved.edge], [30, 'start']);
    } finally {
      await act(async () => root.unmount());
      console.error = originalError;
      for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    }
  });
}
