import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { StudyInsightsService } from '../../src/main/services/statistics/study-insights.service';
import { orderStudyTasks } from '../../src/shared/study-insights';
import { StudyPlannerRepository } from '../../src/main/database/repositories/study-planner.repository';

const open = () => {
  const db = new Database(':memory:');
  runMigrations(db, migrations);
  return { db, insights: new StudyInsightsService(db) };
};

test('Quran is suggested first but an explicit user override wins', () => {
  const { db } = open();
  try {
    const tasks = new StudyPlannerRepository(db);
    const base = { title: 'QA', description: '', status: 'open' as const, startDate: null, dueDate: null, priority: 0, sortOrder: 0, references: [] };
    const ordinary = tasks.save({ ...base, priority: 3 });
    const quran = tasks.save({ ...base, references: [{ target: 'quran:hafs:1:1', label: 'الفاتحة' }] });
    assert.equal(orderStudyTasks([ordinary, quran], [])[0].id, quran.id);
    assert.equal(orderStudyTasks([ordinary, quran], [ordinary.id, quran.id])[0].id, ordinary.id);
  } finally { db.close(); }
});

test('session hours are grouped by subject without adding page dwell twice', () => {
  const { db, insights } = open();
  try {
    db.prepare("INSERT INTO category(id,name_ar,name_en) VALUES ('qa-subject','حديث','Hadith')").run();
    db.prepare("INSERT INTO work(id,title,primary_category_id) VALUES ('qa-book','Book','qa-subject')").run();
    db.prepare("INSERT INTO reading_session(id,work_id,started_at,ended_at,pages_read) VALUES ('qa-session','qa-book','2026-11-01T10:00:00','2026-11-01T11:00:00',12)").run();
    db.prepare("INSERT INTO reading_book_stat(id,title,subject) VALUES ('qa-book','Book','Hadith')").run();
    db.prepare("INSERT INTO reading_page_stat(id_book,page,start_time,duration) VALUES ('qa-book',1,1,100)").run();
    const summary = insights.summary(new Date(2026, 10, 1, 12));
    assert.equal(summary.timeSource, 'sessions');
    assert.equal(summary.seconds, 3600);
    assert.equal(summary.subjects[0].en, 'Hadith');
    assert.equal(summary.subjects[0].seconds, 3600);
    assert.equal(summary.secondsPerPage, 300);
    assert.equal(summary.secondsPerSession, 3600);
    assert.equal(summary.days[6].seconds, 3600);
  } finally { db.close(); }
});

test('empty states and page-dwell fallback do not invent session counts', () => {
  const { db, insights } = open();
  try {
    assert.equal(insights.summary().timeSource, 'none');
    assert.equal(insights.summary().secondsPerPage, null);
    assert.equal(insights.summary().sessionCount, null);
    db.prepare("INSERT INTO reading_book_stat(id,title,subject) VALUES ('qa','Book','Test')").run();
    db.prepare("INSERT INTO reading_page_stat(id_book,page,start_time,duration) VALUES ('qa',1,1,180)").run();
    const summary = insights.summary();
    assert.equal(summary.timeSource, 'dwell');
    assert.equal(summary.seconds, 180);
    assert.equal(summary.secondsPerSession, null);
  } finally { db.close(); }
});

test('goals and user-overridden task order persist in existing settings only', () => {
  const { db, insights } = open();
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const preferences = { dailyMinutes: 20, dailyPages: 5, taskOrder: ['later', 'quran', 'later'] };
    const saved = insights.savePreferences(preferences);
    assert.deepEqual(saved.taskOrder, ['later', 'quran']);
    assert.deepEqual(new StudyInsightsService(db).preferences(), saved);
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(), tables);
    assert.throws(() => insights.savePreferences({ ...preferences, dailyMinutes: -1 }));
  } finally { db.close(); }
});

test('word frequency normalizes derived forms and never changes canonical content', async () => {
  const { db, insights } = open();
  try {
    const canonical = 'العِلْمُ العلم مدرسة مدرسه BOOK book';
    db.prepare("INSERT INTO book_content_fts(book_id,page_number,content,normalized_content) VALUES ('book',1,?,?)").run(canonical, 'preexisting');
    db.prepare("INSERT INTO book_content_fts(book_id,page_number,content) VALUES ('other',1,'Other')").run();
    const result = await insights.words('book');
    assert.ok(result.words.some(item => item.word === 'العلم' && item.count === 2));
    assert.ok(result.words.some(item => item.word === 'book' && item.count === 2));
    assert.ok(result.words.some(item => item.word === 'مدرسة'));
    assert.ok(result.words.some(item => item.word === 'مدرسه'));
    assert.equal(result.indexedPages, 1);
    assert.equal((db.prepare("SELECT content FROM book_content_fts WHERE book_id='book'").get() as { content: string }).content, canonical);
    assert.equal((db.prepare("SELECT normalized_content FROM book_content_fts WHERE book_id='book'").get() as { normalized_content: string }).normalized_content, 'preexisting');
    assert.equal((await insights.words()).indexedPages, 2);
  } finally { db.close(); }
});

test('oversized indexed content is explicitly partial and bounded', async () => {
  const { db, insights } = open();
  try {
    db.prepare("INSERT INTO book_content_fts(book_id,page_number,content) VALUES ('big',1,?)").run('word '.repeat(50000));
    const result = await insights.words('big');
    assert.equal(result.partial, true);
    assert.ok(result.words.length <= 50);
  } finally { db.close(); }
});
