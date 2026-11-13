import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { StudyPlannerRepository } from '../../src/main/database/repositories/study-planner.repository';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { NotificationService } from '../../src/main/services/notifications';
import { PlannerReminderScheduler } from '../../src/main/services/planner-reminders';
import { nextTaskDate, validateTask, inferTaskSubject, referenceTaskSubject, parseLocalDateTime, type StudyTaskInput } from '../../src/shared/study-planner';
import type { NotificationRecord } from '../../src/shared/notifications';

const input = (): StudyTaskInput => ({ title: 'مُراجعة Review', description: '', status: 'open', startDate: null, dueDate: '2026-01-31', priority: 0, sortOrder: 0, references: [] });
function setup() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys=ON');
  runMigrations(db, migrations);
  return { db, tasks: new StudyPlannerRepository(db), settings: new SqliteSettingsRepository(db) };
}

test('migration backfills legacy tasks into the built-in Tasks list and reverses cleanly', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db, migrations.filter(item => item.id < 27));
    db.prepare("INSERT INTO study_task VALUES ('legacy','العِلْم','', 'open',NULL,NULL,0,0,'[]',NULL,'2026-01-01','2026-01-01')").run();
    runMigrations(db, migrations);
    const row = new StudyPlannerRepository(db).list()[0];
    assert.equal(row.listId, 'tasks'); assert.equal(row.subject, ''); assert.equal(row.recurrence, null); assert.equal(row.reminderAt, null);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
    migrations.find(item => item.id === 27)!.down!(db);
    assert.equal(db.prepare('PRAGMA table_info(study_task)').all().length, 12);
  } finally { db.close(); }
});

test('lists support revisions, grouping, ordering and safe deletion with tasks retained', () => {
  const { db, tasks } = setup();
  try {
    const list = tasks.saveList({ name: 'العِلْم Study', icon: '📚', groupName: 'الجامعة', sortOrder: 2 });
    const task = tasks.save({ ...input(), listId: list.id, subject: 'الإحصاء' });
    tasks.renameGroup('الجامعة', 'University');
    const renamed = tasks.lists().find(item => item.id === list.id)!;
    assert.equal(renamed.groupName, 'University');
    assert.throws(() => tasks.saveList({ ...list, expectedUpdatedAt: list.updatedAt }), /conflict/);
    tasks.removeList(list.id, renamed.updatedAt);
    assert.equal(tasks.list()[0].listId, 'tasks'); assert.equal(tasks.list()[0].subject, 'الإحصاء');
    assert.throws(() => tasks.save({ ...task, expectedUpdatedAt: task.updatedAt }), /conflict/);
    assert.throws(() => tasks.removeList('tasks', tasks.lists()[0].updatedAt));
  } finally { db.close(); }
});

test('legacy producers preserve extended properties during edits and invalid list IDs fail atomically', () => {
  const { db, tasks } = setup();
  try {
    const task = tasks.save({ ...input(), subject: 'العلم', reminderAt: '2026-01-31T09:00', recurrence: { kind: 'daily' } });
    const saved = tasks.save({ ...input(), id: task.id, expectedUpdatedAt: task.updatedAt, title: 'Pathway' });
    assert.equal(saved.subject, task.subject); assert.deepEqual(saved.recurrence, task.recurrence); assert.equal(saved.reminderAt, task.reminderAt);
    assert.throws(() => tasks.save({ ...input(), listId: 'missing' })); assert.equal(tasks.list().length, 1);
  } finally { db.close(); }
});

test('daily completion creates a single next occurrence and preserves its reminder offset', () => {
  const { db, tasks } = setup();
  try {
    const task = tasks.save({ ...input(), recurrence: { kind: 'daily' }, reminderAt: '2026-01-30T09:00', subject: 'Science' });
    const completed = tasks.save({ ...task, status: 'completed', expectedUpdatedAt: task.updatedAt });
    let next = tasks.list().find(item => item.id !== task.id)!;
    assert.equal(next.dueDate, '2026-02-01'); assert.equal(next.reminderAt, '2026-01-31T09:00'); assert.equal(next.subject, 'Science');
    assert.throws(() => tasks.save({ ...task, status: 'completed', expectedUpdatedAt: task.updatedAt }), /conflict/);
    const reopened = tasks.save({ ...completed, status: 'open', expectedUpdatedAt: completed.updatedAt });
    tasks.save({ ...reopened, status: 'completed', expectedUpdatedAt: reopened.updatedAt });
    assert.equal(tasks.list().length, 2);
    tasks.save({ ...next, status: 'completed', expectedUpdatedAt: next.updatedAt });
    next = tasks.list().find(item => item.status === 'open')!;
    assert.equal(next.dueDate, '2026-02-02');
  } finally { db.close(); }
});

test('monthly and yearly recurrence clamp month ends and retain anchor days', () => {
  assert.equal(nextTaskDate('2026-01-31', { kind: 'monthly' }), '2026-02-28');
  assert.equal(nextTaskDate('2026-02-28', { kind: 'monthly', anchorDay: 31 }), '2026-03-31');
  assert.equal(nextTaskDate('2024-02-29', { kind: 'yearly' }), '2025-02-28');
  assert.equal(nextTaskDate('2027-02-28', { kind: 'yearly', anchorDay: 29, anchorMonth: 1 }), '2028-02-29');
  assert.equal(nextTaskDate('2026-11-13', { kind: 'weekdays' }), '2026-11-16');
  assert.equal(nextTaskDate('2026-11-13', { kind: 'weekly' }), '2026-11-20');
});

test('custom day/week/month intervals and chosen weekdays follow the active week', () => {
  assert.equal(nextTaskDate('2026-11-09', { kind: 'custom', interval: 2, unit: 'days' }), '2026-11-11');
  assert.equal(nextTaskDate('2026-11-09', { kind: 'custom', interval: 2, unit: 'weeks', weekdays: [1, 3] }), '2026-11-11');
  assert.equal(nextTaskDate('2026-11-11', { kind: 'custom', interval: 2, unit: 'weeks', weekdays: [1, 3] }), '2026-11-23');
  assert.equal(nextTaskDate('2026-01-31', { kind: 'custom', interval: 2, unit: 'months' }), '2026-03-31');
});

test('invalid recurrence, subjects and local reminder dates are rejected', () => {
  for (const change of [{ recurrence: { kind: 'hourly' } }, { recurrence: { kind: 'custom', interval: 0, unit: 'weeks' } }, { recurrence: { kind: 'custom', interval: 1, unit: 'weeks', weekdays: [9] } }, { reminderAt: '2026-02-30T09:00' }, { reminderAt: '2026-01-01T25:00' }, { subject: 3 }, { listId: '' }]) assert.throws(() => validateTask({ ...input(), ...change }));
  assert.equal(parseLocalDateTime('2026-01-01T09:00').getHours(), 9);
});

test('subject inference normalizes Arabic search while preserving original subjects and source names', () => {
  assert.equal(inferTaskSubject('مُراجعة الإحصاء English', ['الإحصاء']), 'الإحصاء');
  assert.equal(inferTaskSubject('Review science', ['Science']), 'Science');
  const books = [{ id: 'a', title: 'كتاب', categories: ['إحصاء'] }, { id: 'b', title: 'Original Title' }];
  const labels = { quran: 'القرآن', sunnah: 'السنة', poetry: 'الشعر' };
  assert.equal(referenceTaskSubject('book:a', books, labels), 'إحصاء');
  assert.equal(referenceTaskSubject('book:a@pdf-source#p=12', books, labels), 'إحصاء');
  assert.equal(referenceTaskSubject('book:b', books, labels), 'Original Title');
  assert.equal(referenceTaskSubject('quran:hafs:2:1', books, labels), 'القرآن');
  assert.equal(referenceTaskSubject('sunnah:Bukhari:1:1', books, labels), 'السنة');
  assert.equal(referenceTaskSubject('poetry:ashaar:1:1', books, labels), 'الشعر');
});

test('reminders deliver overdue open tasks once across restarts, history trimming and rescheduling', () => {
  const { db, tasks, settings } = setup();
  try {
    let now = new Date('2026-01-31T10:00');
    const delivered: NotificationRecord[] = []; const opened: NotificationRecord[] = [];
    const notifications = new NotificationService(settings, { deliver: record => { delivered.push(record); }, open: record => { opened.push(record); } }, () => false, () => now);
    const task = tasks.save({ ...input(), reminderAt: '2026-01-31T09:00' });
    tasks.save({ ...input(), title: 'future', reminderAt: '2026-02-01T09:00' });
    tasks.save({ ...input(), title: 'cancelled', status: 'cancelled', reminderAt: '2026-01-31T08:00' });
    const scheduler = () => new PlannerReminderScheduler(tasks, notifications, settings, () => 'Task reminder', () => now);
    scheduler().check(); scheduler().check();
    assert.equal(delivered.length, 1); assert.equal(delivered[0].taskId, task.id);
    notifications.action(delivered[0].id, 'open'); assert.equal(opened[0].taskId, task.id);
    settings.set('notifications.history.v1', []); scheduler().check(); assert.equal(delivered.length, 1);
    tasks.save({ ...task, reminderAt: '2026-01-31T11:00', expectedUpdatedAt: task.updatedAt });
    scheduler().check(); assert.equal(delivered.length, 1);
    now = new Date('2026-01-31T11:00'); scheduler().check(); assert.equal(delivered.length, 2);
  } finally { db.close(); }
});

test('reminders use the existing suppression policy and record suppressed events in history', () => {
  const { db, tasks, settings } = setup();
  try {
    tasks.save({ ...input(), reminderAt: '2026-01-31T09:00' });
    const notifications = new NotificationService(settings, { deliver: () => assert.fail('suppressed'), open: () => {} }, () => true);
    new PlannerReminderScheduler(tasks, notifications, settings, () => 'Task reminder', () => new Date('2026-01-31T10:00')).check();
    assert.equal(notifications.history()[0].status, 'suppressed');
  } finally { db.close(); }
});


test('editing a recurring due date resets its month-end anchor and a failed next date rolls back completion', () => {
  const { db, tasks } = setup();
  try {
    const task = tasks.save({ ...input(), dueDate: '2026-02-28', recurrence: { kind: 'monthly', anchorDay: 31 } });
    const changed = tasks.save({ ...task, dueDate: '2026-02-15', expectedUpdatedAt: task.updatedAt });
    tasks.save({ ...changed, status: 'completed', expectedUpdatedAt: changed.updatedAt });
    assert.equal(tasks.list().find(item => item.status === 'open')!.dueDate, '2026-03-15');
    const limit = tasks.save({ ...input(), dueDate: '2200-12-31', recurrence: { kind: 'daily' } });
    assert.throws(() => tasks.save({ ...limit, status: 'completed', expectedUpdatedAt: limit.updatedAt }));
    assert.equal(tasks.list().find(item => item.id === limit.id)!.status, 'open');
  } finally { db.close(); }
});
