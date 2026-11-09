import { civilDate, parseCivilDate, addCivilDays } from './study-planner';
import { calculateHijriDate } from './athan-calculator';

export const EXAM_SETTINGS_PREFIX = 'pathways.exam.v1:';

export interface CurriculumExamConfig {
  pathwayId: string;
  examDate: string | null; // 'YYYY-MM-DD'
  availableMinutesPerDay: Record<number, number>; // 0=Sun..6=Sat -> minutes
  defaultStepMinutes: number; // default e.g. 30
}

export const DEFAULT_STEP_MINUTES = 30;
export const DEFAULT_STUDY_DAY_MINUTES = 60;
export const DEFAULT_REST_DAY_MINUTES = 0;

export const DEFAULT_WEEKDAY_MINUTES: Record<number, number> = {
  0: 60, // Sun
  1: 60, // Mon
  2: 60, // Tue
  3: 60, // Wed
  4: 60, // Thu
  5: 0,  // Fri (default rest day)
  6: 60, // Sat
};

export function validateExamConfig(input: unknown): CurriculumExamConfig {
  if (!input || typeof input !== 'object') throw new Error('invalid-request');
  const value = input as Record<string, unknown>;

  if (typeof value.pathwayId !== 'string' || !value.pathwayId.trim()) {
    throw new Error('invalid-request');
  }

  let examDate: string | null = null;
  if (value.examDate !== null && value.examDate !== undefined) {
    if (typeof value.examDate !== 'string') throw new Error('invalid-request');
    parseCivilDate(value.examDate); // validates YYYY-MM-DD
    examDate = value.examDate;
  }

  const availableMinutes: Record<number, number> = {};
  if (value.availableMinutesPerDay && typeof value.availableMinutesPerDay === 'object') {
    const map = value.availableMinutesPerDay as Record<string, unknown>;
    for (let day = 0; day <= 6; day++) {
      const v = map[day] ?? map[String(day)];
      if (v !== undefined) {
        const num = Number(v);
        if (!Number.isInteger(num) || num < 0 || num > 1440) {
          throw new Error('invalid-request');
        }
        availableMinutes[day] = num;
      }
    }
  }

  // Fill any missing days with default
  for (let day = 0; day <= 6; day++) {
    if (availableMinutes[day] === undefined) {
      availableMinutes[day] = day === 5 ? DEFAULT_REST_DAY_MINUTES : DEFAULT_STUDY_DAY_MINUTES;
    }
  }

  let defaultStepMinutes = DEFAULT_STEP_MINUTES;
  if (value.defaultStepMinutes !== undefined) {
    const num = Number(value.defaultStepMinutes);
    if (!Number.isInteger(num) || num < 5 || num > 300) {
      throw new Error('invalid-request');
    }
    defaultStepMinutes = num;
  }

  return {
    pathwayId: value.pathwayId.trim(),
    examDate,
    availableMinutesPerDay: availableMinutes,
    defaultStepMinutes,
  };
}

export interface PlanStepItem {
  itemId: string;
  taskId: string;
  section: string;
  title: string;
  pinned: boolean;
  done: boolean;
  currentDueDate: string | null;
  estimatedMinutes?: number;
  masteryLevel?: 'not_started' | 'started' | 'familiar' | 'proficient' | 'mastered';
  isPrerequisite?: boolean;
  failureCount?: number;
}

export interface SuggestedStepSchedule {
  itemId: string;
  taskId: string;
  section: string;
  title: string;
  pinned: boolean;
  suggestedDate: string; // 'YYYY-MM-DD'
  isPinnedDate: boolean;
  estimatedMinutes: number;
}

export interface DropSuggestion {
  section: string;
  stepCount: number;
  reason: 'already_mastered' | 'proficient' | 'non_prerequisite';
  stepTitles: string[];
}

export interface ReplanResult {
  fits: boolean;
  totalRemainingSteps: number;
  totalRequiredMinutes: number;
  totalAvailableMinutes: number;
  freeDaysCount: number;
  examDate: string;
  examDateFormatted: {
    gregorian: string;
    hijri: string;
  };
  suggestedSchedule: SuggestedStepSchedule[];
  droppedOrShortenedSuggestions: DropSuggestion[];
  unfitReason?: 'past_exam_date' | 'insufficient_time' | 'no_free_days' | 'no_exam_date';
  unfitMessage?: string;
}

export function formatHijriCivilDate(civilStr: string, lang: 'ar' | 'en'): string {
  try {
    const date = parseCivilDate(civilStr);
    const hijri = calculateHijriDate(date);
    const monthsAr = [
      'محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة',
      'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة',
    ];
    const monthsEn = [
      'Muharram', 'Safar', 'Rabi I', 'Rabi II', 'Jumada I', 'Jumada II',
      'Rajab', "Sha'ban", 'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah',
    ];

    const monthName = lang === 'ar' ? monthsAr[hijri.month - 1] : monthsEn[hijri.month - 1];
    return lang === 'ar'
      ? `${hijri.day} ${monthName} ${hijri.year} هـ`
      : `${hijri.day} ${monthName} ${hijri.year} AH`;
  } catch {
    return civilStr;
  }
}

/**
 * Computes adaptive re-plan spreading unfinished steps over remaining free study days.
 * Respects rest days (e.g. Friday), pinned dates, and priority of weak sections/prerequisites.
 * Returns plain non-guilt feedback if steps cannot fit before exam date.
 */
export function computeAdaptiveReplan(options: {
  steps: PlanStepItem[];
  examConfig: CurriculumExamConfig;
  restDays?: number[]; // from study.rhythm.v1, default [5]
  todayStr?: string;
  lang?: 'ar' | 'en';
}): ReplanResult {
  const {
    steps,
    examConfig,
    restDays = [5],
    todayStr = civilDate(new Date()),
    lang = 'en',
  } = options;

  const defaultStepTime = examConfig.defaultStepMinutes || DEFAULT_STEP_MINUTES;

  if (!examConfig.examDate) {
    return {
      fits: false,
      totalRemainingSteps: 0,
      totalRequiredMinutes: 0,
      totalAvailableMinutes: 0,
      freeDaysCount: 0,
      examDate: '',
      examDateFormatted: { gregorian: '', hijri: '' },
      suggestedSchedule: [],
      droppedOrShortenedSuggestions: [],
      unfitReason: 'no_exam_date',
      unfitMessage: lang === 'ar' ? 'لم يتم تحديد موعد للاختبار.' : 'No exam date has been set.',
    };
  }

  const examDate = examConfig.examDate;
  const examDateFormatted = {
    gregorian: examDate,
    hijri: formatHijriCivilDate(examDate, lang),
  };

  // Only consider unfinished steps
  const unfinished = steps.filter(s => !s.done);
  const totalRemainingSteps = unfinished.length;

  // Check if exam date is in the past
  if (examDate < todayStr) {
    return {
      fits: false,
      totalRemainingSteps,
      totalRequiredMinutes: unfinished.reduce((sum, s) => sum + (s.estimatedMinutes || defaultStepTime), 0),
      totalAvailableMinutes: 0,
      freeDaysCount: 0,
      examDate,
      examDateFormatted,
      suggestedSchedule: [],
      droppedOrShortenedSuggestions: [],
      unfitReason: 'past_exam_date',
      unfitMessage:
        lang === 'ar'
          ? `موعد الاختبار (${examDate}) قد مضى بالنسبة لتاريخ اليوم (${todayStr}).`
          : `The exam date (${examDate}) is in the past relative to today (${todayStr}).`,
    };
  }

  // Collect candidate study days strictly before the exam date (from todayStr up to day before examDate)
  // If examDate === todayStr, there are 0 study days remaining before the exam.
  const studyDays: { dateStr: string; dayOfWeek: number; availableMinutes: number }[] = [];
  let curr = parseCivilDate(todayStr);
  const examDateObj = parseCivilDate(examDate);

  while (curr.getTime() < examDateObj.getTime()) {
    const dateStr = civilDate(curr);
    const dayOfWeek = curr.getDay();

    // Check rest day: if in restDays and not explicitly given available minutes > 0
    const isRest = restDays.includes(dayOfWeek);
    let mins = examConfig.availableMinutesPerDay[dayOfWeek];
    if (mins === undefined) {
      mins = isRest ? DEFAULT_REST_DAY_MINUTES : DEFAULT_STUDY_DAY_MINUTES;
    } else if (isRest && mins === DEFAULT_STUDY_DAY_MINUTES) {
      // If config had default 60 but rhythm has day as rest day, respect rest day
      mins = DEFAULT_REST_DAY_MINUTES;
    }

    if (mins > 0) {
      studyDays.push({ dateStr, dayOfWeek, availableMinutes: mins });
    }

    curr = addCivilDays(curr, 1);
  }

  const freeDaysCount = studyDays.length;
  const totalAvailableMinutes = studyDays.reduce((sum, d) => sum + d.availableMinutes, 0);

  // If there are no unfinished steps, it always fits
  if (unfinished.length === 0) {
    return {
      fits: true,
      totalRemainingSteps: 0,
      totalRequiredMinutes: 0,
      totalAvailableMinutes,
      freeDaysCount,
      examDate,
      examDateFormatted,
      suggestedSchedule: [],
      droppedOrShortenedSuggestions: [],
    };
  }

  // Handle pinned steps
  const pinnedWithDate: PlanStepItem[] = [];
  const unpinned: PlanStepItem[] = [];

  for (const s of unfinished) {
    if (s.pinned && s.currentDueDate && s.currentDueDate >= todayStr && s.currentDueDate <= examDate) {
      pinnedWithDate.push(s);
    } else {
      unpinned.push(s);
    }
  }

  // Sort unpinned steps:
  // 1. Prerequisites first
  // 2. Weaker mastery first ('not_started' -> 'started' -> 'familiar' -> 'proficient' -> 'mastered')
  // 3. Higher failure/lapse count first
  const masteryRank: Record<string, number> = {
    not_started: 0,
    started: 1,
    familiar: 2,
    proficient: 3,
    mastered: 4,
  };

  unpinned.sort((a, b) => {
    const aPrereq = a.isPrerequisite ? 1 : 0;
    const bPrereq = b.isPrerequisite ? 1 : 0;
    if (aPrereq !== bPrereq) return bPrereq - aPrereq; // Prerequisites earlier

    const aRank = masteryRank[a.masteryLevel || 'not_started'] ?? 0;
    const bRank = masteryRank[b.masteryLevel || 'not_started'] ?? 0;
    if (aRank !== bRank) return aRank - bRank; // Weaker earlier

    const aFail = a.failureCount || 0;
    const bFail = b.failureCount || 0;
    if (aFail !== bFail) return bFail - aFail; // More failures earlier

    return 0;
  });

  const totalRequiredMinutes = unfinished.reduce(
    (sum, s) => sum + (s.estimatedMinutes || defaultStepTime),
    0
  );

  // Check if it fits
  const canFit = freeDaysCount > 0 && totalRequiredMinutes <= totalAvailableMinutes;

  // Generate drop/shorten suggestions if cannot fit
  const droppedOrShortenedSuggestions: DropSuggestion[] = [];
  if (!canFit) {
    // Group candidates for dropping: mastered or proficient sections with no prerequisites
    const sectionGroups: Record<string, PlanStepItem[]> = {};
    for (const item of unfinished) {
      if (!sectionGroups[item.section]) sectionGroups[item.section] = [];
      sectionGroups[item.section].push(item);
    }

    for (const [secName, secItems] of Object.entries(sectionGroups)) {
      const isMastered = secItems.every(i => i.masteryLevel === 'mastered');
      const isProficient = secItems.every(
        i => i.masteryLevel === 'proficient' || i.masteryLevel === 'mastered'
      );
      const hasPrereq = secItems.some(i => i.isPrerequisite);

      if (!hasPrereq) {
        if (isMastered) {
          droppedOrShortenedSuggestions.push({
            section: secName,
            stepCount: secItems.length,
            reason: 'already_mastered',
            stepTitles: secItems.map(i => i.title),
          });
        } else if (isProficient) {
          droppedOrShortenedSuggestions.push({
            section: secName,
            stepCount: secItems.length,
            reason: 'proficient',
            stepTitles: secItems.map(i => i.title),
          });
        }
      }
    }
  }

  // Build suggested schedule by spreading across free study days
  const suggestedSchedule: SuggestedStepSchedule[] = [];
  const dayCapacities = studyDays.map(d => ({
    dateStr: d.dateStr,
    availableMinutes: d.availableMinutes,
    usedMinutes: 0,
    stepsCount: 0,
  }));

  // Account for pinned steps first
  for (const p of pinnedWithDate) {
    const est = p.estimatedMinutes || defaultStepTime;
    suggestedSchedule.push({
      itemId: p.itemId,
      taskId: p.taskId,
      section: p.section,
      title: p.title,
      pinned: true,
      suggestedDate: p.currentDueDate!,
      isPinnedDate: true,
      estimatedMinutes: est,
    });

    const dayObj = dayCapacities.find(d => d.dateStr === p.currentDueDate);
    if (dayObj) {
      dayObj.usedMinutes += est;
      dayObj.stepsCount += 1;
    }
  }

  // Even spreading of remaining unpinned steps:
  // If freeDaysCount > 0, distribute steps across days
  if (dayCapacities.length > 0) {
    let dayIdx = 0;

    for (const item of unpinned) {
      const est = item.estimatedMinutes || defaultStepTime;

      // Find the best day: cycle through days, or pick the day with least used ratio
      // For even spreading, advance day pointer when day reaches its share
      const targetPerDay = Math.ceil(unpinned.length / dayCapacities.length);

      // Find day that hasn't exceeded its steps target, or cycle
      let chosenDay = dayCapacities[dayIdx];
      let loops = 0;
      while (
        chosenDay.stepsCount >= targetPerDay &&
        loops < dayCapacities.length
      ) {
        dayIdx = (dayIdx + 1) % dayCapacities.length;
        chosenDay = dayCapacities[dayIdx];
        loops++;
      }

      suggestedSchedule.push({
        itemId: item.itemId,
        taskId: item.taskId,
        section: item.section,
        title: item.title,
        pinned: item.pinned,
        suggestedDate: chosenDay.dateStr,
        isPinnedDate: false,
        estimatedMinutes: est,
      });

      chosenDay.usedMinutes += est;
      chosenDay.stepsCount += 1;
      dayIdx = (dayIdx + 1) % dayCapacities.length;
    }
  } else {
    // 0 study days: put on examDate or todayStr as fallback
    const fallbackDate = examDate >= todayStr ? examDate : todayStr;
    for (const item of unpinned) {
      suggestedSchedule.push({
        itemId: item.itemId,
        taskId: item.taskId,
        section: item.section,
        title: item.title,
        pinned: item.pinned,
        suggestedDate: fallbackDate,
        isPinnedDate: false,
        estimatedMinutes: item.estimatedMinutes || defaultStepTime,
      });
    }
  }

  let unfitReason: 'past_exam_date' | 'insufficient_time' | 'no_free_days' | undefined;
  let unfitMessage: string | undefined;

  if (!canFit) {
    if (freeDaysCount === 0) {
      unfitReason = 'no_free_days';
      unfitMessage =
        lang === 'ar'
          ? `لا توجد أيام دراسة متاحة قبل موعد الاختبار في ${examDate} (${examDateFormatted.hijri}).`
          : `There are no free study days available before the exam date on ${examDate} (${examDateFormatted.hijri}).`;
    } else {
      unfitReason = 'insufficient_time';
      const shortMins = totalRequiredMinutes - totalAvailableMinutes;
      unfitMessage =
        lang === 'ar'
          ? `الخطوات المتبقية (${totalRemainingSteps} خطوة) تحتاج إلى حوالي ${totalRequiredMinutes} دقيقة، بينما الوقت المتاح هو ${totalAvailableMinutes} دقيقة موزعة على ${freeDaysCount} أيام دراسية قبل موعد الاختبار (عجز ${shortMins} دقيقة). يمكنك تقليص أو تجاوز مراجعة الأقسام المتقنة للتركيز على نقاط الضعف.`
          : `The remaining ${totalRemainingSteps} steps require ~${totalRequiredMinutes} minutes, but only ${totalAvailableMinutes} minutes are available across ${freeDaysCount} study days before the exam (a shortfall of ${shortMins} minutes). Consider shortening or dropping review for mastered sections to focus on foundational topics.`;
    }
  }

  return {
    fits: canFit,
    totalRemainingSteps,
    totalRequiredMinutes,
    totalAvailableMinutes,
    freeDaysCount,
    examDate,
    examDateFormatted,
    suggestedSchedule,
    droppedOrShortenedSuggestions,
    unfitReason,
    unfitMessage,
  };
}
