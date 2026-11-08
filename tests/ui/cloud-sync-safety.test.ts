import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { CloudSyncModal } from '../../src/renderer/components/sync/CloudSyncModal';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { translations } from '../../src/renderer/translations';

for (const language of ['ar', 'en'] as const) {
  test(`sync drafts and failed snapshots survive closing attempts in ${language}`, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    const previous = new Map(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries({ window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const oldAPI = Object.getOwnPropertyDescriptor(window, 'electronAPI');
    let closed = 0;
    let saved = 0;
    let snapshots = 0;
    let failCloud = true;
    let finish!: () => void;
    const ko = { serverUrl: 'https://example.invalid', username: '', password: '', deviceName: 'Fixture', autoSyncOnOpenClose: false };
    const cloud = { provider: 'webdav', enabled: false, remoteBackupFolder: 'Fixture', webdav: { url: '', username: '', password: '' } };
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      getAllBooks: async () => [], getAllNotes: async () => [], getCategoryTree: async () => [],
      cloudSync: {
        getKoSyncConfig: async () => ko, getCloudConfig: async () => cloud, listSnapshots: async () => [],
        saveKoSyncConfig: () => { saved++; return new Promise<void>(resolve => { finish = resolve; }); },
        saveCloudConfig: async () => { if (failCloud) throw new Error('fixture failure'); },
        createSnapshot: async () => { snapshots++; return { success: snapshots > 1, message: 'fixture result' }; },
      },
    } });
    let workspace!: ReturnType<typeof useWorkspace>;
    function Harness() { workspace = useWorkspace(); return createElement(CloudSyncModal, { isOpen: true, onClose: () => { closed++; } }); }
    const root = createRoot(window.document.getElementById('root')!);
    const change = async (input: Element, value: string) => act(async () => {
      const props = (input as unknown as Record<string, { onChange: (event: unknown) => void }>)[Object.keys(input).find(key => key.startsWith('__reactProps$'))!];
      props.onChange({ target: { value } });
    });
    const click = async (label: string) => act(async () => [...window.document.querySelectorAll('button')].find(button => button.textContent?.trim().startsWith(label))!.click());
    const escape = async () => act(async () => { const event = new window.Event('keydown', { bubbles: true, cancelable: true }); Object.assign(event, { key: 'Escape' }); window.document.dispatchEvent(event); });
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(Harness))));
      if (language === 'en') await act(async () => workspace.toggleLanguage());
      const username = window.document.querySelector('input[placeholder="e.g. reader_user"]')!;
      await change(username, 'مسودة draft');
      await escape();
      assert.equal(window.document.querySelectorAll('[role=dialog]').length, 2);
      await escape();
      assert.equal((username as HTMLInputElement).value, 'مسودة draft');
      assert.equal(closed, 0);
      await act(async () => window.document.querySelector<HTMLButtonElement>('[data-sync-save-ko]')!.click());
      await escape();
      assert.equal(closed, 0);
      assert.equal(saved, 1);
      assert.ok(window.document.body.textContent?.includes(translations[language].syncOperationBusy));
      await act(async () => finish());
      await click(translations[language].tabSnapshots);
      const description = window.document.querySelector(`input[placeholder="${translations[language].snapshotDescriptionPlaceholder}"]`)!;
      await change(description, 'ملاحظات snapshot');
      await click(translations[language].snapshotCreateBtn);
      assert.equal((description as HTMLInputElement).value, 'ملاحظات snapshot');
      await escape();
      assert.equal(window.document.querySelectorAll('[role=dialog]').length, 2);
      await click(translations[language].keepEditing);
      await click(translations[language].snapshotCreateBtn);
      assert.equal((description as HTMLInputElement).value, '');
      await click(translations[language].tabCloudStorage);
      await change(window.document.querySelector('input[placeholder="Baglib/Backups"]')!, 'Draft folder');
      await act(async () => window.document.querySelector<HTMLButtonElement>('[data-sync-save-cloud]')!.click());
      assert.ok(window.document.body.textContent?.includes(translations[language].syncOperationFailed));
      await escape();
      assert.equal(window.document.querySelectorAll('[role=dialog]').length, 2);
      await escape();
      failCloud = false;
      await act(async () => window.document.querySelector<HTMLButtonElement>('[data-sync-save-cloud]')!.click());
      await escape();
      assert.equal(closed, 1);
      assert.equal(snapshots, 2);
    } finally {
      await act(async () => root.unmount());
      if (oldAPI) Object.defineProperty(window, 'electronAPI', oldAPI); else Reflect.deleteProperty(window, 'electronAPI');
      for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    }
  });
}
