import { it } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { ImportWizardModal } from '../../src/renderer/components/library/ImportWizardModal';
import { translations } from '../../src/renderer/translations';

for (const language of ['ar', 'en'] as const) {
  it(`stages 300 files with bounded rows, contains drops and refreshes once after importing in ${language}`, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
    Object.defineProperty(globalThis, 'document', { value: window.document, configurable: true });
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true, writable: true });
    const paths = ['D:/Books'];
    const files = Array.from({ length: 300 }, (_, index) => ({ path: `D:/Books/${index}.txt`, name: `${index % 2 ? 'كِتاب' : 'Book'} ${index}.txt`, size: 12 }));
    let libraryLoads = 0;
    let imported = 0;
    let discoveries = 0;
    let bubbledDrops = 0;
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      getAllBooks: async () => { libraryLoads++; return []; },
      getAllNotes: async () => [],
      getCategoryTree: async () => [],
      discoverDigitalFiles: async () => { discoveries++; return { files, errors: [] }; },
      getPathForFile: () => 'D:/Books',
      validateDigitalFiles: async (paths: string[]) => ({ results: paths.map(filePath => ({ filePath, fileName: filePath, isValid: true })) }),
      checkDigitalDuplicates: async () => files.map(file => ({ filePath: file.path, fileName: file.name, matchType: 'none', confidence: 0, reason: '' })),
      onDigitalImportProgress: () => () => {},
      importDigitalFiles: async (options: { filePath: string }[]) => {
        imported = options.length;
        return { totalFiles: options.length, successfulImports: options.length, failedImports: 0, skippedImports: 0, results: options.map(file => ({ ...file, fileName: file.filePath, fileSizeBytes: 12, success: true })) };
      },
    } });
    const dropListener = () => { bubbledDrops++; };
    window.document.addEventListener('drop', dropListener);
    let workspace!: ReturnType<typeof useWorkspace>;
    function Harness() {
      workspace = useWorkspace();
      return createElement(ImportWizardModal, { isOpen: true, initialPaths: paths, onClose: () => {} });
    }
    const root = createRoot(window.document.getElementById('root')!);
    const button = (text: string) => [...window.document.querySelectorAll('button')].find(element => element.textContent?.trim() === text)!;
    try {
      await act(async () => { root.render(createElement(WorkspaceProvider, null, createElement(Harness))); });
      if (language === 'en') await act(async () => workspace.toggleLanguage());
      assert.equal(window.document.querySelector('[dir]')?.getAttribute('dir'), language === 'ar' ? 'rtl' : 'ltr');
      assert.equal(window.document.querySelectorAll(`button[title="${translations[language].removeImportFile}"]`).length, 100);
      await act(async () => button(translations[language].showMoreImportFiles).click());
      assert.equal(window.document.querySelectorAll(`button[title="${translations[language].removeImportFile}"]`).length, 200);
      const drop = new window.Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(drop, 'dataTransfer', { value: { files: [{ name: 'Books', size: 0 }] } });
      await act(async () => window.document.querySelector('input[type="file"]')!.parentElement!.dispatchEvent(drop));
      assert.equal(bubbledDrops, 0);
      assert.equal(discoveries, 2);
      assert.equal(imported, 0);
      const beforeImport = libraryLoads;
      await act(async () => button(translations[language].scanDuplicatesBtn).click());
      assert.equal(imported, 300);
      assert.equal(button(translations[language].startImportBtn), undefined);
      assert.equal(libraryLoads - beforeImport, 1);
      assert.ok(window.document.body.textContent?.includes(translations[language].importCompletedHeading));
      assert.ok(window.document.body.textContent?.includes(translations[language].showMoreImportFiles));
    } finally {
      await act(async () => root.unmount());
      window.document.removeEventListener('drop', dropListener);
      if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow); else Reflect.deleteProperty(globalThis, 'window');
      if (savedDocument) Object.defineProperty(globalThis, 'document', savedDocument); else Reflect.deleteProperty(globalThis, 'document');
    }
  });
}

for (const language of ['ar', 'en'] as const) {
  for (const issue of ['duplicate', 'invalid', 'metadata-error', 'incomplete'] as const) {
    it(`requires review rather than auto-import for ${issue} in ${language}`, async () => {
      const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
      const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
      const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
      Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
      Object.defineProperty(globalThis, 'document', { value: window.document, configurable: true });
      Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true, writable: true });
      let imported = 0;
      const paths = ['D:/Books'];
      const file = { path: 'D:/Books/0.txt', name: 'كتاب Knowledge.txt', size: 12 };
      Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
        getAllBooks: async () => [], getAllNotes: async () => [], getCategoryTree: async () => [],
        discoverDigitalFiles: async () => ({ files: [file], errors: [] }),
        validateDigitalFiles: async () => ({ results: [{ filePath: file.path, fileName: file.name, isValid: issue !== 'invalid' }] }),
        checkDigitalDuplicates: async (inputs: unknown[]) => issue === 'incomplete' || !inputs.length ? [] : [{ filePath: file.path, fileName: file.name, matchType: issue === 'duplicate' ? 'exact_file' : 'none', confidence: 1, reason: '', error: issue === 'metadata-error' ? 'Parser failed' : undefined }],
        importDigitalFiles: async () => { imported++; throw new Error('Must wait for review'); },
      } });
      let workspace!: ReturnType<typeof useWorkspace>;
      function Harness() {
        workspace = useWorkspace();
        return createElement(ImportWizardModal, { isOpen: true, initialPaths: paths, onClose: () => {} });
      }
      const root = createRoot(window.document.getElementById('root')!);
      try {
        await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(Harness))));
        if (language === 'en') await act(async () => workspace.toggleLanguage());
        const scan = [...window.document.querySelectorAll('button')].find(button => button.textContent?.trim() === translations[language].scanDuplicatesBtn)!;
        await act(async () => scan.click());
        assert.equal(imported, 0);
        assert.ok([...window.document.querySelectorAll('button')].some(button => button.textContent?.trim() === translations[language].startImportBtn));
      } finally {
        await act(async () => root.unmount());
        if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow); else Reflect.deleteProperty(globalThis, 'window');
        if (savedDocument) Object.defineProperty(globalThis, 'document', savedDocument); else Reflect.deleteProperty(globalThis, 'document');
      }
    });
  }
}
