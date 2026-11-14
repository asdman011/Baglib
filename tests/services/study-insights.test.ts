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

test('recent edits retain titles and untitled types, exclude trash and missing dates, and return ten latest', () => {
  const { db, insights } = open();
  try {
    assert.deepEqual(insights.summary().edits, []);
    const insert = db.prepare('INSERT INTO knowledge(id,knowledge_type,updated_at,deleted_at) VALUES (?,?,?,?)');
    for (let index = 0; index < 12; index++) insert.run(`edit-${index}`, index === 11 ? 'study_note' : 'highlight', `2026-11-${String(index + 1).padStart(2, '0')}T12:00:00Z`, null);
    const title = '\u062a\u0623\u0645\u0644 Faith';
    db.prepare('INSERT INTO study_note_detail(knowledge_id,title,content) VALUES (?,?,?)').run('edit-11', title, 'body');
    insert.run('trash', 'study_note', '2026-11-14T12:00:00Z', '2026-11-14');
    insert.run('undated', 'quote', null, null);
    const edits = insights.summary().edits;
    assert.equal(edits.length, 10);
    assert.deepEqual(edits[0], { id: 'edit-11', kind: 'study_note', title, updatedAt: '2026-11-12T12:00:00Z' });
    assert.deepEqual(edits.slice(1).map(item => item.id), [10,9,8,7,6,5,4,3,2].map(index => `edit-${index}`));
    assert.ok(edits.slice(1).every(item => item.kind === 'highlight' && item.title === null));
    db.prepare("UPDATE study_note_detail SET title='   ' WHERE knowledge_id='edit-11'").run();
    assert.equal(insights.summary().edits[0].title, '   ');
  } finally { db.close(); }
});

test('recent reflections return ten current notes ordered by edits, preserve titles and bound excerpts', () => {
  const { db, insights } = open();
  try {
    assert.deepEqual(insights.summary().reflections, []);
    for (let index = 0; index < 12; index++) {
      const id = `reflection-${index}`;
      db.prepare('INSERT INTO knowledge(id,knowledge_type,updated_at) VALUES (?,?,?)').run(id, 'study_note', `2026-11-${String(index + 1).padStart(2, '0')}T12:00:00Z`);
      db.prepare('INSERT INTO study_note_detail(knowledge_id,title,content) VALUES (?,?,?)').run(id, `Faith ${index}`, '\u062a'.repeat(350));
    }
    db.prepare("UPDATE knowledge SET deleted_at='2026-11-14' WHERE id='reflection-11'").run();
    const reflections = insights.summary().reflections;
    assert.equal(reflections.length, 10);
    assert.deepEqual(reflections.map(note => note.id), [10,9,8,7,6,5,4,3,2,1].map(index => `reflection-${index}`));
    assert.equal(reflections[0].title, 'Faith 10');
    assert.equal(reflections[0].content, '\u062a'.repeat(300));
  } finally { db.close(); }
});

test('legacy recent reflections skip conversion markers and malformed rows and bound excerpts', () => {
  const { db, insights } = open();
  try {
    const insert = db.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)');
    const legacy = (id: string, value: unknown, date: string) => insert.run(`study.note.v1:${id}`, JSON.stringify(value), date);
    legacy('valid', { id: 'valid', title: '\u0639\u0644\u0645 Knowledge', content: 'x'.repeat(350) }, '2026-11-10');
    legacy('untitled', { id: 'untitled', content: 'Body' }, '2026-11-11');
    legacy('converted', { id: 'converted', content: 'Old body' }, '2026-11-12');
    insert.run('study.note.converted:converted', 'true', '2026-11-12');
    insert.run('study.note.v1:broken', '{invalid', '2026-11-13');
    legacy('invalid', { id: 42, content: 'Body' }, '2026-11-13');
    legacy('missing', { id: 'missing' }, '2026-11-13');
    assert.deepEqual(insights.summary().reflections, [
      { id: 'untitled', title: '', content: 'Body' },
      { id: 'valid', title: '\u0639\u0644\u0645 Knowledge', content: 'x'.repeat(300) },
    ]);
  } finally { db.close(); }
});

const reviewFixture = (db: Database.Database, id: string, workId: string | null, duration: number | null) => {
  db.prepare("INSERT OR IGNORE INTO knowledge(id,knowledge_type,work_id) VALUES (?,'card',?)").run(id, workId);
  db.prepare("INSERT OR IGNORE INTO card_detail(knowledge_id,front,back,source_kind) VALUES (?,'Question','Answer','book')").run(id);
  db.prepare("INSERT INTO srs_review_log(id,knowledge_id,reviewed_at,rating,duration_ms) VALUES (?,?,'2026-11-14T12:00:00Z',3,?)").run(`review-${id}-${duration}`, id, duration);
};

test('review durations use the linked work primary subject once per review including fractional seconds', () => {
  const { db, insights } = open();
  try {
    db.prepare("INSERT INTO category(id,name_ar,name_en) VALUES ('revision-topic','حديث','Hadith'),('other-topic','فقه','Fiqh')").run();
    db.prepare("INSERT INTO work(id,title,primary_category_id) VALUES ('revision-book','Book','revision-topic')").run();
    reviewFixture(db, 'linked', 'revision-book', 3600000);
    reviewFixture(db, 'linked', 'revision-book', 1250);
    reviewFixture(db, 'second', 'revision-book', 1800000);
    assert.deepEqual(insights.summary().subjects, [{ ar: 'حديث', en: 'Hadith', seconds: 0, revisionSeconds: 5401.25 }]);
    assert.equal(insights.summary().timeSource, 'none');
  } finally { db.close(); }
});

test('unlinked, uncategorized and detached cards share the existing Uncategorized bucket', () => {
  const { db, insights } = open();
  try {
    db.prepare("INSERT INTO work(id,title) VALUES ('no-category','Book'),('deleted-book','Deleted')").run();
    reviewFixture(db, 'unlinked', null, 1000);
    db.prepare("UPDATE card_detail SET source_kind='quran',source_ref='quran:hafs:1:1' WHERE knowledge_id='unlinked'").run();
    reviewFixture(db, 'no-topic', 'no-category', 2000);
    reviewFixture(db, 'detached', 'deleted-book', 3000);
    db.prepare("DELETE FROM work WHERE id='deleted-book'").run();
    assert.deepEqual(insights.summary().subjects, [{ ar: null, en: null, seconds: 0, revisionSeconds: 6 }]);
  } finally { db.close(); }
});

test('revision time never changes reading totals, page averages or daily reading goals', () => {
  const { db, insights } = open();
  try {
    db.prepare("INSERT INTO work(id,title) VALUES ('both','Book')").run();
    db.prepare("INSERT INTO reading_session(id,work_id,started_at,ended_at,pages_read) VALUES ('reading','both','2026-11-14T10:00:00','2026-11-14T11:00:00',12)").run();
    reviewFixture(db, 'both-card', 'both', 0);
    const before = insights.summary(new Date(2026, 10, 14, 12));
    reviewFixture(db, 'both-card', 'both', 1800000);
    const after = insights.summary(new Date(2026, 10, 14, 12));
    assert.deepEqual(after, { ...before, subjects: [{ ...before.subjects[0], revisionSeconds: 1800 }] });
    db.prepare('DELETE FROM reading_session').run();
    db.prepare("INSERT INTO reading_book_stat(id,title) VALUES ('both','Book')").run();
    db.prepare("INSERT INTO reading_page_stat(id_book,page,start_time,duration) VALUES ('both',1,1,60)").run();
    assert.equal(insights.summary().seconds, 60);
    assert.equal(insights.summary().subjects[0].revisionSeconds, 1800);
  } finally { db.close(); }
});

test('trashed cards and missing, zero or negative review durations are excluded', () => {
  const { db, insights } = open();
  try {
    reviewFixture(db, 'trash', null, 3600000);
    db.prepare("UPDATE knowledge SET deleted_at='2026-11-14' WHERE id='trash'").run();
    reviewFixture(db, 'missing', null, null);
    reviewFixture(db, 'zero', null, 0);
    reviewFixture(db, 'negative', null, -1000);
    assert.deepEqual(insights.summary().subjects, []);
    db.prepare("UPDATE knowledge SET deleted_at=NULL WHERE id='trash'").run();
    assert.equal(insights.summary().subjects[0].revisionSeconds, 3600);
  } finally { db.close(); }
});
