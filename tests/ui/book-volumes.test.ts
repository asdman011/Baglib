import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { BookVolumesPanel } from '../../src/renderer/components/library/BookVolumesPanel';
import { BookCoverThumbnail } from '../../src/renderer/components/library/BookCoverThumbnail';
import { translations, type TranslationKey } from '../../src/renderer/translations';
import type { BookItem } from '../../src/shared/types/work';

const book: BookItem = { id: 'one', title: 'الكتاب • Research', author: 'المؤلف', seriesTitle: 'مجموعة', volumeNumber: '١', totalVolumes: 3, bookType: 'physical', categories: [], tags: [], lendingHistory: [] };
for (const lang of ['ar', 'en'] as const) {
  const t = (key: TranslationKey, params?: Record<string, string | number>) => Object.entries(params || {}).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), translations[lang][key]);
  test(`volume panel exposes translated metadata, navigation and safe draft actions in ${lang}`, () => {
    const html = renderToStaticMarkup(createElement(BookVolumesPanel, { book, books: [book, { ...book, id: 'two', volumeNumber: '2' }], t, saved: true, onChange() {}, onOpen() {}, onAdd() {} }));
    const { document } = parseHTML(html);
    assert.equal(document.querySelectorAll('input').length, 3);
    assert.equal(document.querySelectorAll('[aria-current=true]').length, 1);
    assert.ok(html.includes(t('bookVolumeSetTitle')));
    assert.ok(html.includes(t('bookVolumeAdd')));
    assert.equal(document.querySelectorAll('[data-book-volume]').length, 2);
  });
}
test('search covers lazy-load without file referrers and retain an underlying fallback', () => {
  const { document } = parseHTML(renderToStaticMarkup(createElement(BookCoverThumbnail, { url: 'https://libgen.li/covers/test.jpg', title: book.title })));
  assert.equal(document.querySelector('img')?.getAttribute('loading'), 'lazy');
  assert.equal(document.querySelector('img')?.getAttribute('referrerPolicy'), 'no-referrer');
  assert.equal(document.querySelectorAll('svg').length, 1);
});
