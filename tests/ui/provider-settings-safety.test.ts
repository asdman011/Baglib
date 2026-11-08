import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { ProviderSettingsModal } from '../../src/renderer/components/library/ProviderSettingsModal';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { translations } from '../../src/renderer/translations';
import { DEFAULT_SOURCE_URLS } from '../../src/shared/source-urls';

for (const language of ['ar', 'en'] as const) {
  test(`provider drafts, source updates and save failures survive dismissal attempts in ${language}`, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    const previous = new Map(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries({ window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const oldAPI = Object.getOwnPropertyDescriptor(window, 'electronAPI');
    let closed = 0;
    let saves = 0;
    let failLoad = false;
    let finishSource!: (value: unknown) => void;
    let finishSave!: () => void;
    const source = { file: DEFAULT_SOURCE_URLS, custom: false, updateUrl: 'https://example.invalid/original.json' };
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      getAllBooks: async () => [], getAllNotes: async () => [], getCategoryTree: async () => [],
      getProviderConfig: async () => { if (failLoad) throw new Error('Fixture load failure'); return [{ id: 'google-books', name: 'Test provider', nameAr: 'مزوّد تجريبي', enabled: true, priority: 1 }]; },
      updateProviderConfig: () => { saves++; return saves === 1 ? Promise.reject(new Error('Fixture save failure')) : new Promise<void>(resolve => { finishSave = resolve; }); },
      sources: { get: async () => source, update: () => new Promise(resolve => { finishSource = resolve; }) },
    } });
    let workspace!: ReturnType<typeof useWorkspace>;
    function Harness() { workspace = useWorkspace(); return createElement(ProviderSettingsModal, { isOpen: true, onClose: () => { closed++; } }); }
    const root = createRoot(window.document.getElementById('root')!);
    const props = (element: Element) => (element as unknown as Record<string, { onChange: (event: unknown) => void }>)[Object.keys(element).find(key => key.startsWith('__reactProps$'))!];
    const click = async (label: string) => act(async () => [...window.document.querySelectorAll('button')].find(button => button.textContent?.trim() === label)!.click());
    const escape = async () => act(async () => { const event = new window.Event('keydown', { bubbles: true, cancelable: true }); Object.assign(event, { key: 'Escape' }); window.document.dispatchEvent(event); });
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(Harness))));
      if (language === 'en') await act(async () => workspace.toggleLanguage());
      await act(async () => props(window.document.querySelector('input[type=checkbox]')!).onChange({ target: { checked: false } }));
      await escape();
      assert.equal(window.document.querySelectorAll('[role=dialog]').length, 2);
      await escape();
      assert.equal(closed, 0);
      assert.equal(window.document.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked, false);
      const address = window.document.querySelector(`input[aria-label="${translations[language].sourceUrlsAddress}"]`)!;
      await act(async () => props(address).onChange({ target: { value: 'https://example.invalid/new.json' } }));
      assert.equal([...window.document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === translations[language].providerSettingsSave)!.disabled, true);
      await escape();
      await click(translations[language].keepEditing);
      await click(translations[language].sourceUrlsUpdate);
      await escape();
      assert.equal(window.document.querySelectorAll('[role=dialog]').length, 1);
      assert.equal(closed, 0);
      await act(async () => finishSource({ ...source, updateUrl: 'https://example.invalid/new.json' }));
      await click(translations[language].providerSettingsSave);
      assert.ok(window.document.body.textContent?.includes(translations[language].settingsSaveFailed));
      assert.equal(closed, 0);
      await click(translations[language].providerSettingsSave);
      await escape();
      assert.equal(closed, 0);
      await act(async () => finishSave());
      await act(async () => new Promise(resolve => setTimeout(resolve, 750)));
      assert.equal(closed, 1);
      assert.equal(saves, 2);
      await act(async () => props(window.document.querySelector('input[type=checkbox]')!).onChange({ target: { checked: true } }));
      await escape();
      await click(translations[language].discardAndClose);
      assert.equal(closed, 2);
      assert.equal(saves, 2);
      await act(async () => root.render(null));
      failLoad = true;
      await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(Harness))));
      if (language === 'en') await act(async () => workspace.toggleLanguage());
      assert.ok(window.document.body.textContent?.includes(translations[language].settingsLoadFailed));
      assert.equal([...window.document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === translations[language].providerSettingsSave)!.disabled, true);
      assert.equal(saves, 2);
      await act(async () => root.render(null));
      failLoad = false;
      await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(Harness))));
      if (language === 'en') await act(async () => workspace.toggleLanguage());
      await act(async () => props(window.document.querySelector('input[type=checkbox]')!).onChange({ target: { checked: false } }));
      await click(translations[language].providerSettingsSave);
      await act(async () => root.render(null));
      await act(async () => { finishSave(); await new Promise(resolve => setTimeout(resolve, 750)); });
      assert.equal(closed, 2);
    } finally {
      await act(async () => root.unmount());
      if (oldAPI) Object.defineProperty(window, 'electronAPI', oldAPI); else Reflect.deleteProperty(window, 'electronAPI');
      for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    }
  });
}
