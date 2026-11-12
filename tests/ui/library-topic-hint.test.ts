import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { translations } from '../../src/renderer/translations';
import { booksWithoutTopic, getAvailableTopicsWithCounts } from '../../src/renderer/components/library/library-filter-model';

const book = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: id, author: 'A', tags: [], ...extra }) as never;

// KEY-328: a topic filter that finds nothing explains that new books have no topic yet.
test('books without a category or topic tag are found; the #new marker is not a topic', () => {
  const books = [
    book('plain'),
    book('new-only', { tags: ['#جديد', '#new'] }),
    book('categorized', { primaryCategory: { id: 'c1' } }),
    book('in-list', { categories: ['c2'] }),
    book('tagged', { tags: ['#فقه'] }),
  ];
  assert.deepEqual(booksWithoutTopic(books).map((b: { id: string }) => b.id), ['plain', 'new-only']);
});

test('topic names sort in the interface language when counts tie', () => {
  const categories = [{ id: 'b', nameAr: 'ب', nameEn: 'Beta' }, { id: 'a', nameAr: 'أ', nameEn: 'Alpha' }];
  assert.deepEqual(getAvailableTopicsWithCounts([], categories, 'en').map(topic => topic.name), ['Alpha', 'Beta']);
});

test('the hint has every Arabic plural form, and the rail has no hardcoded more/less text', () => {
  for (const key of ['libraryTopicEmptyHint_zero', 'libraryTopicEmptyHint_one', 'libraryTopicEmptyHint_two', 'libraryTopicEmptyHint_few', 'libraryTopicEmptyHint_many', 'libraryTopicEmptyHint_other'] as const) {
    assert.ok(translations.ar[key] && translations.en[key], key);
  }
  for (const n of [0, 1, 2, 3, 11, 100]) {
    const key = `libraryTopicEmptyHint_${new Intl.PluralRules('ar').select(n)}` as keyof typeof translations.ar;
    assert.ok(translations.ar[key], `Arabic plural for ${n}`);
  }
  const rail = fs.readFileSync(path.resolve('src/renderer/components/library/LibraryFilterRail.tsx'), 'utf8');
  assert.equal(rail.includes('عرض أقل'), false);
  assert.equal(rail.includes('المزيد ('), false);
  assert.equal(rail.includes(': ${filterState.selectedReadingStatus}'), false, 'status chip shows a translated label');
});
