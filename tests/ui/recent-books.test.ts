import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recentlyImportedBooks, recentlyOpenedBooks, recentTimestamp } from '../../src/shared/recent-books';
import type { BookItem } from '../../src/shared/types/work';

const book = (id: string, createdAt = '2026-11-12T10:00:00Z', extra: Partial<BookItem> = {}): BookItem => ({
  id, title: id, author: '', bookType: 'digital', filePath: id + '.pdf', createdAt, ...extra,
});

test('opened orders existing works by latest activity, merges duplicates and excludes unread/deleted works', () => {
  const books = [book('a'), book('b'), book('unread'), book('deleted', undefined, { deletedAt: 'today' })];
  const activity = [
    { workId: 'a', lastOpenedAt: 100 }, { workId: 'b', lastOpenedAt: 200 },
    { workId: 'a', lastOpenedAt: 300 }, { workId: 'missing', lastOpenedAt: 400 },
    { workId: 'deleted', lastOpenedAt: 500 }, { workId: 'unread', lastOpenedAt: NaN },
  ];
  assert.deepEqual(recentlyOpenedBooks(books, activity).map(b => b.id), ['a', 'b']);
  assert.equal(books[0].id, 'a');
});

test('opened uses deterministic ties and rejects nonpositive or invalid activity', () => {
  assert.deepEqual(recentlyOpenedBooks([book('b'), book('a'), book('c')], [
    { workId: 'a', lastOpenedAt: 100 }, { workId: 'b', lastOpenedAt: 100 },
    { workId: 'c', lastOpenedAt: 0 },
  ]).map(b => b.id), ['a', 'b']);
  assert.deepEqual(recentlyOpenedBooks([book('a')], []), []);
});

test('import window is anchored to latest digital creation with inclusive ten-minute boundary', () => {
  const books = [book('old', '2026-11-12T09:49:59Z'), book('new'), book('edge', '2026-11-12 09:50:00'),
    book('physical', '2026-11-13T10:00:00Z', { bookType: 'physical' }),
    book('invalid', 'broken'), book('no-file', undefined, { filePath: undefined }),
    book('deleted', '2026-11-13T10:00:00Z', { deletedAt: 'today' })];
  assert.deepEqual(recentlyImportedBooks(books).map(b => b.id), ['new', 'edge']);
  assert.equal(books[0].id, 'old');
});

test('import grouping has no transitive window expansion and survives older libraries', () => {
  assert.deepEqual(recentlyImportedBooks([book('a'), book('b', '2026-11-12T09:51:00Z'), book('c', '2026-11-12T09:42:00Z')]).map(b => b.id), ['a', 'b']);
  assert.deepEqual(recentlyImportedBooks([book('missing', undefined, { createdAt: undefined })]), []);
  assert.deepEqual(recentlyImportedBooks([]), []);
  assert.equal(recentTimestamp('2026-11-12 10:00:00'), recentTimestamp('2026-11-12T10:00:00Z'));
});
