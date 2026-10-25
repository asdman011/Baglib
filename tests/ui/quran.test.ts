import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { QuranResourceView, QuranLibraryPanel, quranCategoryKeys } from '../../src/renderer/components/quran/QuranView';
import { NavigationRail } from '../../src/renderer/components/layout/NavigationRail';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { translations, type TranslationKey } from '../../src/renderer/translations';
import { QURAN_CATEGORIES, type QuranLibrary, type QuranResource } from '../../src/shared/types/quran';

const resource: QuranResource = { id: 'quran-script/86', category: 'quran-script', title: 'نَصّ القرآن — QPC <script>bad()</script>', sourcePath: '/resources/quran-script/86', tags: [], formats: [], related: [], restricted: false, fetchedAt: '', profile: { key: 'resource:86:unknown', qiraah: null, riwayah: null, tariq: null, numbering: null, segmentation: null, script: null, verified: false } };
const library: QuranLibrary = { resources: [resource], installed: [], jobs: [], directory: 'D:\\كتب\\Quran', hasMore: false, catalogStatus: 'cached-partial' };

for (const lang of ['ar', 'en'] as const) {
  const translate = (key: TranslationKey, params?: Record<string, string | number>) => {
    let text: string = translations[lang][key];
    for (const [name, value] of Object.entries(params || {})) text = text.replace(`{${name}}`, String(value));
    return text;
  };
  test(`resource cards preserve mixed-script titles safely and separate stored packs from reader readiness in ${lang}`, () => {
    const html = renderToStaticMarkup(createElement(QuranLibraryPanel, { library: { ...library, installed: [{ id: 'one', resource, digest: 'hash', bytes: 2048, files: [], installedAt: '', capability: 'stored' }] }, t: translate, lang, tab: 'installed', busy: false, onDownload() {}, onImport() {}, onRemove() {}, onCancel() {} }));
    const { document } = parseHTML(html);
    assert.equal(document.querySelector('script'), null);
    assert.ok(document.textContent === null || !html.includes('<script>bad()'));
    assert.ok(html.includes(translations[lang].quranStoredHint));
    assert.ok(html.includes(translations[lang].quranProfileUnverified));
    assert.equal(document.querySelector('h3')?.getAttribute('dir'), 'auto');
  });
  test(`failed downloads offer an explicit QUL retry with a localized error in ${lang}`, () => {
    const html = renderToStaticMarkup(createElement(QuranLibraryPanel, { library: { ...library, jobs: [{ id: 'failed', resourceId: resource.id, title: resource.title, state: 'failed', received: 10, total: 100, error: 'interrupted', updatedAt: '' }] }, t: translate, lang, tab: 'downloads', busy: false, onDownload() {}, onImport() {}, onRemove() {}, onCancel() {}, onRetry() {} }));
    assert.ok(html.includes(translations[lang].quranRetry));
    assert.ok(html.includes(translations[lang].quranInterrupted));
  });
  test(`Quran tab precedes Sunnah and resource management interactions work in ${lang}`, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: window.document });
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true });
    let refreshes = 0;
    let downloads = 0;
    let imports = 0;
    let subscribed = 0;
    let workspace!: ReturnType<typeof useWorkspace>;
    let state = { ...library, resources: [] as QuranResource[] };
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      getAllBooks: async () => [], getAllNotes: async () => [], getCategoryTree: async () => [], getAllTags: async () => [],
      quran: {
        library: async () => ({ ok: true, data: state }),
        onChanged: () => { subscribed++; return () => { subscribed--; }; },
        refresh: async () => { refreshes++; state = library; return { ok: true, data: null }; },
        download: async () => { downloads++; return { ok: true, data: 'one' }; },
        importFile: async () => { imports++; return { ok: true, data: null }; },
      },
    } });
    function Harness() { workspace = useWorkspace(); return createElement('div', null, createElement(NavigationRail), createElement(QuranResourceView)); }
    const root = createRoot(window.document.getElementById('root')!);
    const click = async (key: TranslationKey) => {
      const button = [...window.document.querySelectorAll('button')].find(node => node.textContent?.trim() === translations[lang][key]);
      assert.ok(button, key);
      await act(async () => button.click());
    };
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(Harness))));
      if (lang === 'en') await act(async () => workspace.toggleLanguage());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 180)); });
      assert.equal(window.document.querySelector('section')?.getAttribute('dir'), lang === 'ar' ? 'rtl' : 'ltr');
      const navigation = [...window.document.querySelectorAll('aside button')].map(node => node.textContent?.trim());
      assert.ok(navigation.indexOf(translations[lang].navQuran) < navigation.indexOf(translations[lang].navSunnah));
      assert.equal(window.document.querySelectorAll('select option').length, 14);
      assert.equal(refreshes, 0);
      await click('quranRefresh');
      assert.equal(refreshes, 1);
      await click('quranDownload');
      assert.equal(downloads, 1);
      await click('quranAllResources');
      await click('quranImport');
      assert.equal(imports, 1);
      assert.equal(subscribed, 1);
    } finally {
      await act(async () => root.unmount());
      assert.equal(subscribed, 0);
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else Reflect.deleteProperty(globalThis, 'window');
      if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else Reflect.deleteProperty(globalThis, 'document');
    }
  });
}

test('all Quran labels and placeholders have matching Arabic and English keys', () => {
  for (const key of Object.keys(translations.ar).filter(key => key.startsWith('quran') || key === 'navQuran') as TranslationKey[]) {
    assert.ok(translations.ar[key].length > 0);
    assert.ok(translations.en[key].length > 0, key);
    assert.deepEqual(translations.ar[key].match(/\{\w+\}/g), translations.en[key].match(/\{\w+\}/g));
  }
  assert.equal(Object.keys(quranCategoryKeys).length, QURAN_CATEGORIES.length);
});
