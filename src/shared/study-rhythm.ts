import { evaluatePrayerScheduleStatus, prayerClock } from './athan-calculator';
import type { PrayerStatusSnapshot } from './types/athan';

export const STUDY_PAUSE_EVENT = 'baglib:study-pause';
export const RHYTHM_CHANGED_EVENT = 'baglib:study-rhythm-changed';
export const RHYTHM_SETTINGS_KEY = 'dashboard.study.rhythm.v1';
export interface StudyRhythm { enabled: boolean; prayers: boolean; minutes: number; zikr: string; wird: string; launch: boolean; intentionAr: string; intentionEn: string }
export const DEFAULT_STUDY_RHYTHM: StudyRhythm = { enabled: false, prayers: true, minutes: 15, zikr: '', wird: '', launch: false, intentionAr: '', intentionEn: '' };

export function validateRhythm(input: unknown): StudyRhythm {
  if (!input || typeof input !== 'object') throw new Error('invalid-request');
  const value = input as StudyRhythm;
  if (typeof value.enabled !== 'boolean' || typeof value.prayers !== 'boolean' || typeof value.launch !== 'boolean' || !Number.isInteger(value.minutes) || value.minutes < 1 || value.minutes > 120) throw new Error('invalid-request');
  for (const time of [value.zikr, value.wird]) if (typeof time !== 'string' || time !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/u.test(time)) throw new Error('invalid-request');
  for (const text of [value.intentionAr, value.intentionEn]) if (typeof text !== 'string' || text.length > 2000) throw new Error('invalid-request');
  if (value.launch && (!value.intentionAr.trim() || !value.intentionEn.trim())) throw new Error('invalid-request');
  return { enabled: value.enabled, prayers: value.prayers, minutes: value.minutes, zikr: value.zikr, wird: value.wird, launch: value.launch, intentionAr: value.intentionAr, intentionEn: value.intentionEn };
}

export function rhythmWindow(snapshot: PrayerStatusSnapshot, settings: StudyRhythm, now: Date): { key: string; kind: 'prayer' | 'zikr' | 'wird'; endsAt: number } | null {
  if (!settings.enabled) return null;
  const clock = prayerClock(now, snapshot.coordinates.timezone);
  const dateKey = `${clock.year}-${clock.month}-${clock.day}`;
  const elapsed = clock.hour * 60 + clock.minute;
  const active = evaluatePrayerScheduleStatus(now, snapshot.times, settings.minutes, snapshot.coordinates.timezone).activeWindow;
  if (settings.prayers && active) {
    const [hour, minute] = active.enteredAt.split(':').map(Number);
    return { key: `${snapshot.times.date}:prayer:${active.prayer}`, kind: 'prayer', endsAt: now.getTime() + ((hour * 60 + minute + settings.minutes - elapsed) * 60 - clock.second) * 1000 };
  }
  for (const kind of ['zikr', 'wird'] as const) {
    const time = settings[kind];
    if (!time) continue;
    const [hour, minute] = time.split(':').map(Number);
    const start = hour * 60 + minute;
    const delta = (elapsed - start + 1440) % 1440;
    if (delta < settings.minutes) {
      const previousDay = new Date(Date.UTC(clock.year, clock.month - 1, clock.day - 1));
      const keyDate = elapsed >= start ? dateKey : `${previousDay.getUTCFullYear()}-${previousDay.getUTCMonth() + 1}-${previousDay.getUTCDate()}`;
      return { key: `${keyDate}:${kind}`, kind, endsAt: now.getTime() + ((settings.minutes - delta) * 60 - clock.second) * 1000 };
    }
  }
  return null;
}

export function studyIsPaused(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.studyPaused === 'true';
}
