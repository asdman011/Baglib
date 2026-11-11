import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { BookDetailModal } from '../../src/renderer/components/library/BookDetailModal';
import { MetadataDiffModal } from '../../src/renderer/components/library/MetadataDiffModal';
import { EditionComparisonModal } from '../../src/renderer/components/library/EditionComparisonModal';
import { translations, type TranslationKey } from '../../src/renderer/translations';
import { bookCountLabel, restoredBookCountLabel } from '../../src/renderer/utils/book-count';
import type { BookItem } from '../../src/shared/types/work';

for (const language of ['ar', 'en'] as const) {
  test('book plurals cover zero, one, two, few, many and other in ' + language, () => {
    const t = (key: TranslationKey, params?: Record<string, string | number>) => Object.entries(params || {}).reduce((value, [name, replacement]) => value.replaceAll('{' + name + '}', String(replacement)), translations[language][key] as string);
    for (const count of [0, 1, 2, 3, 10, 11, 99, 100, 102]) {
      assert.ok(bookCountLabel(count, language, t));
      assert.ok(restoredBookCountLabel(count, language, t));
    }
    assert.equal(restoredBookCountLabel(3, language, t), language === 'ar' ? `تم استرجاع ${(3).toLocaleString(language)} كتب` : 'Restored 3 books');
    assert.equal(restoredBookCountLabel(2, language, t), language === 'ar' ? 'تم استرجاع كتابين' : 'Restored 2 books');
  });

  test('summary keeps canonical title, zoom, log and editor and diff applies selected fields in ' + language, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    const previous = new Map(['window', 'document', 'React', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries({ window, document: window.document, React, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const book: BookItem = { id: 'detail', title: 'كِتاب Knowledge', author: 'مؤلف Author', bookType: 'digital', filePath: 'D:/book.epub', coverImage: 'data:image/png;base64,AA', categories: [], tags: [], lendingHistory: [] };
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      getAllBooks: async () => [book], getAllNotes: async () => [], getCategoryTree: async () => [],
      getBookDetailSummary: async () => ({ notes: 2, cards: 61, editions: [] }),
      knowledgeHistory: { reading: async () => null },
    } });
    let workspace!: ReturnType<typeof useWorkspace>;
    function Harness() { workspace = useWorkspace(); return null; }
    const root = createRoot(window.document.getElementById('root')!);
    const button = (label: string) => [...window.document.querySelectorAll<HTMLButtonElement>('button')].find(element => element.textContent?.trim() === label || element.getAttribute('aria-label') === label)!;
    try {
      await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(Harness), createElement(BookDetailModal, { isOpen: true, book, isNew: false, onClose() {}, onSave() {}, onDelete() {} }))));
      if (language === 'en') await act(async () => workspace.toggleLanguage());
      assert.equal(window.document.querySelector('h1')?.textContent, book.title);
      assert.ok(window.document.querySelector('[data-detail-reading-log]'));
      assert.equal(window.document.querySelector('[data-detail-cards]')?.textContent, (61).toLocaleString(language));
      assert.ok(window.document.querySelector('[data-book-detail-overview]'));
      const before = window.document.querySelector<HTMLElement>('[data-cover-zoom]')!.style.width;
      await act(async () => button(translations[language].readerZoomIn).click());
      assert.notEqual(window.document.querySelector<HTMLElement>('[data-cover-zoom]')!.style.width, before);
      await act(async () => window.document.querySelector<HTMLButtonElement>('[data-detail-edit]')!.click());
      assert.ok(window.document.querySelector('input'));
      let applied: Partial<BookItem> = {};
      await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(MetadataDiffModal, { isOpen: true, currentBook: book, incomingWork: { workId: 'candidate', title: 'Incoming', authors: ['Another'], editions: [] }, onClose() {}, onApply(updates) { applied = updates; } }))));
      const checkboxes = window.document.querySelectorAll<HTMLInputElement>('[data-metadata-diff] input');
      assert.equal(checkboxes.length, 2);
      await act(async () => button(translations[language].diffDeselectAll).click());
      await act(async () => workspace.toggleDirection());
      assert.ok([...window.document.querySelectorAll<HTMLInputElement>('[data-metadata-diff] input')].every(input => !input.checked), 'Context updates retain field selection');
      await act(async () => button(translations[language].diffSelectAll).click());
      // Native checkbox change behavior is exercised by the Electron matrix.
      await act(async () => button(translations[language].diffApplySelected.replace('{count}', '2')).click());
      assert.equal(applied.author, 'Another');
      assert.ok(window.document.querySelector('[data-metadata-layout]'));
      const api = Object.getOwnPropertyDescriptor(window, 'electronAPI')!.value as Record<string, unknown>;
      const candidate = { id: 'edition', providerId: 'test', providerName: 'Open Library', title: book.title };
      api.enrichment = {
        findOnlineEditions: async () => ({ candidates: [candidate] }),
        computeDiffs: async () => ({ diffs: { title: { field: 'title', labelKey: 'titleLabel', currentValue: book.title, incomingValue: book.title, hasCurrent: true, hasIncoming: true, isDifferent: false } }, summary: { newFieldsCount: 0 } }),
      };
      await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(EditionComparisonModal, { isOpen: true, book, onClose() {}, onEnrichmentApplied() {} }))));
      assert.ok(window.document.querySelector('[data-metadata-diff] label')?.textContent?.includes(translations[language].diffFieldTitle));
      assert.equal(window.document.querySelector('[data-metadata-diff]')?.textContent?.includes('titleLabel'), false);
    } finally {
      await act(async () => root.unmount());
      for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    }
  });
}

test('all metadata dialogs share their chrome and both comparison paths use the shared diff', () => {
  for (const name of ['MetadataAuditModal', 'MetadataCandidatesModal', 'MetadataDiffModal', 'GeekMetadataModal', 'EditionComparisonModal']) {
    const source = fs.readFileSync('src/renderer/components/library/' + name + '.tsx', 'utf8');
    assert.ok(source.includes('<MetadataModalLayout'));
    assert.doesNotMatch(source, /(?:lang|language)\s*===\s*'ar'\s*\?\s*['"`]/);
  }
  for (const name of ['MetadataDiffModal', 'EditionComparisonModal']) assert.ok(fs.readFileSync('src/renderer/components/library/' + name + '.tsx', 'utf8').includes('<MetadataDiffView'));
});
