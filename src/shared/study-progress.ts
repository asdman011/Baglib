/**
 * BagLib Study Workspace: Progress View (KEY-284)
 *
 * Implements the three separate measures:
 * 1. Reading Coverage: Pages read with verified dwell (>= 30s) from `reading_page_stat` vs merely opened pages.
 * 2. Demonstrated Knowledge: Khan-style mastery levels (Started -> Familiar -> Proficient -> Mastered)
 *    derived solely from auto-checked or judged practice attempts (`practice_attempt`), with self-ratings kept separate.
 * 3. Reviews Due: SRS review schedule for today and the next 7 days from `srs_state`.
 *
 * The three measures are strictly kept separate and never merged into a single score.
 */

export const MIN_READING_COVERAGE_DWELL_SECONDS = 30;
export const MASTERY_DELAYED_RETRIEVAL_HOURS = 20;

export const MASTERY_LEVELS = ['not_started', 'started', 'familiar', 'proficient', 'mastered'] as const;
export type MasteryLevel = (typeof MASTERY_LEVELS)[number];

export interface PracticeAttemptRecord {
  id: string;
  knowledgeId?: string | null;
  cardRevision?: number | null;
  questionKind: string;
  answerText?: string;
  result: 'correct' | 'partial' | 'incorrect' | 'pending';
  checkMethod: 'auto' | 'self' | 'judgment';
  mistakeCategory?: string | null;
  confidence?: number | null;
  durationMs?: number | null;
  sourceRef?: string | null;
  context: 'practice' | 'section_check' | 'challenge';
  createdAt: string;
}

export interface CardMasteryState {
  level: MasteryLevel;
  demonstratedAttemptsCount: number;
  correctDemonstratedCount: number;
  lapsesCount: number;
  hasDelayedRetrieval: boolean;
  hasUnfamiliarRetrieval: boolean;
  isSelfRatedOnly: boolean;
  lastAttemptResult: 'correct' | 'partial' | 'incorrect' | 'pending' | null;
}

export interface SectionMasterySummary {
  sectionName: string;
  level: MasteryLevel;
  totalCards: number;
  levelCounts: Record<MasteryLevel, number>;
  demonstratedCardsCount: number;
  selfRatedCardsCount: number;
}

export interface ReadingCoverageProgress {
  totalBookPages: number;
  readPagesCount: number; // pages with dwell >= 30s
  openedPagesCount: number; // pages with dwell > 0 but < 30s
  coveragePercent: number; // round((readPagesCount / totalBookPages) * 100)
  totalDwellSeconds: number;
  verifiedDwellThresholdSeconds: number;
}

export interface ReviewsDueProgress {
  dueTodayCount: number;
  dueThisWeekCount: number;
  overdueCount: number;
  totalScheduledCards: number;
  nextDueAt: string | null;
}

export interface TargetProgressSummary {
  targetKind: 'pathway' | 'book';
  targetId: string;
  title: string;
  titleAr?: string;
  subtitle?: string;

  // Measure 1: Reading coverage (never merged)
  readingCoverage: ReadingCoverageProgress;

  // Measure 2: Demonstrated knowledge (never merged)
  demonstratedKnowledge: {
    overallLevel: MasteryLevel;
    levelCounts: Record<MasteryLevel, number>;
    totalCards: number;
    demonstratedCardsCount: number;
    selfRatedCardsCount: number; // kept strictly separate!
    sections: SectionMasterySummary[];
  };

  // Measure 3: Reviews due (never merged)
  reviewsDue: ReviewsDueProgress;
}

export interface ProgressTargetItem {
  id: string;
  title: string;
  kind: 'pathway' | 'book';
  subtitle?: string;
}

/**
 * Evaluates mastery for a single card from its chronological practice attempt history.
 *
 * Rules:
 * - Only 'auto' and 'judgment' check methods count as demonstrated.
 * - 'self' ratings are separated and do not earn demonstrated mastery levels.
 * - 'pending' attempts are ignored.
 * - Started: At least 1 completed demonstrated attempt.
 * - Familiar: At least 2 correct demonstrated attempts.
 * - Proficient: At least 3 correct demonstrated attempts with recent accuracy >= 75%.
 * - Mastered: Achieved Proficient AND has demonstrated retention either via:
 *   a) A delayed retrieval (>= 20 hours after a previous correct attempt), OR
 *   b) An unfamiliar / challenge question (`context === 'challenge' || context === 'section_check'`),
 *   AND has no active lapse (most recent attempt must be correct).
 * - Demotion / Lapse:
 *   If at Mastered or Proficient, an incorrect attempt demotes the card to Familiar.
 */
export function evaluateCardMastery(attempts: PracticeAttemptRecord[]): CardMasteryState {
  if (!attempts || attempts.length === 0) {
    return {
      level: 'not_started',
      demonstratedAttemptsCount: 0,
      correctDemonstratedCount: 0,
      lapsesCount: 0,
      hasDelayedRetrieval: false,
      hasUnfamiliarRetrieval: false,
      isSelfRatedOnly: false,
      lastAttemptResult: null,
    };
  }

  // Sort chronologically ascending
  const sorted = [...attempts].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const demonstrated = sorted.filter(
    (a) => (a.checkMethod === 'auto' || a.checkMethod === 'judgment') && a.result !== 'pending'
  );

  const selfRated = sorted.filter((a) => a.checkMethod === 'self' && a.result !== 'pending');

  if (demonstrated.length === 0) {
    return {
      level: 'not_started',
      demonstratedAttemptsCount: 0,
      correctDemonstratedCount: 0,
      lapsesCount: 0,
      hasDelayedRetrieval: false,
      hasUnfamiliarRetrieval: false,
      isSelfRatedOnly: selfRated.length > 0,
      lastAttemptResult: sorted[sorted.length - 1]?.result ?? null,
    };
  }

  let correctCount = 0;
  let lapsesCount = 0;
  let hasDelayedRetrieval = false;
  let hasUnfamiliarRetrieval = false;
  let lastCorrectTime: number | null = null;
  let currentLevel: MasteryLevel = 'not_started';

  const windowResults: ('correct' | 'partial' | 'incorrect')[] = [];

  for (const attempt of demonstrated) {
    const attemptTime = new Date(attempt.createdAt).getTime();

    if (attempt.result === 'correct') {
      correctCount++;
      windowResults.push('correct');

      if (lastCorrectTime !== null) {
        const diffHours = (attemptTime - lastCorrectTime) / (1000 * 60 * 60);
        if (diffHours >= MASTERY_DELAYED_RETRIEVAL_HOURS) {
          hasDelayedRetrieval = true;
        }
      }
      lastCorrectTime = attemptTime;

      if (attempt.context === 'challenge' || attempt.context === 'section_check') {
        hasUnfamiliarRetrieval = true;
      }

      // Transition upward
      if (currentLevel === 'not_started') {
        currentLevel = 'started';
      }
      if (correctCount >= 2 && currentLevel === 'started') {
        currentLevel = 'familiar';
      }

      // Proficient requires >= 3 correct and recent accuracy >= 75%
      const recentWindow = windowResults.slice(-4);
      const recentCorrect = recentWindow.filter((r) => r === 'correct').length;
      const recentAccuracy = recentCorrect / recentWindow.length;

      if (correctCount >= 3 && recentAccuracy >= 0.75) {
        if (currentLevel === 'familiar' || currentLevel === 'started') {
          currentLevel = 'proficient';
        }
      }

      // Mastered requires Proficient + (delayed OR unfamiliar retrieval) + no current lapse
      if (
        (currentLevel === 'proficient' || currentLevel === 'mastered') &&
        (hasDelayedRetrieval || hasUnfamiliarRetrieval)
      ) {
        currentLevel = 'mastered';
      }
    } else if (attempt.result === 'incorrect') {
      lapsesCount++;
      windowResults.push('incorrect');

      // Demotion rules:
      // A lapse at Mastered drops to Familiar
      // A lapse at Proficient drops to Familiar
      // After a lapse, post-lapse retention must be demonstrated afresh
      hasDelayedRetrieval = false;
      hasUnfamiliarRetrieval = false;
      lastCorrectTime = null;

      if (currentLevel === 'mastered' || currentLevel === 'proficient') {
        currentLevel = 'familiar';
      } else if (currentLevel === 'familiar' && lapsesCount >= 3) {
        currentLevel = 'started';
      } else if (currentLevel === 'not_started') {
        currentLevel = 'started';
      }
    } else if (attempt.result === 'partial') {
      windowResults.push('partial');
      if (currentLevel === 'not_started') {
        currentLevel = 'started';
      }
    }
  }

  const latest = demonstrated[demonstrated.length - 1];

  return {
    level: currentLevel,
    demonstratedAttemptsCount: demonstrated.length,
    correctDemonstratedCount: correctCount,
    lapsesCount,
    hasDelayedRetrieval,
    hasUnfamiliarRetrieval,
    isSelfRatedOnly: false,
    lastAttemptResult: latest?.result ?? null,
  };
}

/**
 * Aggregates card mastery states into a section or card set mastery summary.
 */
export function evaluateAggregateMastery(
  cardStates: CardMasteryState[],
  sectionName = ''
): SectionMasterySummary {
  const levelCounts: Record<MasteryLevel, number> = {
    not_started: 0,
    started: 0,
    familiar: 0,
    proficient: 0,
    mastered: 0,
  };

  let demonstratedCardsCount = 0;
  let selfRatedCardsCount = 0;

  for (const state of cardStates) {
    levelCounts[state.level]++;
    if (state.demonstratedAttemptsCount > 0) {
      demonstratedCardsCount++;
    } else if (state.isSelfRatedOnly) {
      selfRatedCardsCount++;
    }
  }

  const totalCards = cardStates.length;
  let overallLevel: MasteryLevel = 'not_started';

  if (totalCards > 0) {
    if (levelCounts.mastered / totalCards >= 0.8) {
      overallLevel = 'mastered';
    } else if ((levelCounts.proficient + levelCounts.mastered) / totalCards >= 0.7) {
      overallLevel = 'proficient';
    } else if (
      (levelCounts.familiar + levelCounts.proficient + levelCounts.mastered) / totalCards >=
      0.5
    ) {
      overallLevel = 'familiar';
    } else if (demonstratedCardsCount > 0) {
      overallLevel = 'started';
    }
  }

  return {
    sectionName,
    level: overallLevel,
    totalCards,
    levelCounts,
    demonstratedCardsCount,
    selfRatedCardsCount,
  };
}

/**
 * Calculates reading coverage from page dwell durations.
 * Only pages with total dwell >= 30 seconds count toward verified read pages.
 */
export function calculateReadingCoverage(
  totalBookPages: number,
  pageDwells: { page: number; totalDwellSeconds: number }[]
): ReadingCoverageProgress {
  const validTotal = Math.max(1, totalBookPages);
  let readPagesCount = 0;
  let openedPagesCount = 0;
  let totalDwellSeconds = 0;

  for (const item of pageDwells) {
    totalDwellSeconds += item.totalDwellSeconds;
    if (item.totalDwellSeconds >= MIN_READING_COVERAGE_DWELL_SECONDS) {
      readPagesCount++;
    } else if (item.totalDwellSeconds > 0) {
      openedPagesCount++;
    }
  }

  const coveragePercent = Math.min(100, Math.round((readPagesCount / validTotal) * 100));

  return {
    totalBookPages: validTotal,
    readPagesCount,
    openedPagesCount,
    coveragePercent,
    totalDwellSeconds,
    verifiedDwellThresholdSeconds: MIN_READING_COVERAGE_DWELL_SECONDS,
  };
}

/**
 * Calculates reviews due from SRS due dates (today and across the next 7 days).
 */
export function calculateReviewsDue(srsDueDates: string[], now = new Date()): ReviewsDueProgress {
  const nowMs = now.getTime();

  // End of today: 23:59:59.999
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const endOfTodayMs = endOfToday.getTime();

  // Start of today: 00:00:00.000
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();

  // End of this week (7 days from now)
  const endOfWeekMs = nowMs + 7 * 86400 * 1000;

  let dueTodayCount = 0;
  let dueThisWeekCount = 0;
  let overdueCount = 0;
  let nextDueAt: string | null = null;
  let nextDueMs: number | null = null;

  for (const dateStr of srsDueDates) {
    if (!dateStr) continue;
    const dueMs = new Date(dateStr).getTime();
    if (Number.isNaN(dueMs)) continue;

    if (dueMs < startOfTodayMs) {
      overdueCount++;
    }
    if (dueMs <= endOfTodayMs) {
      dueTodayCount++;
    }
    if (dueMs <= endOfWeekMs) {
      dueThisWeekCount++;
    }

    if (dueMs > nowMs) {
      if (nextDueMs === null || dueMs < nextDueMs) {
        nextDueMs = dueMs;
        nextDueAt = dateStr;
      }
    }
  }

  return {
    dueTodayCount,
    dueThisWeekCount,
    overdueCount,
    totalScheduledCards: srsDueDates.length,
    nextDueAt,
  };
}
