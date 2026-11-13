import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { StudyPlannerRepository } from '../../src/main/database/repositories/study-planner.repository';
import { addCivilDays, calendarParts, civilDate, parseCivilDate, plannerRange, plannerReferenceTarget, validateTask, type StudyTaskInput } from '../../src/shared/study-planner';
import { calculateHijriDate } from '../../src/shared/athan-calculator';

const input = (): StudyTaskInput => ({ title: 'مُراجعة — Review', description: 'النص الأصلي', status: 'open', startDate: null, dueDate: null, priority: 0, sortOrder: 0, references: [] });
const open = () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  return { db, tasks: new StudyPlannerRepository(db) };
};

test('planner migration is idempotent and has the approved sixteen columns', () => {
  const { db } = open();
  try {
    assert.equal(runMigrations(db, migrations), 0);
    assert.equal(db.prepare('PRAGMA table_info(study_task)').all().length, 16);
  } finally { db.close(); }
});

test('completion, reopen and optimistic edit protection preserve original text', () => {
  const { db, tasks } = open();
  try {
    const saved = tasks.save(input());
    assert.equal(saved.title, input().title);
    assert.equal(saved.description, input().description);
    const complete = tasks.save({ ...saved, status: 'completed', expectedUpdatedAt: saved.updatedAt });
    assert.ok(complete.completedAt);
    assert.throws(() => tasks.save({ ...saved, title: 'stale', expectedUpdatedAt: saved.updatedAt }), /conflict/);
    assert.throws(() => tasks.remove(saved.id, saved.updatedAt), /conflict/);
    const reopened = tasks.save({ ...complete, status: 'open', expectedUpdatedAt: complete.updatedAt });
    assert.equal(reopened.completedAt, null);
    tasks.remove(reopened.id, reopened.updatedAt);
    assert.equal(tasks.list().length, 0);
  } finally { db.close(); }
});

test('book deletion never deletes planner tasks or their label snapshots', () => {
  const { db, tasks } = open();
  try {
    db.prepare("INSERT INTO work(id,title) VALUES ('planner-book','كتاب')").run();
    const saved = tasks.save({ ...input(), references: [{ target: 'book:planner-book', label: 'كتاب' }] });
    db.prepare("DELETE FROM work WHERE id='planner-book'").run();
    assert.equal(tasks.list()[0].id, saved.id);
    assert.deepEqual(tasks.list()[0].references, saved.references);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally { db.close(); }
});

test('tasks and multiple source-specific references survive database reopen', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-planner-'));
  const filename = path.join(directory, 'test.sqlite');
  let db = new Database(filename);
  try {
    runMigrations(db, migrations);
    const saved = new StudyPlannerRepository(db).save({ ...input(), references: [
      { target: 'quran:warsh:2:1', label: 'البقرة', scope: 'surah' },
      { target: 'note:reflection', label: 'Reflection' },
      { target: 'sunnah:Bukhari:1:Bukhari-1-1', label: 'حديث' },
    ] });
    db.close(); db = new Database(filename);
    assert.deepEqual(new StudyPlannerRepository(db).list()[0], saved);
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  } finally { db.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('validation rejects impossible dates, stale identities, invalid links and reversed ranges', () => {
  assert.equal(plannerReferenceTarget({ target: 'quran:warsh:2:255', label: 'البقرة', scope: 'surah' }), 'quran:warsh:2:1');
  for (const change of [ { title: '  ' }, { startDate: '2026-02-30' }, { startDate: '2026-05-02', dueDate: '2026-05-01' }, { priority: 9 }, { references: [{ target: 'quran:wrong:2:1', label: 'x' }] }, { id: 'missing-revision' } ]) {
    assert.throws(() => validateTask({ ...input(), ...change }));
  }
  assert.equal(validateTask(input()).startDate, null);
  assert.equal(civilDate(parseCivilDate('2024-02-29')), '2024-02-29');
});

test('Gregorian month/year and week boundaries use local civil dates', () => {
  const anchor = parseCivilDate('2024-02-20');
  const month = plannerRange(anchor, 'month', 'gregorian');
  assert.equal(civilDate(month.start), '2024-02-01');
  assert.equal(civilDate(month.end), '2024-02-29');
  const year = plannerRange(anchor, 'year', 'gregorian');
  assert.equal(civilDate(year.start), '2024-01-01');
  assert.equal(civilDate(year.end), '2024-12-31');
  const week = plannerRange(anchor, 'week', 'gregorian');
  assert.equal(week.start.getDay(), 6);
  assert.equal(civilDate(addCivilDays(week.start, 6)), civilDate(week.end));
});

test('Hijri month/year ranges match the existing calculator with every adjustment', () => {
  for (const adjustment of [-2, 0, 2]) {
    for (const anchorValue of ['2026-01-01', '2026-03-20', '2026-06-17', '2026-12-31']) {
      const anchor = parseCivilDate(anchorValue);
      const expected = calculateHijriDate(anchor, adjustment);
      assert.deepEqual(calendarParts(anchor, 'hijri', adjustment), { year: expected.year, month: expected.month, day: expected.day });
      for (const period of ['month', 'year'] as const) {
        const range = plannerRange(anchor, period, 'hijri', adjustment);
        const start = calculateHijriDate(range.start, adjustment);
        const end = calculateHijriDate(range.end, adjustment);
        assert.equal(start.year, expected.year); assert.equal(end.year, expected.year);
        assert.equal(start.day, 1);
        if (period === 'month') {
          assert.equal(start.month, expected.month); assert.equal(end.month, expected.month);
          assert.notEqual(calculateHijriDate(addCivilDays(range.end, 1), adjustment).month, expected.month);
        } else {
          assert.equal(start.month, 1); assert.equal(end.month, 12);
          assert.notEqual(calculateHijriDate(addCivilDays(range.end, 1), adjustment).year, expected.year);
        }
      }
    }
  }
});
