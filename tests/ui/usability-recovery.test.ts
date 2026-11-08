import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { NotesOverviewView } from '../../src/renderer/components/notes/NotesOverviewView';
import { SettingsDirectory } from '../../src/renderer/components/layout/SettingsDirectory';
import { StatusBar } from '../../src/renderer/components/layout/StatusBar';
import { translations } from '../../src/renderer/translations';

for (const language of ['ar', 'en'] as const) {
  test(`notes retain data on partial failure, retry safely, and settings work in ${language}`, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    const previous = new Map(['window', 'document', 'React', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries({ window, document: window.document, React, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const previousAPI = Object.getOwnPropertyDescriptor(window, 'electronAPI');
    let fail = false;
    let failKnowledge = false;
    let empty = false;
    const note = { id: 'retained', title: 'ملاحظة Test', content: 'Retained content', aliases: [], tags: [], createdAt: '2026-11-07', updatedAt: '2026-11-07' };
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      getAllBooks: async () => [], getAllNotes: async () => [], getCategoryTree: async () => [],
      studyNotes: { list: async () => { if (fail) throw new Error('fixture unavailable'); return empty ? [] : [note]; }, onChanged: () => () => {} },
      knowledge: { getAll: async () => { if (failKnowledge) throw new Error('fixture knowledge unavailable'); return []; } },
      knowledgeHistory: { comments: async () => [], commentCounts: async () => ({}) },
    } });
    let workspace!: ReturnType<typeof useWorkspace>;
    function Harness() { workspace = useWorkspace(); return createElement('div', { dir: workspace.dir }, createElement(NotesOverviewView), createElement(SettingsDirectory), createElement(StatusBar)); }
    const root = createRoot(window.document.getElementById('root')!);
    const reload = async () => act(async () => { window.dispatchEvent(new window.Event('baglib:notes-changed')); await new Promise(resolve => setTimeout(resolve, 15)); });
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(Harness))));
      await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
      if (language === 'en') await act(async () => workspace.toggleLanguage());
      assert.equal(window.document.querySelector('[dir]')?.getAttribute('dir'), language === 'ar' ? 'rtl' : 'ltr');
      assert.ok(window.document.querySelector('[data-study-note="retained"]'));
      fail = true;
      await reload();
      assert.ok(window.document.querySelector('[data-study-note="retained"]'));
      assert.ok(window.document.body.textContent?.includes(translations[language].studyLoadPersonalSource));
      assert.ok(!window.document.body.textContent?.includes(translations[language].studyNoResults));
      fail = false;
      await act(async () => [...window.document.querySelectorAll('button')].find(button => button.textContent?.trim() === translations[language].lookupRetry)!.click());
      assert.ok(!window.document.body.textContent?.includes(translations[language].studyLoadFailed));
      failKnowledge = true;
      await reload();
      assert.ok(window.document.querySelector('[data-study-note="retained"]'));
      assert.ok(window.document.body.textContent?.includes(translations[language].studyLoadKnowledgeSource));
      failKnowledge = false;
      await reload();
      assert.ok(window.document.querySelector('footer')?.textContent?.includes(translations[language].localLibraryStorage));
      assert.ok(!window.document.querySelector('footer')?.textContent?.includes(translations[language].localLibraryReady));
      const before = workspace.theme;
      await act(async () => window.document.querySelector<HTMLButtonElement>('[data-settings-entry="theme"]')!.click());
      assert.notEqual(workspace.theme, before);
      const search = window.document.querySelector(`input[aria-label="${translations[language].settingsSearch}"]`)!;
      const props = (search as unknown as Record<string, { onChange: (event: unknown) => void }>)[Object.keys(search).find(key => key.startsWith('__reactProps$'))!];
      await act(async () => props.onChange({ target: { value: language === 'ar' ? 'مُزَامَنَة' : 'synchronization' } }));
      assert.equal(window.document.querySelectorAll('[data-settings-entry]').length, 1);
      assert.ok(window.document.querySelector('[data-settings-entry="sync"]'));
      await act(async () => props.onChange({ target: { value: '' } }));
      await act(async () => window.document.querySelector<HTMLButtonElement>('[data-settings-entry="quran"]')!.click());
      assert.equal(workspace.viewMode, 'quran');
      empty = true;
      await reload();
      assert.ok(window.document.body.textContent?.includes(translations[language].studyNoResults));
    } finally {
      await act(async () => root.unmount());
      if (previousAPI) Object.defineProperty(window, 'electronAPI', previousAPI); else Reflect.deleteProperty(window, 'electronAPI');
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
      }
    }
  });
}
