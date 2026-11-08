import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { StorageManagerModal } from '../../src/renderer/components/library/StorageManagerModal';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { translations } from '../../src/renderer/translations';

for (const language of ['ar', 'en'] as const) {
  test(`storage Escape cancels confirmation, not deletion, and waits for repair in ${language}`, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    const previous = new Map(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries({ window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const oldAPI = Object.getOwnPropertyDescriptor(window, 'electronAPI');
    let finish!: (value: unknown) => void;
    let deleted = 0;
    let closed = 0;
    let useFallback = false;
    let finishPrune!: () => void;
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      getAllBooks: async () => [], getAllNotes: async () => [], getCategoryTree: async () => [],
      openDirectoryDialog: async () => 'D:/fixture',
      storage: {
        getHealthSummary: async () => ({ items: [], totalFiles: 0 }),
        getAnalytics: async () => ({ duplicateGroups: [{ hash: 'fixture', count: 2, fileSizeBytes: 12, wastedBytes: 12, items: [
          { workId: 'primary', title: 'Primary', filePath: 'one.pdf', isPrimary: true },
          { workId: 'duplicate', title: 'نسخة Duplicate', filePath: 'two.pdf', isPrimary: false },
        ] }] }),
        pruneDuplicate: async () => { deleted++; return { success: !useFallback }; },
        batchAutoRebind: () => new Promise(resolve => { finish = resolve; }),
      },
    } });
    let workspace!: ReturnType<typeof useWorkspace>;
    function Harness() { workspace = useWorkspace(); return createElement(StorageManagerModal, { isOpen: true, initialTab: 'duplicates', onClose: () => { closed++; }, onRemoveDuplicate: () => new Promise<void>(resolve => { finishPrune = resolve; }) }); }
    const root = createRoot(window.document.getElementById('root')!);
    const escape = async () => act(async () => { const event = new window.Event('keydown', { bubbles: true, cancelable: true }); Object.assign(event, { key: 'Escape' }); window.document.dispatchEvent(event); });
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(Harness))));
      if (language === 'en') await act(async () => workspace.toggleLanguage());
      await act(async () => [...window.document.querySelectorAll('button')].find(button => button.textContent?.trim() === translations[language].storageActionPrune)!.click());
      assert.equal(window.document.querySelectorAll('[role=dialog]').length, 2);
      await escape();
      assert.equal(window.document.querySelectorAll('[role=dialog]').length, 1);
      assert.equal(deleted, 0);
      assert.equal(closed, 0);
      await act(async () => [...window.document.querySelectorAll('button')].find(button => button.querySelector('svg.lucide-folder-search'))!.click());
      await escape();
      assert.equal(closed, 0);
      assert.ok(window.document.body.textContent?.includes(translations[language].storageOperationInProgress));
      await act(async () => finish({ scannedFiles: 0, matchedCount: 0, matches: [] }));
      assert.equal(window.document.querySelectorAll('[role=dialog]').length, 2);
      await escape();
      assert.equal(window.document.querySelectorAll('[role=dialog]').length, 1);
      await escape();
      assert.equal(closed, 1);
      useFallback = true;
      await act(async () => [...window.document.querySelectorAll('button')].find(button => button.textContent?.trim() === translations[language].storageActionPrune)!.click());
      await act(async () => window.document.querySelectorAll<HTMLButtonElement>('[role=dialog] [role=dialog] button')[1].click());
      await escape();
      assert.equal(window.document.querySelectorAll('[role=dialog]').length, 2);
      await act(async () => finishPrune());
      assert.equal(window.document.querySelectorAll('[role=dialog]').length, 1);
    } finally {
      await act(async () => root.unmount());
      if (oldAPI) Object.defineProperty(window, 'electronAPI', oldAPI); else Reflect.deleteProperty(window, 'electronAPI');
      for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    }
  });
}
