import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { KhatmahService } from '../../src/main/services/quran/khatmah';
import { addDays, dateDay, khatmahReadingDwell, khatmahStats, localDate, pageRanges, validateKhatmah } from '../../src/shared/khatmah';
import type { KhatmahBinding, KhatmahConfig, KhatmahPlan } from '../../src/shared/types/khatmah';

const binding: KhatmahBinding = { script: 'script', layout: 'layout', profile: 'hafs', adapted: false, totalPages: 604, juzPages: Array.from({ length: 30 }, (_, index) => index ? index * 20 + 2 : 1), juzEndPages: Array.from({ length: 30 }, (_, index) => index === 29 ? 604 : (index + 1) * 20 + 1) };
const config: KhatmahConfig = { title: 'تدبر القرآن • Ramadan', script: 'script', layout: 'layout', startDate: '2026-10-26', mode: 'duration', durationDays: 30, targetDate: '2026-11-24', pagesPerSession: 2, sessionsPerDay: 5, juzPerDay: 1, automatic: false, reminder: { enabled: true, time: '06:00', language: 'ar' } };
const plan = (changes: Partial<KhatmahPlan> = {}): KhatmahPlan => ({ ...config, id: 'one', binding, paused: false, reads: [], ...changes });
function fixture() {
  const database = new Database(':memory:');
  database.exec("CREATE TABLE app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))");
  const settings = new SqliteSettingsRepository(database);
  let now = new Date('2026-10-26T07:00:00');
  const service = new KhatmahService(settings, () => now);
  return { database, settings, service, clock: (date: string) => { now = new Date(date); } };
}

test('Khatmah civil dates reject invalid calendars and remain DST-independent', () => {
  for (const value of ['2026-02-29', '2026-13-01', '2026-1-02', 'not-a-date', '1999-12-31', '2201-01-01']) assert.throws(() => dateDay(value));
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');
  assert.equal(dateDay('2026-11-02') - dateDay('2026-10-31'), 2);
  assert.equal(localDate(new Date(2026, 9, 26, 23, 59)), '2026-10-26');
});

test('duration presets calculate inclusive dates without rounding away pages', () => {
  for (const durationDays of [7, 15, 30, 60, 180, 365]) {
    const valid = validateKhatmah({ ...config, durationDays }, binding);
    assert.equal(dateDay(valid.targetDate) - dateDay(valid.startDate), durationDays - 1);
    let current = plan({ ...valid });
    for (let day = 0; day < durationDays; day++) {
      const today = addDays(config.startDate, day);
      const target = khatmahStats(current, today).todayPages;
      current = { ...current, reads: [...current.reads, ...target.map(page => ({ page, date: today }))] };
      assert.equal(khatmahStats(current, today).todayPages.length, 0);
    }
    assert.equal(current.reads.length, 604);
    assert.equal(new Set(current.reads.map(read => read.page)).size, 604);
  }
});

test('custom date, prayer sessions and whole-Juz pacing validate separately', () => {
  assert.equal(validateKhatmah({ ...config, mode: 'date', targetDate: '2026-10-26' }, binding).durationDays, 1);
  assert.equal(validateKhatmah({ ...config, mode: 'pages' }, binding).durationDays, 61);
  assert.equal(validateKhatmah({ ...config, mode: 'juz', juzPerDay: 2 }, binding).durationDays, 15);
  assert.throws(() => validateKhatmah({ ...config, mode: 'juz' }, { ...binding, profile: 'warsh', adapted: true, juzPages: [] }));
  for (const partial of [{ durationDays: NaN }, { durationDays: 0 }, { pagesPerSession: Infinity }, { sessionsPerDay: -1 }, { juzPerDay: 0.5 }, { automatic: 1 }, { mode: 'date', targetDate: '2026-10-25' }, { reminder: { ...config.reminder, time: '24:00' } }]) assert.throws(() => validateKhatmah({ ...config, ...partial } as KhatmahConfig, binding));
});

test('future and paused plans have no current assignment; missed days adapt', () => {
  assert.equal(khatmahStats(plan(), '2026-10-25').todayPages.length, 0);
  assert.equal(khatmahStats(plan({ paused: true }), '2026-10-26').todayPages.length, 0);
  assert.equal(khatmahStats(plan(), '2026-10-26').todayPages.length, 21);
  assert.equal(khatmahStats(plan(), '2026-11-24').todayPages.length, 604);
  assert.equal(khatmahStats(plan(), '2026-11-25').todayPages.length, 604);
  assert.equal(khatmahStats(plan({ mode: 'pages', durationDays: 61, targetDate: '2026-12-25' }), '2026-11-25').todayPages.length, 10);
});

test('Juz page coverage follows supplied boundary mapping instead of equal page partitions', () => {
  const sharedBoundary = { ...binding, juzEndPages: binding.juzEndPages.map((page, index) => index === 0 ? 22 : page) };
  assert.equal(khatmahStats(plan({ mode: 'juz', binding: sharedBoundary }), '2026-10-26').todayPages.at(-1), 22);
  assert.deepEqual(khatmahStats(plan({ mode: 'juz' }), '2026-10-26').todayPages, Array.from({ length: 21 }, (_, index) => index + 1));
  const reads = Array.from({ length: 21 }, (_, index) => ({ page: index + 1, date: '2026-10-26' }));
  assert.equal(khatmahStats(plan({ mode: 'juz', reads }), '2026-10-26').todayPages.length, 0);
  assert.deepEqual(khatmahStats(plan({ mode: 'juz', reads }), '2026-10-27').todayPages, Array.from({ length: 20 }, (_, index) => index + 22));
});

test('gaps remain in the target, streaks use civil dates and forecast reflects pace', () => {
  const current = plan({ reads: [{ page: 1, date: '2026-10-26' }, { page: 3, date: '2026-10-27' }, { page: 4, date: '2026-10-28' }] });
  assert.equal(khatmahStats(current, '2026-10-28').streak, 3);
  assert.equal(khatmahStats(current, '2026-10-29').streak, 3);
  assert.equal(khatmahStats(current, '2026-10-30').streak, 0);
  assert.equal(khatmahStats(current, '2026-10-28').todayPages[0], 2);
  assert.equal(khatmahStats(current, '2026-10-28').schedule, 'behind');
  const ahead = khatmahStats(plan({ reads: Array.from({ length: 100 }, (_, index) => ({ page: index + 1, date: '2026-10-26' })) }), '2026-10-26');
  assert.equal(ahead.schedule, 'ahead');
  assert.ok(ahead.forecastDate < config.targetDate);
  assert.equal(pageRanges([1, 2, 3, 7, 9, 10]), '1–3, 7, 9–10');
});

test('private SQLite settings persist multiple independent plans and idempotent read dates', () => {
  const { database, settings, service, clock } = fixture();
  try {
    const first = service.create(config, binding)[0];
    const second = service.create({ ...config, title: 'Second' }, binding)[1];
    const mark = { action: 'mark' as const, id: first.id, script: 'script', layout: 'layout', pages: [1, 1, 3], read: true };
    service.mutate(mark);
    clock('2026-10-27T08:00:00');
    service.mutate(mark);
    const reloaded = new KhatmahService(settings).list();
    assert.deepEqual(reloaded[0].reads, [{ page: 1, date: '2026-10-26' }, { page: 3, date: '2026-10-26' }]);
    assert.equal(reloaded[1].reads.length, 0);
    assert.equal(reloaded[0].title, config.title);
    service.mutate({ ...mark, read: false, pages: [1] });
    assert.equal(service.list()[0].reads.length, 1);
    service.mutate({ action: 'delete', id: second.id });
    assert.equal(service.list().length, 1);
    assert.deepEqual(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(), [{ name: 'app_settings' }]);
  } finally { database.close(); }
});

test('invalid marking, profile changes and paused/future reading cannot mutate progress', () => {
  const { database, service } = fixture();
  try {
    const first = service.create(config, binding)[0];
    const mark = { action: 'mark' as const, id: first.id, script: 'script', layout: 'layout', pages: [1], read: true };
    for (const partial of [{ pages: [0] }, { pages: [605] }, { pages: [NaN] }, { pages: [] }, { script: 'warsh' }, { layout: 'other' }]) assert.throws(() => service.mutate({ ...mark, ...partial }));
    service.mutate({ action: 'pause', id: first.id, paused: true });
    assert.throws(() => service.mutate(mark));
    assert.throws(() => service.mutate({ action: 'edit', id: first.id, config: { ...config, script: 'other' } }));
    const second = service.create({ ...config, startDate: '2026-10-28' }, binding)[1];
    assert.throws(() => service.mutate({ ...mark, id: second.id }));
    assert.ok(service.list().every(plan => !plan.reads.length));
  } finally { database.close(); }
});

test('reminders deduplicate across restarts and skip future, paused, completed daily targets', () => {
  const { database, settings, service, clock } = fixture();
  try {
    const first = service.create(config, binding)[0];
    let shown = 0;
    service.remind(() => { shown++; return false; });
    assert.equal(shown, 1);
    assert.equal(service.list()[0].remindedOn, undefined);
    service.acknowledgeReminder(first.id, '2026-10-26');
    new KhatmahService(settings, () => new Date('2026-10-26T09:00:00')).remind(() => { shown++; return true; });
    assert.equal(shown, 1);
    clock('2026-10-27T05:59:00'); service.remind(() => { shown++; return true; }); assert.equal(shown, 1);
    clock('2026-10-27T06:00:00'); service.remind(() => { shown++; return true; }); assert.equal(shown, 2);
    service.mutate({ action: 'pause', id: first.id, paused: true });
    clock('2026-10-28T09:00:00'); service.remind(() => { shown++; return true; }); assert.equal(shown, 2);
    const future = service.create({ ...config, startDate: '2026-11-01' }, binding)[1];
    service.remind(() => { shown++; return true; }); assert.equal(shown, 2);
    assert.equal(service.list().find(plan => plan.id === future.id)?.remindedOn, undefined);
  } finally { database.close(); }
});

test('corrupt stored progress fails closed instead of erasing history', () => {
  const { database, settings, service } = fixture();
  try {
    settings.set('quran.khatmah.v1', { version: 1, plans: [plan({ reads: [{ page: 700, date: '2026-10-26' }] })] });
    assert.throws(() => service.list(), /storage/);
    assert.throws(() => service.create(config, binding), /storage/);
    assert.equal(settings.get<{ plans: KhatmahPlan[] }>('quran.khatmah.v1')?.plans[0].reads[0].page, 700);
  } finally { database.close(); }
});

test('automatic reading requires an uninterrupted 20 seconds and cancels on navigation or hidden/blurred state', () => {
  let callback: (() => void) | undefined;
  let delay = 0;
  let cancellations = 0;
  let marks = 0;
  const dwell = khatmahReadingDwell(() => { marks++; }, (action, milliseconds) => { callback = action; delay = milliseconds; return 1 as unknown as ReturnType<typeof setTimeout>; }, () => { callback = undefined; cancellations++; });
  dwell.update(false); assert.equal(callback, undefined);
  dwell.update(true); assert.equal(delay, 20_000);
  const initialCallback = callback;
  dwell.update(true); assert.equal(callback, initialCallback);
  dwell.update(false); assert.equal(callback, undefined); assert.equal(cancellations, 1);
  dwell.update(true); dwell.dispose(); assert.equal(callback, undefined); assert.equal(marks, 0);
  dwell.update(true); assert.equal(callback, undefined);
  const next = khatmahReadingDwell(() => { marks++; }, action => { callback = action; return 2 as unknown as ReturnType<typeof setTimeout>; }, () => { callback = undefined; });
  next.update(true); callback?.();
  assert.equal(marks, 1);
  next.update(false); next.update(true); assert.equal(marks, 1);
  next.dispose();
});

test('completed daily assignments do not notify and elapsed-time status excludes unfinished current day', () => {
  const { database, service } = fixture();
  try {
    const first = service.create(config, binding)[0];
    assert.equal(khatmahStats(first, config.startDate).schedule, 'on-track');
    service.mutate({ action: 'mark', id: first.id, script: 'script', layout: 'layout', read: true, pages: khatmahStats(first, config.startDate).todayPages });
    let shown = 0;
    service.remind(() => { shown++; return true; });
    assert.equal(shown, 0);
  } finally { database.close(); }
});

test('plans and reminder history survive closing and reopening a physical SQLite database', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'baglib-khatmah-'));
  const filename = path.join(directory, 'private.sqlite');
  let database = new Database(filename);
  try {
    database.exec("CREATE TABLE app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))");
    const service = new KhatmahService(new SqliteSettingsRepository(database), () => new Date('2026-10-26T07:00:00'));
    const first = service.create(config, binding)[0];
    service.mutate({ action: 'mark', id: first.id, script: 'script', layout: 'layout', read: true, pages: [1, 2] });
    service.acknowledgeReminder(first.id, '2026-10-26');
    database.close();
    database = new Database(filename);
    const restored = new KhatmahService(new SqliteSettingsRepository(database)).list()[0];
    assert.equal(restored.reads.length, 2);
    assert.equal(restored.remindedOn, '2026-10-26');
    assert.equal(restored.id, first.id);
    assert.deepEqual(restored.binding, binding);
  } finally { database.close(); unlinkSync(filename); rmdirSync(directory); }
});
