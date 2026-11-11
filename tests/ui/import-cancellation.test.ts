import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { translations } from '../../src/renderer/translations';
import { cancelledImport } from '../../src/shared/import-batch';

for (const language of ['ar', 'en'] as const) {
  test('wizard cancel retains completed results and retries only remaining files in ' + language, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    const previous = new Map(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries({ window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const previousAPI = Object.getOwnPropertyDescriptor(window, 'electronAPI');
    const files = ['one.txt', 'two.txt'].map(name => ({ name, path: 'D:/fixture/' + name, size: 12 }));
    let finish!: (value: unknown) => void;
    let progress: (value: unknown) => void = () => {};
    let activeJob = '';
    const cancellations: string[] = [];
    let reviewedPaths: string[] = [];
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      getAllBooks: async () => [], getAllNotes: async () => [], getCategoryTree: async () => [],
      discoverDigitalFiles: async () => ({ files, errors: [] }),
      validateDigitalFiles: async (paths: string[]) => ({ results: paths.map(filePath => ({ filePath, fileName: filePath.split('/').pop(), isValid: true })) }),
      checkDigitalDuplicates: async (items: { filePath: string }[]) => { reviewedPaths = items.map(item => item.filePath); return items.map(item => ({ ...item, fileName: item.filePath.split('/').pop(), matchType: 'none', confidence: 0, reason: '' })); },
      onDigitalImportProgress: (handler: typeof progress) => { progress = handler; return () => {}; },
      importDigitalFiles: (_options: unknown, jobId: string) => { activeJob = jobId; return new Promise(resolve => { finish = resolve; }); },
      cancelDigitalImport: async (jobId: string) => { cancellations.push(jobId); return true; },
    } });
    let workspace!: ReturnType<typeof useWorkspace>;
    function Harness() { workspace = useWorkspace(); return createElement('footer', null, createElement('div', { id: 'import-status-slot' })); }
    const root = createRoot(window.document.getElementById('root')!);
    const button = (label: string) => [...window.document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === label)!;
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(Harness))));
      if (language === 'en') await act(async () => workspace.toggleLanguage());
      await act(async () => { workspace.setDroppedImportPaths(['D:/fixture']); workspace.setIsImportWizardOpen(true); });
      for (let attempt = 0; attempt < 30 && !window.document.querySelector('[data-import-minimize]'); attempt++) await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
      await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
      await act(async () => button(translations[language].scanDuplicatesBtn).click());
      assert.ok(activeJob);
      await act(async () => progress({ jobId: 'another-job', currentFileIndex: 1, totalFiles: 2, currentFilename: 'unrelated.txt', status: 'extracting', progressPercentage: 25 }));
      assert.equal(window.document.body.textContent?.includes('unrelated.txt'), false);
      await act(async () => window.document.querySelector<HTMLButtonElement>('[data-import-minimize]')!.click());
      assert.ok(window.document.querySelector('footer [data-import-resume]'));
      assert.equal(window.document.querySelector('[role=dialog]'), null);
      await act(async () => window.document.querySelector<HTMLButtonElement>('[data-import-resume]')!.click());
      await act(async () => window.document.querySelector<HTMLButtonElement>('[data-import-cancel]')!.click());
      assert.deepEqual(cancellations, [activeJob]);
      assert.ok(window.document.querySelector<HTMLButtonElement>('[data-import-cancel]')!.disabled);
      await act(async () => finish({ totalFiles: 2, successfulImports: 1, failedImports: 0, skippedImports: 1, results: [{ filePath: files[0].path, fileName: files[0].name, fileSizeBytes: 12, success: true, workId: 'saved' }, cancelledImport(files[1].path, files[1].name)] }));
      assert.ok(window.document.body.textContent?.includes(translations[language].importStoppedHeading));
      assert.equal(window.document.querySelector('[data-feedback-toast]'), null, 'Foreground summary has no covering completion toast');
      assert.equal(window.document.querySelector('[data-import-count=imported]')?.textContent, (1).toLocaleString(language));
      assert.equal(window.document.querySelector('[data-import-count=duplicates]')?.textContent, (0).toLocaleString(language));
      await act(async () => window.document.querySelector<HTMLButtonElement>('[data-import-result=cancelled]')!.click());
      assert.ok(window.document.body.textContent?.includes(translations[language].importCancelledNext));
      await act(async () => window.document.querySelector<HTMLButtonElement>('[data-import-retry]')!.click());
      await act(async () => button(translations[language].scanDuplicatesBtn).click());
      assert.deepEqual(reviewedPaths, [files[1].path]);
      await act(async () => window.document.querySelector<HTMLButtonElement>('[data-import-minimize]')!.click());
      await act(async () => finish({ totalFiles: 1, successfulImports: 1, failedImports: 0, skippedImports: 0, results: [{ filePath: files[1].path, fileName: files[1].name, fileSizeBytes: 12, success: true, workId: 'saved-two' }] }));
      assert.ok(window.document.querySelector('[data-feedback-toast]'));
      await act(async () => window.document.querySelector<HTMLButtonElement>('[data-import-resume]')!.click());
      assert.equal(window.document.querySelector('[data-feedback-toast]'), null, 'Resume clears completion toast');
    } finally {
      await act(async () => root.unmount());
      if (previousAPI) Object.defineProperty(window, 'electronAPI', previousAPI); else Reflect.deleteProperty(window, 'electronAPI');
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
      }
    }
  });
}
