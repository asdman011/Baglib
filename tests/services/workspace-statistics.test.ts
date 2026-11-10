import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { workspaceStatistics } from '../../src/main/services/statistics/workspace-statistics.service';

function open() {
  const db = new Database(':memory:');
  runMigrations(db, migrations);
  return db;
}

test('empty aggregate returns actual zeros and arrays without writing to the database', () => {
  const db = open();
  try {
    const before = db.prepare('SELECT total_changes() AS changes').get();
    const value = workspaceStatistics(db);
    assert.equal(value.inProgress, 0);
    assert.equal(value.completed, 0);
    for (const key of ['reading', 'knowledge', 'reviews', 'due', 'completions', 'subjects'] as const) assert.deepEqual(value[key], []);
    assert.deepEqual(db.prepare('SELECT total_changes() AS changes').get(), before);
  } finally { db.close(); }
});

test('aggregate uses actual dated page events, unique pages, canonical subjects and completion history', () => {
  const db = open();
  try {
    db.exec(`INSERT INTO category(id,name_ar,name_en) VALUES('subject','العِلْمُ Science','Science');
      INSERT INTO work(id,title,primary_category_id,reading_status) VALUES('book','كتاب Book','subject','reading');
      INSERT INTO work(id,title,reading_status) VALUES('old','Legacy complete','completed');
      INSERT INTO reading_book_stat(id,title) VALUES('book','كتاب Book');
      INSERT INTO reading_page_stat(id_book,page,start_time,duration) VALUES('book',1,1794304800,60),('book',1,1794304900,90),('book',2,1794305000,30);
      UPDATE work SET reading_status='completed' WHERE id='book';`);
    const result = workspaceStatistics(db);
    assert.equal(result.reading[0].seconds, 180);
    assert.equal(result.reading[0].pages, 2);
    assert.equal(result.reading[0].activeBooks, 1);
    assert.equal(result.inProgress, 0);
    assert.equal(result.completed, 2);
    assert.equal(result.completions.reduce((sum, point) => sum + point.value, 0), 1, 'legacy completion without a date is not invented');
    assert.ok(result.subjects.some(subject => subject.ar === 'العِلْمُ Science'));
  } finally { db.close(); }
});

test('knowledge omits trash and forecast omits suspended/deleted cards while retention counts actual ratings', () => {
  const db = open();
  try {
    db.exec(`INSERT INTO knowledge(id,knowledge_type,created_at,deleted_at) VALUES
      ('note','study_note','2026-11-10T10:00:00Z',NULL),('card','card','2026-11-10T10:00:00Z',NULL),
      ('suspended','card','2026-11-10T10:00:00Z',NULL),('deleted','card','2026-11-10T10:00:00Z','2026-11-10T11:00:00Z');
      INSERT INTO srs_state(knowledge_id,state,due_at) VALUES('card','review','2026-11-11T10:00:00Z'),('suspended','suspended','2026-11-11T10:00:00Z'),('deleted','review','2026-11-11T10:00:00Z');
      INSERT INTO srs_review_log(id,knowledge_id,reviewed_at,rating) VALUES('one','card','2026-11-10T10:00:00Z',1),('two','card','2026-11-10T10:00:00Z',3);`);
    const result = workspaceStatistics(db);
    assert.equal(result.knowledge[0].notes, 1);
    assert.equal(result.knowledge[0].cards, 2);
    assert.equal(result.due[0].count, 1);
    assert.equal(result.reviews[0].total, 2);
    assert.equal(result.reviews[0].retained, 1);
  } finally { db.close(); }
});

test('current book snapshots exclude trash while dated completion history remains available', () => {
  const db = open();
  try {
    db.exec(`INSERT INTO work(id,title,reading_status,deleted_at) VALUES ('trash','Book','reading','2026-11-10T10:00:00Z');`);
    assert.equal(workspaceStatistics(db).inProgress, 0);
    assert.deepEqual(workspaceStatistics(db).subjects, []);
  } finally { db.close(); }
});
