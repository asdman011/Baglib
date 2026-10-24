import { it } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { EditionInput } from '../../src/renderer/components/library/EditionInput';
import { editionYearFallback } from '../../src/shared/utils/edition';
import { auditBook, MetadataAuditModal } from '../../src/renderer/components/library/MetadataAuditModal';
import { WorkspaceProvider } from '../../src/renderer/components/context/WorkspaceContext';
import { translations } from '../../src/renderer/translations';
import type { BookItem } from '../../src/shared/types/work';

const book: BookItem = { id: 'book', title: 'كتاب Knowledge', author: 'Jane Austen', publicationYear: 2021, isbn: '9780131103627', coverImage: 'data:image/png;base64,AA', description: 'Description', categories: ['Science'], tags: [], language: 'English', bookType: 'digital', lendingHistory: [] };

it('keeps a missing edition eligible for discovery even when its publication year is known', () => {
  const audit = auditBook(book);
  assert.equal(audit.edition, true);
  assert.equal(audit.missingCount, 1);
  assert.equal(audit.hasMissing, true);
  assert.equal(auditBook({ ...book, edition: '3rd Edition' }).hasMissing, false);
  assert.equal(editionYearFallback(book), '2021');
  assert.equal(editionYearFallback({ edition: 'الطبعة الثالثة', publicationYear: 2021 }), '');
  assert.equal(editionYearFallback({ publicationYear: '٢٠٢١' }), '٢٠٢١');
  for (const publicationYear of [undefined, '', 'unknown', 0, -1, Number.NaN, Number.POSITIVE_INFINITY, '2021-01-01', 2021.5]) {
    assert.equal(editionYearFallback({ publicationYear }), '', String(publicationYear));
  }
});

for (const language of ['ar', 'en'] as const) {
  it(`shows a temporary year without writing edition data and replaces it when fetched in ${language}`, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    Object.defineProperties(window.HTMLInputElement.prototype, { attachEvent: { value: () => {}, configurable: true }, detachEvent: { value: () => {}, configurable: true } });
    const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
    Object.defineProperty(globalThis, 'document', { value: window.document, configurable: true });
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true, writable: true });
    const root = createRoot(window.document.getElementById('root')!);
    const writes: string[] = [];
    const original = Object.freeze({ ...book });
    const render = (value: BookItem) => root.render(createElement('div', { dir: language === 'ar' ? 'rtl' : 'ltr' }, createElement(EditionInput, { book: value, onChange: edition => writes.push(edition), t: key => translations[language][key] })));
    try {
      await act(async () => render(original));
      let input = window.document.querySelector('input')!;
      assert.equal(input.value, '2021');
      assert.equal(window.document.querySelector('label')?.textContent, translations[language].bookEditionLabel);
      assert.ok(window.document.body.textContent?.includes(translations[language].editionYearFallbackHint));
      assert.ok(input.getAttribute('aria-describedby'));
      await act(async () => input.dispatchEvent(new window.Event('focusin', { bubbles: true })));
      assert.equal(input.value, '');
      assert.equal(input.getAttribute('placeholder'), '2021');
      await act(async () => input.dispatchEvent(new window.Event('focusout', { bubbles: true })));
      assert.equal(input.value, '2021');
      assert.equal(original.edition, undefined);
      assert.deepEqual(writes, []);
      await act(async () => render({ ...book, edition: language === 'ar' ? 'الطبعة الثالثة' : '3rd Edition' }));
      input = window.document.querySelector('input')!;
      assert.equal(input.value, language === 'ar' ? 'الطبعة الثالثة' : '3rd Edition');
      assert.equal(input.getAttribute('aria-describedby'), null);
      assert.equal(window.document.querySelector('p'), null);
    } finally {
      await act(async () => root.unmount());
      if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow); else Reflect.deleteProperty(globalThis, 'window');
      if (savedDocument) Object.defineProperty(globalThis, 'document', savedDocument); else Reflect.deleteProperty(globalThis, 'document');
    }
  });
}

it('fills a year-only book with the actual edition returned by missing-metadata lookup', async () => {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: window.document, configurable: true });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true, writable: true });
  let lookups = 0;
  const updates: BookItem[] = [];
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
    getAllBooks: async () => [], getAllNotes: async () => [], getCategoryTree: async () => [],
    discoverMetadata: async () => { lookups++; return { confidence: 1, isVerifiedMatch: true, edition: '3rd Edition' }; },
  } });
  const root = createRoot(window.document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(MetadataAuditModal, { isOpen: true, booksToAudit: [book], onClose: () => {}, onUpdateBook: updated => { updates.push(updated); } }))));
    const enrich = [...window.document.querySelectorAll('button')].find(button => button.textContent?.includes(translations.ar.autoEnrichAll));
    assert.ok(enrich);
    await act(async () => { enrich.click(); await new Promise(resolve => setTimeout(resolve, 1100)); });
    assert.equal(lookups, 1);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].edition, '3rd Edition');
    assert.equal(updates[0].publicationYear, 2021);
    assert.equal(auditBook(updates[0]).edition, false);
  } finally {
    await act(async () => root.unmount());
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (savedDocument) Object.defineProperty(globalThis, 'document', savedDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});
