import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { bookVolumeIssue, nextBookVolume, relatedBookVolumes, volumeOrdinal } from '../../src/shared/book-volumes';
import type { BookItem } from '../../src/shared/types/work';

const first: BookItem = { id: 'volume-one', title: 'التاريخ', author: 'المؤلف', seriesTitle: 'تاريخ العالم', volumeNumber: '١', totalVolumes: 12, workType: 'book', bookType: 'digital', filePath: 'D:/books/one.pdf', coverImage: 'D:/covers/one.jpg', isbn: '9780134494166', readingProgress: 60, categories: [], tags: [], lendingHistory: [] };

test('book set grouping is explicit, author-scoped and naturally orders Arabic and Latin volume numbers', () => {
  const second = { ...first, id: 'two', volumeNumber: '٢' };
  const tenth = { ...first, id: 'ten', volumeNumber: '10' };
  const unrelated = { ...first, id: 'different-author', author: 'Another author' };
  const ungrouped = { ...first, id: 'no-set', seriesTitle: undefined };
  assert.deepEqual(relatedBookVolumes(first, [tenth, unrelated, ungrouped, second, first]).map(book => book.id), ['volume-one', 'two', 'ten']);
  assert.equal(relatedBookVolumes({ ...first, seriesTitle: undefined }, [first]).length, 0);
  assert.equal(volumeOrdinal('۱۲'), 12);
  assert.equal(bookVolumeIssue({ volumeNumber: 'II' }), null);
});

test('new volume drafts preserve set bibliography but never reuse file, identifiers, progress or loans', () => {
  const original = JSON.stringify(first);
  const next = nextBookVolume(first, [first, { ...first, id: 'three', volumeNumber: 3 }], 'new-volume');
  assert.equal(next.volumeNumber, '2');
  assert.equal(next.seriesTitle, first.seriesTitle);
  assert.equal(next.totalVolumes, 12);
  assert.equal(next.readingProgress, 0);
  for (const field of ['filePath', 'coverImage', 'isbn', 'fileHash', 'metadataProvenance'] as const) assert.equal(next[field], undefined);
  assert.deepEqual(next.lendingHistory, []);
  assert.equal(JSON.stringify(first), original);
});

test('volume values validate bounded counts and reject inconsistent numbers', () => {
  assert.equal(bookVolumeIssue({ totalVolumes: 3, volumeNumber: '٤' }), 'bookVolumesNumberExceedsTotal');
  for (const totalVolumes of [0, -1, NaN, Infinity, 1.5, 10001]) assert.equal(bookVolumeIssue({ totalVolumes }), 'bookVolumesTotalInvalid');
  for (const volumeNumber of [0, -1, '0', '-1', '1.5', '٠']) assert.equal(bookVolumeIssue({ volumeNumber }), 'bookVolumesNumberInvalid');
  assert.equal(bookVolumeIssue({ totalVolumes: 3, volumeNumber: '٣' }), null);
});

test('existing SQLite metadata stores multiple volumes without schema changes and supports clearing total count', () => {
  const database = createTestDatabase();
  const repository = new SqliteWorkRepository(database);
  try {
    const before = database.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const saved = repository.addBook(first);
    repository.addBook(nextBookVolume(saved, [saved], 'second-volume'));
    assert.equal(repository.getById(first.id)?.seriesTitle, first.seriesTitle);
    assert.equal(repository.getById(first.id)?.totalVolumes, 12);
    assert.equal(repository.getById('second-volume')?.volumeNumber, '2');
    assert.equal(repository.getById('second-volume')?.readingProgress, 0);
    repository.updateBook({ ...saved, totalVolumes: undefined });
    assert.equal(repository.getById(first.id)?.totalVolumes, undefined);
    assert.throws(() => repository.updateBook({ ...saved, totalVolumes: 0 }), /invalid-volume-metadata/);
    assert.equal(repository.getById(first.id)?.totalVolumes, undefined);
    assert.equal(repository.getAllWorks().filter(book => book.seriesTitle === first.seriesTitle).length, 2);
    assert.deepEqual(database.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all(), before);
  } finally { database.close(); }
});
