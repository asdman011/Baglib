import type { AthanSettings, DailyPrayerTimes, PrayerName } from './types/athan';

export const NOTIFICATION_HISTORY_KEY = 'notifications.history.v1';
export interface QuietWindow { enabled: boolean; start: string; end: string }
export interface DhikrReminder {
  id: string;
  kind: 'morning' | 'evening' | 'afterPrayer' | 'custom';
  title: string;
  enabled: boolean;
  time: string;
  prayer: PrayerName | null;
  offsetMinutes: number;
}
export interface NotificationRecord {
  id: string;
  key: string;
  kind: 'prayer' | 'dhikr' | 'wird' | 'study' | 'khatmah';
  title: string;
  body: string;
  createdAt: string;
  status: 'new' | 'done' | 'snoozed' | 'suppressed';
  snoozedUntil?: string;
  target: 'dashboard' | 'planner' | 'quran';
}
export const DEFAULT_QUIET_WINDOW: QuietWindow = { enabled: false, start: '22:00', end: '06:00' };
export const DEFAULT_DHIKR_REMINDERS: DhikrReminder[] = [
  { id: 'morning', kind: 'morning', title: '', enabled: false, time: '07:00', prayer: 'fajr', offsetMinutes: 30 },
  { id: 'evening', kind: 'evening', title: '', enabled: false, time: '17:00', prayer: 'asr', offsetMinutes: 30 },
  ...(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const).map(prayer => ({
    id: `after-${prayer}`, kind: 'afterPrayer' as const, title: '', enabled: false, time: '12:00', prayer, offsetMinutes: 10,
  })),
];
export const PRAYERS: PrayerName[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
export function clockMinutes(time: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('invalid-time');
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}
export function inQuietWindow(time: string, quiet: QuietWindow = DEFAULT_QUIET_WINDOW): boolean {
  if (!quiet.enabled) return false;
  const now = clockMinutes(time);
  const start = clockMinutes(quiet.start);
  const end = clockMinutes(quiet.end);
  if (start === end) return true;
  return start < end ? now >= start && now < end : now >= start || now < end;
}
export interface ScheduleEntry {
  key: string;
  minute: number;
  dayOffset: number;
  prayer?: PrayerName;
  type: 'athan' | 'pre-reminder' | 'dhikr';
  minutesRemaining?: number;
  reminder?: DhikrReminder;
}
function offsetEntry(key: string, minute: number, rest: Omit<ScheduleEntry, 'key' | 'minute' | 'dayOffset'>): ScheduleEntry {
  return { key, minute: (minute % 1440 + 1440) % 1440, dayOffset: Math.floor(minute / 1440), ...rest };
}
export function prayerSchedule(times: DailyPrayerTimes, settings: AthanSettings): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  for (const prayer of PRAYERS) {
    if (!settings.notifications.enabledPrayers[prayer]) continue;
    const minute = clockMinutes(times[prayer]);
    entries.push(offsetEntry(`${times.date}:${prayer}:athan`, minute, { prayer, type: 'athan' }));
    const before = settings.notifications.preReminderByPrayer?.[prayer] ?? settings.notifications.preReminderMinutes;
    if (prayer !== 'sunrise' && settings.notifications.enabled && settings.notifications.preReminderEnabled && before > 0) {
      entries.push(offsetEntry(`${times.date}:${prayer}:pre-reminder`, minute - before, { prayer, type: 'pre-reminder', minutesRemaining: before }));
    }
  }
  return entries;
}
export function dhikrSchedule(times: DailyPrayerTimes, reminders: DhikrReminder[]): ScheduleEntry[] {
  return reminders.filter(reminder => reminder.enabled).map(reminder => offsetEntry(
    `${times.date}:dhikr:${reminder.id}`,
    reminder.prayer ? clockMinutes(times[reminder.prayer]) + reminder.offsetMinutes : clockMinutes(reminder.time),
    { type: 'dhikr', reminder },
  ));
}
export function validateReminderSettings(settings: AthanSettings): void {
  const quiet = settings.notifications.quietWindow;
  if (quiet) { clockMinutes(quiet.start); clockMinutes(quiet.end); }
  for (const minute of Object.values(settings.notifications.preReminderByPrayer ?? {})) {
    if (!Number.isInteger(minute) || minute! < 0 || minute! > 180) throw new Error('invalid-offset');
  }
  const reminders = settings.dhikrReminders ?? [];
  if (!Array.isArray(reminders) || reminders.length > 60 || new Set(reminders.map(item => item.id)).size !== reminders.length) throw new Error('invalid-reminders');
  for (const reminder of reminders) {
    if (!reminder.id || reminder.id.length > 100 || !['morning', 'evening', 'afterPrayer', 'custom'].includes(reminder.kind) || typeof reminder.enabled !== 'boolean' || typeof reminder.title !== 'string' || reminder.title.length > 200) throw new Error('invalid-reminder');
    clockMinutes(reminder.time);
    if (reminder.prayer !== null && !PRAYERS.includes(reminder.prayer)) throw new Error('invalid-prayer');
    if (!Number.isInteger(reminder.offsetMinutes) || Math.abs(reminder.offsetMinutes) > 720) throw new Error('invalid-offset');
  }
  if (!Number.isFinite(settings.audio.volume) || settings.audio.volume < 0 || settings.audio.volume > 1) throw new Error('invalid-volume');
  const location = settings.manualLocation;
  if (!Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90 || !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180) throw new Error('invalid-location');
  new Intl.DateTimeFormat('en', { timeZone: location.timezone });
}
