import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ATHAN_SETTINGS, buildPrayerStatusSnapshot } from '../../src/shared/athan-calculator';
import { DEFAULT_DHIKR_REMINDERS, DEFAULT_QUIET_WINDOW, dhikrSchedule, prayerSchedule, inQuietWindow, validateReminderSettings, type NotificationRecord } from '../../src/shared/notifications';
import { notificationMinutes } from '../../src/shared/notification-text';
import { NotificationService } from '../../src/main/services/notifications';
import { AthanService } from '../../src/main/services/athan/athan.service';
import type { ISettingsRepository } from '../../src/main/database/repositories/settings.repository';

function repository(): ISettingsRepository {
  const values = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback?: T) => structuredClone((values.has(key) ? values.get(key) : fallback) as T),
    set: (key, value) => { values.set(key, structuredClone(value)); },
    delete: key => values.delete(key),
    getAll: () => Object.fromEntries(values),
  };
}
const times = { ...buildPrayerStatusSnapshot(DEFAULT_ATHAN_SETTINGS, new Date('2026-11-11T12:00:00Z')).times, date: '2026-11-11', fajr: '00:10', isha: '23:55', asr: '15:00' };

test('prayer schedule preserves per-prayer overrides, disabled prayers and midnight date ownership', () => {
  const settings = structuredClone(DEFAULT_ATHAN_SETTINGS);
  settings.notifications.preReminderByPrayer = { fajr: 20, asr: 0 };
  settings.notifications.enabledPrayers.dhuhr = false;
  const entries = prayerSchedule(times, settings);
  assert.deepEqual(entries.find(entry => entry.key.endsWith('fajr:pre-reminder')), { key: '2026-11-11:fajr:pre-reminder', prayer: 'fajr', type: 'pre-reminder', minutesRemaining: 20, minute: 1430, dayOffset: -1 });
  assert.ok(!entries.some(entry => entry.prayer === 'asr' && entry.type === 'pre-reminder'));
  assert.ok(!entries.some(entry => entry.prayer === 'dhuhr'));
  assert.ok(entries.some(entry => entry.prayer === 'asr' && entry.type === 'athan' && entry.minute === 900));
});

test('dhikr schedule computes fixed times, negative offsets, following-day offsets and enabled state', () => {
  const reminders = [
    { ...DEFAULT_DHIKR_REMINDERS[0], enabled: true, offsetMinutes: -30 },
    { ...DEFAULT_DHIKR_REMINDERS[1], enabled: true, prayer: 'isha' as const, offsetMinutes: 20 },
    { ...DEFAULT_DHIKR_REMINDERS[0], id: 'custom', kind: 'custom' as const, title: 'ذِكر Study', enabled: true, prayer: null, time: '10:23' },
    { ...DEFAULT_DHIKR_REMINDERS[0], id: 'off', enabled: false },
  ];
  const entries = dhikrSchedule(times, reminders);
  assert.equal(entries.length, 3);
  assert.deepEqual(entries.map(entry => [entry.minute, entry.dayOffset]), [[1420, -1], [15, 1], [623, 0]]);
  assert.equal(entries[2].reminder?.title, 'ذِكر Study');
});

test('quiet windows include their start, exclude their end, and cover overnight and all-day windows', () => {
  assert.equal(inQuietWindow('23:30', DEFAULT_QUIET_WINDOW), false);
  const overnight = { enabled: true, start: '22:00', end: '06:00' };
  for (const time of ['22:00', '23:59', '00:00', '05:59']) assert.equal(inQuietWindow(time, overnight), true);
  for (const time of ['06:00', '12:00', '21:59']) assert.equal(inQuietWindow(time, overnight), false);
  assert.equal(inQuietWindow('12:00', { enabled: true, start: '12:00', end: '13:00' }), true);
  assert.equal(inQuietWindow('13:00', { enabled: true, start: '12:00', end: '13:00' }), false);
  assert.equal(inQuietWindow('15:00', { enabled: true, start: '12:00', end: '12:00' }), true);
});

test('notification actions survive service restart, deduplicate publication and retain newest-first history', () => {
  const repo = repository();
  let now = new Date('2026-11-11T10:00:00Z');
  const delivered: NotificationRecord[] = [];
  const opened: NotificationRecord[] = [];
  const sink = { deliver: (record: NotificationRecord) => { delivered.push(record); }, open: (record: NotificationRecord) => { opened.push(record); } };
  let service = new NotificationService(repo, sink, () => false, () => now);
  const first = service.publish({ key: '1', kind: 'dhikr', title: 'ذِكر Study', body: '', target: 'dashboard' });
  service.publish({ key: '1', kind: 'dhikr', title: '', body: '', target: 'dashboard' });
  assert.equal(delivered.length, 1);
  service.action(first.id, 'snooze');
  service = new NotificationService(repo, sink, () => false, () => now);
  service.checkSnoozes(); assert.equal(delivered.length, 1);
  now = new Date('2026-11-11T10:10:00Z');
  service.checkSnoozes(); service.checkSnoozes(); assert.equal(delivered.length, 2);
  service.action(first.id, 'done');
  service.action(first.id, 'open'); assert.equal(opened[0].id, first.id);
  service.publish({ key: '2', kind: 'study', title: 'Study', body: '', target: 'planner' });
  assert.deepEqual(service.history().map(item => item.key), ['2', '1']);
  assert.equal(service.history()[1].status, 'done');
});

test('focus and quiet hours suppress both delivery channels, with durable history', () => {
  const repo = repository(); let quiet = true; let delivered = 0;
  const service = new NotificationService(repo, { deliver: () => { delivered++; }, open: () => {} }, () => quiet);
  const input = { key: 'quiet', kind: 'prayer' as const, title: 'الصلاة', body: '', target: 'dashboard' as const };
  assert.equal(service.publish(input).status, 'suppressed');
  quiet = false; service.setFocused(true);
  assert.equal(service.publish({ ...input, key: 'focus' }).status, 'suppressed');
  assert.equal(delivered, 0); assert.equal(service.history().length, 2);
  service.setFocused(false); service.publish({ ...input, key: 'normal' }); assert.equal(delivered, 1);
});

test('legacy athan settings merge and validate new settings without losing existing controls', () => {
  const service = new AthanService(repository());
  service.updateSettings({ notifications: { ...service.getSettings().notifications, preReminderByPrayer: { fajr: 20 } } });
  service.updateSettings({ notifications: { ...service.getSettings().notifications, preReminderByPrayer: { asr: 10 } } });
  assert.deepEqual(service.getSettings().notifications.preReminderByPrayer, { fajr: 20, asr: 10 });
  assert.throws(() => validateReminderSettings({ ...service.getSettings(), dhikrReminders: [{ ...DEFAULT_DHIKR_REMINDERS[0], offsetMinutes: 10000 }] }));
  assert.throws(() => validateReminderSettings({ ...service.getSettings(), audio: { ...service.getSettings().audio, volume: NaN } }));
});

test('notification minute plurals use all Arabic categories and English singular/plural', () => {
  assert.equal(notificationMinutes(0, 'ar'), 'أقل من دقيقة');
  assert.equal(notificationMinutes(1, 'ar'), 'دقيقة واحدة');
  assert.equal(notificationMinutes(2, 'ar'), 'دقيقتان');
  assert.match(notificationMinutes(3, 'ar'), /دقائق/);
  assert.match(notificationMinutes(11, 'ar'), /دقيقة/);
  assert.match(notificationMinutes(100, 'ar'), /دقيقة/);
  assert.equal(notificationMinutes(1, 'en'), '1 minute');
  assert.equal(notificationMinutes(3, 'en'), '3 minutes');
});
