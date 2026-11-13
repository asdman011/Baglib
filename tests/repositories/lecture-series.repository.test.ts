import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { LectureSeriesRepository } from '../../src/main/database/repositories/lecture-series.repository';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { LectureLibrary } from '../../src/main/services/lectures/lecture-library';
import { nextSeriesLecture } from '../../src/shared/lecture-series';

function setup(filename = ':memory:') {
  const db = new Database(filename); db.pragma('foreign_keys=ON'); runMigrations(db, migrations);
  const works = new SqliteWorkRepository(db);
  const ids = ['First', 'الدرس الثاني', 'Third'].map(title => works.addBook({ title, workType: 'lecture', bookType: 'digital', digitalFormat: 'webm', filePath: 'D:/' + title + '.webm' }).id);
  return { db, works, ids, series: new LectureSeriesRepository(db) };
}
test('approved migration has exactly the series and ordered membership columns and constraints', () => {
  const { db, ids } = setup();
  try {
    assert.deepEqual((db.prepare('PRAGMA table_info(lecture_series)').all() as { name: string }[]).map(row => row.name), ['id', 'name', 'autoplay_next', 'created_at', 'updated_at']);
    assert.deepEqual((db.prepare('PRAGMA table_info(lecture_series_item)').all() as { name: string }[]).map(row => row.name), ['series_id', 'work_id', 'position']);
    db.prepare('INSERT INTO lecture_series VALUES (?,?,?,?,?)').run('a', 'Course', 0, '', '');
    db.prepare('INSERT INTO lecture_series VALUES (?,?,?,?,?)').run('b', 'Other', 0, '', '');
    db.prepare('INSERT INTO lecture_series_item VALUES (?,?,?)').run('a', ids[0], 0);
    assert.throws(() => db.prepare('INSERT INTO lecture_series_item VALUES (?,?,?)').run('b', ids[0], 1));
    assert.throws(() => db.prepare('INSERT INTO lecture_series_item VALUES (?,?,?)').run('missing', ids[1], 1));
    db.prepare('DELETE FROM lecture_series WHERE id=?').run('a');
    assert.ok(db.prepare('SELECT id FROM work WHERE id=?').get(ids[0]));
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM lecture_series_item').get() as { n: number }).n, 0);
  } finally { db.close(); }
});
test('create, rename, assign, move across series and reorder validate atomically', () => {
  const { db, works, ids, series } = setup();
  try {
    const group = series.create('سلسلة العلم'); assert.equal(group.autoplayNext, false);
    ids.forEach(id => series.assign(id, group.id));
    series.reorder(group.id, [ids[2], ids[0], ids[1]]);
    assert.deepEqual(series.list()[0].items.map(item => item.workId), [ids[2], ids[0], ids[1]]);
    assert.throws(() => series.reorder(group.id, [ids[0], ids[0], ids[1]]));
    assert.throws(() => series.reorder(group.id, [ids[0]]));
    const book = works.addBook({ title: 'A book', workType: 'book' });
    assert.throws(() => series.assign(book.id, group.id));
    const transcript = works.addBook({title:'Lecture PDF',workType:'lecture',bookType:'digital',digitalFormat:'PDF',filePath:'D:/lecture.pdf'});
    assert.throws(() => series.assign(transcript.id, group.id));
    assert.throws(() => series.assign(ids[0], 'missing'));
    assert.throws(() => series.assign(ids[0], ''));
    works.softDeleteBook(ids[0]);
    series.reorder(group.id, [ids[1], ids[2]]);
    works.restoreBook(ids[0]);
    series.update(group.id, { name: 'Renamed', autoplayNext: true });
    assert.throws(() => series.update(group.id, { autoplayNext: 'yes' }));
    assert.throws(() => series.create(' '));
    const other = series.create('Other'); series.assign(ids[0], other.id);
    assert.equal(series.list().find(item => item.id === group.id)?.items.length, 2);
    series.assign(ids[0], null); assert.equal(series.list().find(item => item.id === other.id)?.items.length, 0);
    series.remove(other.id); assert.ok(works.getById(ids[0]));
    db.prepare('DELETE FROM work WHERE id=?').run(ids[2]);
    assert.equal(series.list().find(item => item.id === group.id)?.items.length, 1);
  } finally { db.close(); }
});
test('order, completion and autoplay survive a database restart and next selection follows order', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'baglib-series-'));
  const filename = path.join(directory, 'test.db');
  let db: Database.Database | undefined;
  try {
    const initial = setup(filename); db = initial.db;
    const group = initial.series.create('Course'); initial.ids.forEach(id => initial.series.assign(id, group.id));
    initial.series.reorder(group.id, [...initial.ids].reverse()); initial.series.update(group.id, { autoplayNext: true });
    new LectureLibrary(db, directory).saveProgress(initial.ids[2], { position: 95, rate: 1, completed: true });
    db.close(); db = new Database(filename);
    const rows = new LectureSeriesRepository(db).list();
    assert.equal(rows[0].autoplayNext, true); assert.equal(rows[0].items[0].completed, true);
    assert.deepEqual(rows[0].items.map(item => item.workId), [...initial.ids].reverse());
    assert.equal(nextSeriesLecture(rows, initial.ids[2])?.next.workId, initial.ids[1]);
    assert.equal(nextSeriesLecture(rows, initial.ids[0]), null);
  } finally { if (db?.open) db.close(); rmSync(directory, { recursive: true, force: true }); }
});
