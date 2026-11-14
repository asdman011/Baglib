import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { BoardsWorkspace } from '../../src/renderer/components/notes/BoardsWorkspace';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { ToastProvider } from '../../src/renderer/components/ui/Toast';
import type { Board, BoardInput } from '../../src/shared/boards';

for (const language of ['ar', 'en'] as const) {
  test(`board group editing, history, serialized saves and reset / ${language}`, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    const globals = { window, document: window.document, React, IS_REACT_ACT_ENVIRONMENT: true, cancelAnimationFrame: () => {}, requestAnimationFrame: (callback: () => void) => { callback(); return 0; } };
    const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    Object.defineProperty(window.HTMLElement.prototype, 'getBoundingClientRect', { configurable: true, value: () => ({ x: 0, y: 0, left: 0, top: 0, width: 1000, height: 700 }) });
    Object.defineProperty(window.HTMLElement.prototype, 'setPointerCapture', { configurable: true, value() {} });
    const original: Board = { id: 'first', title: 'الصَّبر — Patience', preset: 'mind', revision: 1, createdAt: '', updatedAt: '', items: [
      { id: 'a', kind: 'card', color: 'sky', text: 'Alpha', x: 0, y: 0, w: 160, h: 100 },
      { id: 'b', kind: 'card', color: 'sky', text: 'باء', x: 300, y: 100, w: 160, h: 100 },
    ], edges: [{ id: 'edge', from: 'a', to: 'b', label: '' }] };
    const boards = new Map<string, Board>([['first', original], ['second', { ...original, id: 'second' }]]);
    const requests: BoardInput[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    let saveFailure = false;
    let saveConflict = false;
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      getAllBooks: async () => [], getAllNotes: async () => [], getCategoryTree: async () => [],
      settings: { get: async () => undefined, set: async () => {} },
      boards: {
        list: async () => [...boards.values()].map(board => ({ ...board, items: board.items.length })),
        get: async (id: string) => boards.get(id), onChanged: () => () => {},
        save: async (input: BoardInput) => {
          requests.push(structuredClone(input));
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise(resolve => setTimeout(resolve, requests.length === 1 ? 800 : 15));
          inFlight--;
          if (saveFailure) throw new Error('disk-full');
          if (saveConflict) throw new Error('board-conflict');
          const stored = boards.get(input.id)!;
          assert.equal(input.expectedRevision, stored.revision);
          const saved = { ...stored, ...input, revision: stored.revision + 1 };
          boards.set(input.id, saved);
          return saved;
        },
      },
    } });
    let workspace!: ReturnType<typeof useWorkspace>;
    function Harness() { workspace = useWorkspace(); return createElement(ToastProvider, null, createElement(BoardsWorkspace, { notes: [] })); }
    const root = createRoot(window.document.getElementById('root')!);
    const $ = (selector: string) => window.document.querySelector<HTMLElement>(selector)!;
    const props = (element: Element) => (element as unknown as Record<string, Record<string, (event: unknown) => void>>)[Object.keys(element).find(key => key.startsWith('__reactProps$'))!];
    const settle = () => act(async () => new Promise(resolve => setTimeout(resolve, 600)));
    const click = (selector: string) => act(async () => $(selector).click());
    const pointer = (id: string, additive = false) => act(async () => props($(`[data-board-item="${id}"]`)).onPointerDown({ stopPropagation() {}, preventDefault() {}, shiftKey: additive, ctrlKey: false, metaKey: false }));
    const key = (value: string, extra: Record<string, boolean> = {}) => act(async () => {
      const event = new window.Event('keydown', { bubbles: true, cancelable: true });
      Object.assign(event, { key: value, ...extra });
      window.dispatchEvent(event);
    });
    const x = (id: string) => parseFloat($(`[data-board-item="${id}"]`).style.insetInlineStart);
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(Harness))));
      if (language === 'en') await act(async () => workspace.toggleLanguage());
      await click('[data-boards-entry="first"] button');
      await pointer('a');
      await pointer('b', true);
      assert.ok($('[data-board-selection-count]'));
      await key('ArrowRight');
      assert.equal(x('a'), 1);
      assert.equal(x('b'), 301);
      await key('z', { ctrlKey: true });
      assert.equal(x('a'), 0);
      await key('z', { ctrlKey: true, shiftKey: true });
      assert.equal(x('a'), 1);
      await key('d', { ctrlKey: true });
      assert.equal(window.document.querySelectorAll('[data-board-item]').length, 4);
      await key('Delete');
      assert.equal(window.document.querySelectorAll('[data-board-item]').length, 2);
      await click('[data-board-undo]');
      assert.equal(window.document.querySelectorAll('[data-board-item]').length, 4);
      // Moving while the first write is in flight must use its returned revision.
      await settle();
      assert.equal(inFlight, 1);
      await key('z', { ctrlKey: true });
      await settle();
      await settle();
      assert.equal(maxInFlight, 1);
      assert.ok(requests.length >= 2);
      assert.equal($('[data-board-save]').getAttribute('data-board-save'), 'saved');
      // An export/navigation save failure must leave the current board open.
      saveFailure = true;
      await click('[data-boards-back]');
      await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
      assert.ok($('[data-board-surface]'));
      assert.equal($('[data-board-save]').getAttribute('data-board-save'), 'failed');
      saveFailure = false;
      saveConflict = true;
      const externallySaved = boards.get('first')!;
      boards.set('first', { ...externallySaved, revision: externallySaved.revision + 1,
        items: externallySaved.items.map(item => ({ ...item, x: item.x + 900 })),
      });
      await click('[data-boards-back]');
      await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
      assert.equal($('[data-board-save]').getAttribute('data-board-save'), 'conflict');
      assert.equal(x('a'), boards.get('first')!.items[0].x);
      assert.ok($('[data-board-undo]').hasAttribute('disabled'));
      saveConflict = false;
      await click('[data-boards-back]');
      await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
      await click('[data-boards-entry="second"] button');
      assert.ok($('[data-board-undo]').hasAttribute('disabled'));
      assert.ok($('[data-board-redo]').hasAttribute('disabled'));
      assert.equal(window.document.documentElement.dir, language === 'ar' ? 'rtl' : 'ltr');
    } finally {
      await act(async () => root.unmount());
      for (const [key, value] of previous) {
        if (value) Object.defineProperty(globalThis, key, value);
        else Reflect.deleteProperty(globalThis, key);
      }
    }
  });
}
