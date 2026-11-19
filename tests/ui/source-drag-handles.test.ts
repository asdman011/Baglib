import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { SunnahChapterView } from '../../src/renderer/components/sunnah/SunnahChapterView';
import { QuranPassageView } from '../../src/renderer/components/quran/QuranReaderView';
import { QuranAyahInspector } from '../../src/renderer/components/quran/QuranAyahInspector';
import { ZenSelectionMenu } from '../../src/renderer/components/reader/ZenSelectionMenu';
import { readSourceDrag, writeSourceDrag, createBookQuotePayload, SOURCE_DRAG_TYPE } from '../../src/shared/manuscript-transfer';

function setupDom() {
  const { window } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  const globals: Record<string, unknown> = {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    CustomEvent: window.CustomEvent,
    Event: window.Event,
    React,
    IS_REACT_ACT_ENVIRONMENT: true,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  };
  const previous = new Map(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  const root = createRoot(window.document.getElementById('root')!);
  const restore = () => {
    act(() => root.unmount());
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    }
  };
  return { window, root, restore };
}

function fakeDataTransfer() {
  const store = new Map<string, string>();
  return {
    store,
    dataTransfer: {
      setData: (type: string, value: string) => { store.set(type, value); },
      getData: (type: string) => store.get(type) ?? '',
      types: [] as string[],
    },
  };
}

function fireReactHandler(element: Element, handler: string, event: Record<string, unknown> = {}) {
  const key = Object.keys(element).find(name => name.startsWith('__reactProps$'));
  const props = key ? (element as unknown as Record<string, Record<string, unknown>>)[key] : undefined;
  const fn = props?.[handler] as ((e: Record<string, unknown>) => void) | undefined;
  assert.ok(fn, `missing React handler ${handler}`);
  fn({
    preventDefault: () => {},
    stopPropagation: () => {},
    currentTarget: element,
    target: element,
    ...event,
  });
}

const t = (key: string) => key;

describe('KEY-381: reader source drag handles', () => {
  it('renders a draggable hadith handle without making the article draggable', async () => {
    const { window, root, restore } = setupDom();
    try {
      await act(async () => root.render(createElement(SunnahChapterView, {
        chapter: {
          collection: 'bukhari',
          number: 1,
          title: { ar: 'كتاب بدء الوحي', en: 'Revelation' },
        } as never,
        hadiths: [{
          id: 'h1',
          number: '1',
          section: { number: '1', title: { ar: 'باب', en: 'Chapter' } },
          text: { ar: { isnad: '', matn: 'إنما الأعمال بالنيات', full: 'إنما الأعمال بالنيات' }, en: { isnad: '', matn: 'Actions are by intentions', full: 'Actions are by intentions' } },
          grade: { ar: '', en: '' },
        }] as never,
        showEnglish: true,
        single: false,
        t: t as never,
        onFocus: () => {},
      })));

      const article = window.document.querySelector('article.sunnah-hadith')!;
      assert.ok(article);
      assert.notEqual(article.getAttribute('draggable'), 'true', 'hadith article itself stays selectable, not draggable');

      const handle = window.document.querySelector('[data-source-drag-handle="hadith"]')!;
      assert.ok(handle);
      assert.equal(handle.getAttribute('draggable'), 'true');

      const { dataTransfer } = fakeDataTransfer();
      fireReactHandler(handle, 'onDragStart', { dataTransfer });
      const payload = readSourceDrag(dataTransfer);
      assert.equal(payload?.kind, 'hadith');
      assert.equal(payload?.props.url, 'sunnah:bukhari:1:h1');
      assert.ok((payload?.props as { text?: string }).text?.includes('إنما الأعمال بالنيات'));
    } finally {
      restore();
    }
  });

  it('renders a draggable ayah handle in QuranPassageView and QuranAyahInspector', async () => {
    const { window, root, restore } = setupDom();
    try {
      await act(async () => root.render(createElement(QuranPassageView, {
        passage: {
          profile: 'hafs',
          surah: 1,
          surahs: [{ number: 1, count: 7, arabic: 'الفاتحة', name: 'Al-Fatihah' }],
          ayahs: [{
            number: 1,
            words: [{ position: 1, text: 'بِسْمِ', marker: false }, { position: 2, text: 'اللَّهِ', marker: false }],
          }],
          next: null,
        } as never,
        t: t as never,
        lang: 'ar',
        onCopy: () => {},
        commentary: null,
        selected: null,
        showWords: false,
      })));

      const handle = window.document.querySelector('[data-source-drag-handle="ayah"]')!;
      assert.ok(handle);
      assert.equal(handle.getAttribute('draggable'), 'true');
      const { dataTransfer } = fakeDataTransfer();
      fireReactHandler(handle, 'onDragStart', { dataTransfer });
      const payload = readSourceDrag(dataTransfer);
      assert.equal(payload?.kind, 'ayah');
      assert.equal(payload?.props.url, 'quran:hafs:1:1');

      await act(async () => root.render(createElement(QuranAyahInspector, {
        details: { surah: 1, ayah: 2, profile: 'hafs', canonical: 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ', imlaey: null },
        reference: { surah: 1, ayah: 2 },
        surahName: 'الفاتحة',
        error: false,
        t: t as never,
        dir: 'rtl',
        onClose: () => {},
        onCopy: () => {},
        onStudy: () => {},
      })));
      const inspectorHandle = window.document.querySelector('[data-source-drag-handle="ayah"]')!;
      assert.ok(inspectorHandle);
      const inspectorTransfer = fakeDataTransfer();
      fireReactHandler(inspectorHandle, 'onDragStart', { dataTransfer: inspectorTransfer.dataTransfer });
      const inspectorPayload = readSourceDrag(inspectorTransfer.dataTransfer);
      assert.equal(inspectorPayload?.kind, 'ayah');
      assert.equal(inspectorPayload?.props.url, 'quran:hafs:1:2');
    } finally {
      restore();
    }
  });

  it('renders a draggable book selection handle in ZenSelectionMenu and allows mousedown without preventDefault', async () => {
    const { window, root, restore } = setupDom();
    try {
      await act(async () => root.render(createElement(ZenSelectionMenu, {
        selectedText: 'Selected passage from book',
        readingPage: 12,
        bookTitle: 'Test Book',
        onApplyHighlight: () => {},
        onSaveNote: () => {},
        onSaveQuote: () => {},
        onSaveQuestion: () => {},
        onOpenDictionary: () => {},
        onOpenKnowledgeCard: () => {},
        onOpenAI: () => {},
        onPlayTTS: () => {},
        onDragSourceStart: event => {
          writeSourceDrag(event.dataTransfer, createBookQuotePayload({ book: { id: 'b1', title: 'Test Book' }, text: 'Selected passage from book', page: 12 }));
        },
        onClose: () => {},
        t: t as never,
      })));

      const dialog = window.document.querySelector('[role="dialog"]')!;
      const handle = window.document.querySelector('[data-source-drag-handle="book"]')!;
      assert.ok(handle);
      assert.equal(handle.getAttribute('draggable'), 'true');

      // Outer menu mousedown must NOT preventDefault when target is the drag handle.
      let preventedOnHandle = false;
      fireReactHandler(dialog, 'onMouseDown', { target: handle, preventDefault: () => { preventedOnHandle = true; } });
      assert.equal(preventedOnHandle, false, 'mousedown on drag handle must not be preventDefaulted');

      const { dataTransfer, store } = fakeDataTransfer();
      fireReactHandler(handle, 'onDragStart', { dataTransfer });
      assert.ok(store.has(SOURCE_DRAG_TYPE));
      const payload = readSourceDrag(dataTransfer);
      assert.equal(payload?.kind, 'book-quote');
      assert.equal(payload?.props.url, 'book:b1#p=12');
    } finally {
      restore();
    }
  });
});
