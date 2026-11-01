import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrayerStatusSnapshot, DEFAULT_ATHAN_SETTINGS } from '../../src/shared/athan-calculator';
import { DEFAULT_STUDY_RHYTHM, rhythmWindow, validateRhythm } from '../../src/shared/study-rhythm';
import { ReadingTrackerService } from '../../src/main/services/statistics/reading-tracker.service';
import { SqliteReadingStatisticsRepository } from '../../src/main/database/repositories/reading-statistics.repository';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import Database from 'better-sqlite3';

test('snooze is disabled by default and launch text requires explicit bilingual wording', () => {
  assert.equal(DEFAULT_STUDY_RHYTHM.enabled, false);
  assert.equal(DEFAULT_STUDY_RHYTHM.launch, false);
  assert.throws(() => validateRhythm({ ...DEFAULT_STUDY_RHYTHM, launch: true }));
  assert.throws(() => validateRhythm({ ...DEFAULT_STUDY_RHYTHM, zikr: '25:01' }));
  assert.throws(() => validateRhythm({ ...DEFAULT_STUDY_RHYTHM, minutes: 0 }));
});

test('prayer boundaries use existing Athan schedule and exclude sunrise', () => {
  const snapshot = buildPrayerStatusSnapshot(DEFAULT_ATHAN_SETTINGS, new Date('2026-11-01T05:00:00Z'));
  snapshot.coordinates.timezone = 'UTC';
  snapshot.times.fajr = '05:00'; snapshot.times.sunrise = '06:30';
  const settings = { ...DEFAULT_STUDY_RHYTHM, enabled: true, minutes: 15 };
  assert.equal(rhythmWindow(snapshot, settings, new Date('2026-11-01T04:59:59Z')), null);
  const window = rhythmWindow(snapshot, settings, new Date('2026-11-01T05:03:00Z'));
  assert.equal(window?.kind, 'prayer');
  assert.equal(window?.endsAt, Date.parse('2026-11-01T05:15:00Z'));
  assert.equal(rhythmWindow(snapshot, settings, new Date('2026-11-01T05:15:00Z')), null);
  assert.equal(rhythmWindow(snapshot, settings, new Date('2026-11-01T06:30:00Z')), null);
});

test('custom wird windows cross midnight with stable event identity', () => {
  const snapshot = buildPrayerStatusSnapshot(DEFAULT_ATHAN_SETTINGS, new Date('2026-11-01T12:00:00Z'));
  snapshot.coordinates.timezone = 'UTC';
  const settings = { ...DEFAULT_STUDY_RHYTHM, enabled: true, prayers: false, wird: '23:55', minutes: 15 };
  const before = rhythmWindow(snapshot, settings, new Date('2026-11-01T23:59:00Z'));
  const after = rhythmWindow(snapshot, settings, new Date('2026-11-02T00:03:00Z'));
  assert.equal(before?.key, after?.key);
  assert.equal(before?.endsAt, after?.endsAt);
  assert.equal(rhythmWindow(snapshot, settings, new Date('2026-11-02T00:10:00Z')), null);
});

test('pause flushes reading time, retains the session and excludes snooze time', () => {
  const db = new Database(':memory:');
  runMigrations(db, migrations);
  const repository = new SqliteReadingStatisticsRepository(db);
  const tracker = new ReadingTrackerService(repository);
  const originalClock = Date.now;
  let clock = 100000;
  Date.now = () => clock;
  try {
    tracker.startSession({ bookId: 'rhythm-test', title: 'Test', page: 1 });
    clock += 10000; tracker.heartbeat(); tracker.setPaused(true);
    assert.equal(repository.getBookStats('rhythm-test')?.totalReadTime, 10);
    clock += 300000; tracker.heartbeat(); tracker.turnPage(2);
    tracker.recordReadingProgress({ bookId: 'rhythm-test', title: 'Test', page: 2, durationSeconds: 180 });
    assert.equal(repository.getBookStats('rhythm-test')?.totalReadTime, 10);
    tracker.setPaused(false);
    clock += 10000; tracker.heartbeat(); tracker.endSession();
    assert.equal(repository.getBookStats('rhythm-test')?.totalReadTime, 20);
  } finally { Date.now = originalClock; db.close(); }
});
