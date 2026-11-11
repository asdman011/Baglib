import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { ReadingLogService } from '../../src/main/services/reading-log';

// KEY-241 acceptance: automatic Reading Log fields match reading_session, and self-made entries persist.
const setup = () => {
  const db = createTestDatabase();
  const work = new SqliteWorkRepository(db).addBook({ title: 'المقدمة', author: 'ابن خلدون', language: 'ar' });
  const add = (id: string, start: string, minutes: number, pages: number) =>
    db.prepare('INSERT INTO reading_session(id,work_id,started_at,ended_at,pages_read) VALUES(?,?,?,?,?)').run(id, work.id, start, new Date(Date.parse(start) + minutes * 60000).toISOString(), pages);
  return { db, workId: work.id, add, service: new ReadingLogService(db) };
};

test('automatic fields are computed from reading_session', () => {
  const { workId, add, service } = setup();
  // Read on the 1st, 2nd and 3rd, skip the 4th and 5th, read again on the 6th and 7th.
  add('s1', '2026-11-01T09:00:00Z', 30, 10);
  add('s2', '2026-11-02T09:00:00Z', 20, 8);
  add('s3', '2026-11-03T09:00:00Z', 10, 2);
  add('s4', '2026-11-06T09:00:00Z', 40, 20);
  add('s5', '2026-11-07T21:00:00Z', 60, 30);
  const log = service.read(workId);
  assert.equal(log.source, 'sessions');
  assert.equal(log.sessions.length, 5);
  assert.equal(log.seconds, (30 + 20 + 10 + 40 + 60) * 60);
  assert.equal(log.pages, 10 + 8 + 2 + 20 + 30);
  assert.equal(log.secondsPerPage, log.seconds / log.pages);
  assert.equal(log.firstRead, '2026-11-01T09:00:00Z');
  assert.equal(Date.parse(log.lastRead!), Date.parse('2026-11-07T22:00:00Z'));
  assert.equal(log.skippedDays, 2, 'the 4th and 5th');
  assert.equal(log.streak, 2, 'the run that ends on the last reading day: the 6th and 7th');
});

test('a session that never ended, or ended before it started, is ignored', () => {
  const { db, workId, add, service } = setup();
  add('ok', '2026-11-01T09:00:00Z', 15, 5);
  db.prepare('INSERT INTO reading_session(id,work_id,started_at,ended_at,pages_read) VALUES(?,?,?,?,?)').run('open', workId, '2026-11-02T09:00:00Z', null, 3);
  db.prepare('INSERT INTO reading_session(id,work_id,started_at,ended_at,pages_read) VALUES(?,?,?,?,?)').run('backwards', workId, '2026-11-03T09:00:00Z', '2026-11-03T08:00:00Z', 3);
  const log = service.read(workId);
  assert.deepEqual(log.sessions.map(row => row.id), ['ok']);
  assert.equal(log.pages, 5);
});

test('self-made reflections persist and can be edited', () => {
  const { workId, service } = setup();
  service.save({ workId, entryDate: '2026-11-07', mood: 'متأمل — reflective', difficulty: 4, rating: 5, review: 'مراجعة شخصية', recommendations: 'لطلاب التاريخ', lessons: 'العمران سنن' });
  let log = service.read(workId);
  assert.equal(log.reflections.length, 1);
  const saved = log.reflections[0];
  assert.deepEqual({ mood: saved.mood, difficulty: saved.difficulty, rating: saved.rating, review: saved.review, recommendations: saved.recommendations, lessons: saved.lessons, entryDate: saved.entryDate },
    { mood: 'متأمل — reflective', difficulty: 4, rating: 5, review: 'مراجعة شخصية', recommendations: 'لطلاب التاريخ', lessons: 'العمران سنن', entryDate: '2026-11-07' });

  service.save({ id: saved.id, workId, entryDate: '2026-11-07', mood: 'مسرور', difficulty: 3, rating: 4, review: 'مراجعة معدلة', recommendations: '', lessons: '' });
  log = service.read(workId);
  assert.equal(log.reflections.length, 1, 'editing updates the same entry');
  assert.equal(log.reflections[0].review, 'مراجعة معدلة');
  assert.equal(log.reflections[0].rating, 4);
});

test('invalid reflection input is refused', () => {
  const { workId, service } = setup();
  assert.throws(() => service.save({ workId, entryDate: '2026-02-30', mood: '', review: '', recommendations: '', lessons: '' }), /invalid-request/);
  assert.throws(() => service.save({ workId, entryDate: '2026-11-07', mood: '', rating: 6, review: '', recommendations: '', lessons: '' }), /invalid-request/);
});
