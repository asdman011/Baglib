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

// -----------------------------------------------------------------------------
// KEY-283: Study Workspace 5 — Weekly Rhythm & Today Panel (Section 4)
// -----------------------------------------------------------------------------

export const WEEKLY_RHYTHM_SETTINGS_KEY = 'study.rhythm.v1';
export const WEEKLY_RHYTHM_CHANGED_EVENT = 'baglib:weekly-rhythm-changed';
export type WeeklyGoalUnit = 'minutes' | 'reviews' | 'pages';

export interface WeeklyRhythmConfig {
  goalValue: number;
  goalUnit: WeeklyGoalUnit;
  restDays: number[]; // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat. Friday (5) default.
  celebrationsEnabled: boolean;
  dailyReminderTime: string | null;
}

export const DEFAULT_WEEKLY_RHYTHM: WeeklyRhythmConfig = {
  goalValue: 60,
  goalUnit: 'minutes',
  restDays: [5], // Friday default
  celebrationsEnabled: true,
  dailyReminderTime: null,
};

export function validateWeeklyRhythmConfig(input: unknown): WeeklyRhythmConfig {
  if (!input || typeof input !== 'object') throw new Error('invalid-request');
  const value = input as WeeklyRhythmConfig;

  if (
    typeof value.goalValue !== 'number' ||
    !Number.isInteger(value.goalValue) ||
    value.goalValue < 1 ||
    value.goalValue > 10000
  ) {
    throw new Error('invalid-request');
  }

  if (!['minutes', 'reviews', 'pages'].includes(value.goalUnit)) {
    throw new Error('invalid-request');
  }

  if (
    !Array.isArray(value.restDays) ||
    value.restDays.some(d => typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > 6)
  ) {
    throw new Error('invalid-request');
  }
  const uniqueRestDays = Array.from(new Set(value.restDays));
  if (uniqueRestDays.length !== value.restDays.length || uniqueRestDays.length > 6) {
    throw new Error('invalid-request');
  }

  if (typeof value.celebrationsEnabled !== 'boolean') {
    throw new Error('invalid-request');
  }

  if (
    value.dailyReminderTime !== null &&
    (typeof value.dailyReminderTime !== 'string' ||
      !/^([01]\d|2[0-3]):[0-5]\d$/u.test(value.dailyReminderTime))
  ) {
    throw new Error('invalid-request');
  }

  return {
    goalValue: value.goalValue,
    goalUnit: value.goalUnit,
    restDays: uniqueRestDays,
    celebrationsEnabled: value.celebrationsEnabled,
    dailyReminderTime: value.dailyReminderTime ?? null,
  };
}

export const MINIMUM_READING_DWELL_SECONDS = 30;

export interface DayActivityRecord {
  date: string; // YYYY-MM-DD
  dayOfWeek?: number; // 0=Sun..6=Sat
  srsReviewsCount?: number;
  maxPageDwellSeconds?: number;
  pagesRead?: number;
  readingMinutes?: number;
  practiceAttemptsCount?: number;
  completedTasksCount?: number;
}

export function isDayActive(record: DayActivityRecord): boolean {
  if ((record.srsReviewsCount ?? 0) >= 1) return true;
  if ((record.maxPageDwellSeconds ?? 0) >= MINIMUM_READING_DWELL_SECONDS) return true;
  if ((record.practiceAttemptsCount ?? 0) >= 1) return true;
  if ((record.completedTasksCount ?? 0) >= 1) return true;
  return false;
}

export type DayRhythmStatus = 'active' | 'rest' | 'unreached' | 'upcoming';

export interface DayRhythmEvaluation {
  date: string;
  dayOfWeek: number;
  status: DayRhythmStatus;
  isAutoRest: boolean;
  meaningfulActionsCount: number;
}

export interface WeeklyRhythmEvaluation {
  days: DayRhythmEvaluation[];
  activeDaysCount: number;
  restDaysUsed: number;
  unreachedDaysCount: number;
  weeklyGoalMet: boolean;
  currentWeeklyValue: number;
  targetWeeklyValue: number;
  goalUnit: WeeklyGoalUnit;
  celebrationsEnabled: boolean;
}

/**
 * Evaluates weekly rhythm with automatic rest day buffer (2 rest days/week)
 * and Friday default. A missed study day silently uses a rest day without guilt.
 */
export function evaluateWeeklyRhythm(
  records: DayActivityRecord[],
  config: WeeklyRhythmConfig = DEFAULT_WEEKLY_RHYTHM,
  referenceDateStr?: string
): WeeklyRhythmEvaluation {
  const maxRestDays = 2;
  let restDaysUsed = 0;
  let activeDaysCount = 0;
  let unreachedDaysCount = 0;
  let currentWeeklyValue = 0;

  const evaluatedDays: DayRhythmEvaluation[] = [];

  for (const record of records) {
    const dayOfWeek =
      record.dayOfWeek !== undefined
        ? record.dayOfWeek
        : new Date(record.date + 'T12:00:00Z').getUTCDay();

    // Accumulate weekly progress value according to goal unit
    if (config.goalUnit === 'minutes') {
      currentWeeklyValue += Math.round(
        record.readingMinutes ?? (record.maxPageDwellSeconds ? record.maxPageDwellSeconds / 60 : 0)
      );
    } else if (config.goalUnit === 'reviews') {
      currentWeeklyValue +=
        (record.srsReviewsCount ?? 0) + (record.practiceAttemptsCount ?? 0);
    } else if (config.goalUnit === 'pages') {
      currentWeeklyValue += record.pagesRead ?? 0;
    }

    const isFuture = referenceDateStr && record.date > referenceDateStr;

    if (isDayActive(record)) {
      activeDaysCount++;
      evaluatedDays.push({
        date: record.date,
        dayOfWeek,
        status: 'active',
        isAutoRest: false,
        meaningfulActionsCount:
          (record.srsReviewsCount ?? 0) +
          (record.practiceAttemptsCount ?? 0) +
          (record.completedTasksCount ?? 0) +
          ((record.maxPageDwellSeconds ?? 0) >= MINIMUM_READING_DWELL_SECONDS ? 1 : 0),
      });
    } else if (isFuture) {
      const isPlannedRest = config.restDays.includes(dayOfWeek);
      evaluatedDays.push({
        date: record.date,
        dayOfWeek,
        status: isPlannedRest ? 'rest' : 'upcoming',
        isAutoRest: false,
        meaningfulActionsCount: 0,
      });
    } else {
      // Inactive day up to today
      const isDesignatedRestDay = config.restDays.includes(dayOfWeek);
      if (restDaysUsed < maxRestDays) {
        restDaysUsed++;
        evaluatedDays.push({
          date: record.date,
          dayOfWeek,
          status: 'rest',
          isAutoRest: !isDesignatedRestDay, // Silent automatic rest day if not designated
          meaningfulActionsCount: 0,
        });
      } else {
        unreachedDaysCount++;
        evaluatedDays.push({
          date: record.date,
          dayOfWeek,
          status: 'unreached',
          isAutoRest: false,
          meaningfulActionsCount: 0,
        });
      }
    }
  }

  const weeklyGoalMet =
    currentWeeklyValue >= config.goalValue || activeDaysCount >= 5;

  return {
    days: evaluatedDays,
    activeDaysCount,
    restDaysUsed,
    unreachedDaysCount,
    weeklyGoalMet,
    currentWeeklyValue,
    targetWeeklyValue: config.goalValue,
    goalUnit: config.goalUnit,
    celebrationsEnabled: config.celebrationsEnabled,
  };
}

// -----------------------------------------------------------------------------
// Today Panel Step Selection (Up to 3 concrete steps, swap, skip)
// -----------------------------------------------------------------------------

export type TodayStepKind = 'planner' | 'srs' | 'pathway';

export interface TodayCandidateStep {
  id: string;
  kind: TodayStepKind;
  title: string;
  subtitle?: string;
  dueDate: string | null; // YYYY-MM-DD
  priority: number; // 0 (normal), 1 (medium), 2 (high)
  createdAt: string; // ISO string
  target?: string;
  actionLabel?: string;
  payload?: unknown;
}

export interface TodaySelectionOptions {
  skippedIds?: string[];
  swappedIds?: string[];
  maxSteps?: number;
}

export interface TodayStepSelectionResult {
  activeSteps: TodayCandidateStep[];
  pool: TodayCandidateStep[];
}

export function sortTodayCandidates(
  candidates: TodayCandidateStep[],
  today: string
): TodayCandidateStep[] {
  return [...candidates].sort((a, b) => {
    // 1. Due date ordering:
    // Overdue tasks (< today) come first, earlier due date first
    const aOverdue = a.dueDate !== null && a.dueDate < today;
    const bOverdue = b.dueDate !== null && b.dueDate < today;
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    if (aOverdue && bOverdue) {
      const cmp = a.dueDate!.localeCompare(b.dueDate!);
      if (cmp !== 0) return cmp;
    }

    // Due today (=== today) comes next
    const aToday = a.dueDate === today;
    const bToday = b.dueDate === today;
    if (aToday && !bToday) return -1;
    if (!aToday && bToday) return 1;

    // If both have future due dates:
    if (a.dueDate && b.dueDate) {
      const cmp = a.dueDate.localeCompare(b.dueDate);
      if (cmp !== 0) return cmp;
    } else if (a.dueDate && !b.dueDate) {
      return -1;
    } else if (!a.dueDate && b.dueDate) {
      return 1;
    }

    // 2. Priority: higher priority first
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }

    // 3. Age: older creation date first
    const ageCmp = a.createdAt.localeCompare(b.createdAt);
    if (ageCmp !== 0) return ageCmp;

    // 4. Deterministic tie-breaker
    return a.id.localeCompare(b.id);
  });
}

export function selectTodaySteps(
  candidates: TodayCandidateStep[],
  today: string,
  options: TodaySelectionOptions = {}
): TodayStepSelectionResult {
  const maxSteps = options.maxSteps ?? 3;
  const skippedSet = new Set(options.skippedIds ?? []);
  const swappedSet = new Set(options.swappedIds ?? []);

  // Filter out steps skipped for today
  const available = candidates.filter(c => !skippedSet.has(c.id));
  const sorted = sortTodayCandidates(available, today);

  // Partition into non-swapped and swapped items
  const nonSwapped: TodayCandidateStep[] = [];
  const swapped: TodayCandidateStep[] = [];

  for (const item of sorted) {
    if (swappedSet.has(item.id)) {
      swapped.push(item);
    } else {
      nonSwapped.push(item);
    }
  }

  // Non-swapped items take priority; swapped items are pushed to the back of the pool
  const ordered = [...nonSwapped, ...swapped];

  const activeSteps = ordered.slice(0, maxSteps);
  const pool = ordered.slice(maxSteps);

  return { activeSteps, pool };
}
