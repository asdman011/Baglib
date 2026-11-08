import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { translations } from '../../src/renderer/translations';

for (const language of ['ar', 'en'] as const) {
  test(`background import survives navigation and retains results in ${language}`, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    const previous = new Map(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries({ window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const previousAPI = Object.getOwnPropertyDescriptor(window, 'electronAPI');
    const files = ['one.txt', 'two.txt'].map(name => ({ name, path: `D:/fixture/${name}`, size: 12 }));
    let finish!: (value: unknown) => void;
    let progress: (value: unknown) => void = () => {};
    let imports = 0;
    let loads = 0;
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      getAllBooks: async () => { loads++; return []; }, getAllNotes: async () => [], getCategoryTree: async () => [],
      discoverDigitalFiles: async () => ({ files, errors: [] }),
      validateDigitalFiles: async () => ({ results: files.map(file => ({ filePath: file.path, fileName: file.name, isValid: true })) }),
      checkDigitalDuplicates: async () => files.map(file => ({ filePath: file.path, fileName: file.name, matchType: 'none', confidence: 0, reason: '' })),
      onDigitalImportProgress: (handler: typeof progress) => { progress = handler; return () => {}; },
      importDigitalFiles: () => { imports++; return new Promise(resolve => { finish = resolve; }); },
    } });
    let workspace!: ReturnType<typeof useWorkspace>;
    function Harness() { workspace = useWorkspace(); return createElement('div', { dir: workspace.dir }, workspace.viewMode); }
    const root = createRoot(window.document.getElementById('root')!);
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(Harness))));
      if (language === 'en') await act(async () => workspace.toggleLanguage());
      await act(async () => { workspace.setDroppedImportPaths(['D:/fixture']); workspace.setIsImportWizardOpen(true); });
      for (let attempt = 0; attempt < 30 && !window.document.querySelector('[data-import-minimize]'); attempt++) await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
      await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
      const before = loads;
      await act(async () => [...window.document.querySelectorAll('button')].find(button => button.textContent?.trim() === translations[language].scanDuplicatesBtn)!.click());
      assert.equal(imports, 1);
      await act(async () => {
        if (language === 'ar') {
          const escape = new window.Event('keydown', { bubbles: true, cancelable: true });
          Object.assign(escape, { key: 'Escape' });
          window.document.dispatchEvent(escape);
        } else window.document.querySelector<HTMLButtonElement>('[data-import-minimize]')!.click();
      });
      assert.equal(window.document.querySelector('[role=dialog]'), null);
      await act(async () => workspace.setViewMode('notes'));
      assert.ok(window.document.querySelector('[data-import-resume]'));
      await act(async () => workspace.setDroppedImportPaths(['D:/unrelated']));
      assert.deepEqual(workspace.droppedImportPaths, ['D:/fixture']);
      await act(async () => progress({ currentFileIndex: 1, totalFiles: 2, currentFilename: 'one.txt', status: 'extracting', progressPercentage: 25 }));
      assert.ok(window.document.querySelector('[data-import-resume]')?.textContent?.includes('25%'));
      await act(async () => finish({ totalFiles: 2, successfulImports: 2, failedImports: 0, skippedImports: 0, results: files.map(file => ({ filePath: file.path, fileName: file.name, fileSizeBytes: 12, success: true })) }));
      assert.equal(loads - before, 1);
      assert.ok(window.document.querySelector('[data-import-resume]')?.textContent?.includes(translations[language].importBackgroundFinished));
      await act(async () => workspace.setIsImportWizardOpen(true));
      assert.ok(window.document.querySelector('[role=dialog]'));
      assert.ok(window.document.body.textContent?.includes(translations[language].importCompletedHeading));
      assert.equal(imports, 1);
    } finally {
      await act(async () => root.unmount());
      if (previousAPI) Object.defineProperty(window, 'electronAPI', previousAPI); else Reflect.deleteProperty(window, 'electronAPI');
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
      }
    }
  });
}
