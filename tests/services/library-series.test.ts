import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { LectureSeriesRepository } from '../../src/main/database/repositories/lecture-series.repository';
import { librarySeriesEntries } from '../../src/shared/library-series';

function fixture(run: (works: SqliteWorkRepository, series: LectureSeriesRepository) => void) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys=ON'); runMigrations(db, migrations);
  try { run(new SqliteWorkRepository(db), new LectureSeriesRepository(db)); } finally { db.close(); }
}
const add = (works: SqliteWorkRepository, id: string, title: string, extra = {}) => works.addBook({ id, title, workType: 'lecture', bookType: 'digital', filePath: '/media/' + id + '.mp4', digitalFormat: 'mp4', ...extra });

test('library series query collapses before pagination, follows explicit order and uses the first cover', () => fixture((works, series) => {
  add(works, 'first', 'Lesson 10', { coverImage: '/first.png' }); add(works, 'second', 'درس ٢'); add(works, 'single', 'Single');
  const group = series.create('عِلْم Mixed course');
  series.assign('second', group.id); series.assign('first', group.id);
  const books = works.getAllWorks();
  const entries = librarySeriesEntries(books, series.list());
  assert.equal(entries.length, 2);
  const entry = entries.find(entry => entry.series)!;
  assert.equal(entry.series!.title, group.name);
  assert.deepEqual(entry.series!.items.map(item => item.id), ['second', 'first']);
  assert.equal(entry.book.coverImage, undefined, 'a later cover does not replace the first item cover');
  series.reorder(group.id, ['first', 'second']);
  assert.equal(librarySeriesEntries(books, series.list()).find(entry => entry.series)!.book.coverImage, '/first.png');
}));

test('individual query results stay individually accessible during search and hidden members stay absent', () => fixture((works, series) => {
  add(works, 'one', 'عِلْم Lesson 1'); add(works, 'two', 'Lesson 2');
  const group = series.create('Course'); series.assign('one', group.id); series.assign('two', group.id);
  const found = works.getPaginatedWorks({ search: 'Lesson 2' }).items;
  assert.deepEqual(librarySeriesEntries(found, series.list(), works.getAllWorks(), true).map(entry => entry.book.id), ['two']);
  works.softDeleteBook('one');
  const entries = librarySeriesEntries(works.getAllWorks(), series.list());
  assert.deepEqual(entries[0].series!.items.map(item => item.id), ['two']);
  series.remove(group.id);
  assert.equal(librarySeriesEntries(works.getAllWorks(), series.list())[0].series, undefined);
}));

test('podcast/video/lecture seriesTitle reuse existing metadata and order Arabic ordinals, preserving names', () => fixture((works, series) => {
  for (const type of ['podcast', 'video', 'lecture']) {
    add(works, type + '-10', 'Episode 10', { workType: type, seriesTitle: 'سلسلة Series', volumeNumber: '١٠' });
    add(works, type + '-2', 'Episode 2', { workType: type, seriesTitle: 'سلسلة Series', volumeNumber: '٢' });
  }
  add(works, 'unassigned', 'Standalone', { workType: 'podcast' });
  add(works, 'book', 'Book', { workType: 'book', seriesTitle: 'سلسلة Series' });
  const entries = librarySeriesEntries(works.getAllWorks(), series.list());
  assert.equal(entries.length, 5);
  for (const entry of entries.filter(entry => entry.series)) {
    assert.equal(entry.series!.title, 'سلسلة Series');
    assert.ok(entry.series!.items[0].id.endsWith('-2'));
    assert.ok(entry.series!.items[1].id.endsWith('-10'));
  }
}));

test('explicit membership overrides title metadata, filters still group once and empty series emit no entry', () => fixture((works, series) => {
  add(works, 'one', 'One', { seriesTitle: 'Metadata' }); add(works, 'two', 'Two', { seriesTitle: 'Metadata' });
  const group = series.create('Explicit'); series.create('Empty'); series.assign('two', group.id); series.assign('one', group.id);
  const books = works.getAllWorks();
  const entries = librarySeriesEntries(books.filter(book => book.id === 'one'), series.list(), books);
  assert.equal(entries.length, 1); assert.equal(entries[0].series!.title, 'Explicit');
  assert.deepEqual(entries[0].series!.items.map(item => item.id), ['two', 'one']);
}));
