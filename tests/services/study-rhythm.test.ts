import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WEEKLY_RHYTHM,
  validateWeeklyRhythmConfig,
  selectTodaySteps,
  isDayActive,
  evaluateWeeklyRhythm,
  type WeeklyRhythmConfig,
  type TodayCandidateStep,
  type DayActivityRecord,
} from '../../src/shared/study-rhythm';

test('KEY-283: Study Workspace 5 — Weekly Rhythm & Today Panel', async (t) => {
  await t.test('Settings: validation, bounds and Friday rest-day default', () => {
    // Default config has Friday (5) as rest day
    assert.deepEqual(DEFAULT_WEEKLY_RHYTHM.restDays, [5]);
    assert.equal(DEFAULT_WEEKLY_RHYTHM.goalUnit, 'minutes');
    assert.equal(DEFAULT_WEEKLY_RHYTHM.goalValue, 60);
    assert.equal(DEFAULT_WEEKLY_RHYTHM.celebrationsEnabled, true);

    // Valid inputs
    const valid = validateWeeklyRhythmConfig({
      goalValue: 120,
      goalUnit: 'reviews',
      restDays: [5, 6], // Friday & Saturday
      celebrationsEnabled: false,
      dailyReminderTime: '18:30',
    });
    assert.equal(valid.goalValue, 120);
    assert.equal(valid.goalUnit, 'reviews');
    assert.deepEqual(valid.restDays, [5, 6]);
    assert.equal(valid.celebrationsEnabled, false);
    assert.equal(valid.dailyReminderTime, '18:30');

    // Invalid goal value (0, negative, floating point, too large)
    assert.throws(() => validateWeeklyRhythmConfig({ ...DEFAULT_WEEKLY_RHYTHM, goalValue: 0 }), /invalid-request/);
    assert.throws(() => validateWeeklyRhythmConfig({ ...DEFAULT_WEEKLY_RHYTHM, goalValue: -10 }), /invalid-request/);
    assert.throws(() => validateWeeklyRhythmConfig({ ...DEFAULT_WEEKLY_RHYTHM, goalValue: 15.5 }), /invalid-request/);
    assert.throws(() => validateWeeklyRhythmConfig({ ...DEFAULT_WEEKLY_RHYTHM, goalValue: 99999 }), /invalid-request/);

    // Invalid goal unit
    assert.throws(() => validateWeeklyRhythmConfig({ ...DEFAULT_WEEKLY_RHYTHM, goalUnit: 'xp' as unknown as WeeklyRhythmConfig['goalUnit'] }), /invalid-request/);

    // Invalid rest days
    assert.throws(() => validateWeeklyRhythmConfig({ ...DEFAULT_WEEKLY_RHYTHM, restDays: [7] }), /invalid-request/);
    assert.throws(() => validateWeeklyRhythmConfig({ ...DEFAULT_WEEKLY_RHYTHM, restDays: [5, 5] }), /invalid-request/);

    // Invalid reminder time format
    assert.throws(() => validateWeeklyRhythmConfig({ ...DEFAULT_WEEKLY_RHYTHM, dailyReminderTime: '25:00' }), /invalid-request/);
    assert.throws(() => validateWeeklyRhythmConfig({ ...DEFAULT_WEEKLY_RHYTHM, dailyReminderTime: '8am' }), /invalid-request/);
  });

  await t.test('Day counting: 1 meaningful action makes a day active', () => {
    // Inactive day
    assert.equal(isDayActive({ date: '2026-11-09' }), false);

    // 1 SRS review counts
    assert.equal(isDayActive({ date: '2026-11-09', srsReviewsCount: 1 }), true);

    // 1 page read with dwell >= 30s counts
    assert.equal(isDayActive({ date: '2026-11-09', maxPageDwellSeconds: 30 }), true);
    assert.equal(isDayActive({ date: '2026-11-09', maxPageDwellSeconds: 45 }), true);
    // Dwell below 30s does not count
    assert.equal(isDayActive({ date: '2026-11-09', maxPageDwellSeconds: 25 }), false);

    // 1 practice answer counts
    assert.equal(isDayActive({ date: '2026-11-09', practiceAttemptsCount: 1 }), true);

    // 1 completed planner task counts
    assert.equal(isDayActive({ date: '2026-11-09', completedTasksCount: 1 }), true);
  });

  await t.test('Rest days: two rest days a week kept automatically; missed day uses rest day silently', () => {
    const config: WeeklyRhythmConfig = {
      goalValue: 5,
      goalUnit: 'reviews',
      restDays: [5], // Friday default
      celebrationsEnabled: true,
      dailyReminderTime: null,
    };

    // Week starting Saturday 2026-11-07 to Friday 2026-11-13
    // Sat (active), Sun (active), Mon (inactive -> silently uses rest day 1),
    // Tue (active), Wed (active), Thu (active), Fri (scheduled rest day 2)
    const weekActivities: DayActivityRecord[] = [
      { date: '2026-11-07', dayOfWeek: 6, srsReviewsCount: 2 }, // Sat
      { date: '2026-11-08', dayOfWeek: 0, completedTasksCount: 1 }, // Sun
      { date: '2026-11-09', dayOfWeek: 1 }, // Mon - inactive!
      { date: '2026-11-10', dayOfWeek: 2, maxPageDwellSeconds: 60 }, // Tue
      { date: '2026-11-11', dayOfWeek: 3, practiceAttemptsCount: 1 }, // Wed
      { date: '2026-11-12', dayOfWeek: 4, srsReviewsCount: 1 }, // Thu
      { date: '2026-11-13', dayOfWeek: 5 }, // Fri - scheduled rest day
    ];

    const evaluation = evaluateWeeklyRhythm(weekActivities, config, '2026-11-13');

    assert.equal(evaluation.activeDaysCount, 5);
    assert.equal(evaluation.restDaysUsed, 2);
    assert.equal(evaluation.unreachedDaysCount, 0);
    assert.equal(evaluation.weeklyGoalMet, true);

    // Mon should be marked as auto-rest (silent rest day)
    const mon = evaluation.days.find(d => d.date === '2026-11-09');
    assert.equal(mon?.status, 'rest');
    assert.equal(mon?.isAutoRest, true);

    // Fri should be marked as scheduled rest
    const fri = evaluation.days.find(d => d.date === '2026-11-13');
    assert.equal(fri?.status, 'rest');
    assert.equal(fri?.isAutoRest, false);

    // Check guilt-free representation: no guilt properties or penalties
    assert.equal((evaluation as unknown as Record<string, unknown>).streakLost, undefined);
    assert.equal((evaluation as unknown as Record<string, unknown>).penalty, undefined);
  });

  await t.test('Rest days: more than 2 inactive days marks excess days as unreached without guilt', () => {
    const config: WeeklyRhythmConfig = {
      goalValue: 5,
      goalUnit: 'reviews',
      restDays: [5], // Friday default
      celebrationsEnabled: true,
      dailyReminderTime: null,
    };

    const weekActivities: DayActivityRecord[] = [
      { date: '2026-11-07', dayOfWeek: 6, srsReviewsCount: 2 }, // Sat active
      { date: '2026-11-08', dayOfWeek: 0 }, // Sun inactive -> uses rest day 1
      { date: '2026-11-09', dayOfWeek: 1 }, // Mon inactive -> uses rest day 2
      { date: '2026-11-10', dayOfWeek: 2 }, // Tue inactive -> unreached (2 rest days already used)
      { date: '2026-11-11', dayOfWeek: 3, practiceAttemptsCount: 1 }, // Wed active
      { date: '2026-11-12', dayOfWeek: 4, srsReviewsCount: 1 }, // Thu active
      { date: '2026-11-13', dayOfWeek: 5 }, // Fri -> unreached (cannot use 3rd rest day)
    ];

    const evaluation = evaluateWeeklyRhythm(weekActivities, config, '2026-11-13');
    assert.equal(evaluation.activeDaysCount, 3);
    assert.equal(evaluation.restDaysUsed, 2);
    assert.equal(evaluation.unreachedDaysCount, 2);
    // Notice: status is 'unreached', not 'failed' or 'lost'
    const tue = evaluation.days.find(d => d.date === '2026-11-10');
    assert.equal(tue?.status, 'unreached');
  });

  await t.test('Step selection: deterministic order (due date, priority, age) and caps at 3', () => {
    const today = '2026-11-09';
    const candidates: TodayCandidateStep[] = [
      {
        id: 'planner:task-1',
        kind: 'planner',
        title: 'Review Chapter 3',
        dueDate: '2026-11-10', // tomorrow
        priority: 1,
        createdAt: '2026-11-01T10:00:00Z',
      },
      {
        id: 'planner:task-overdue',
        kind: 'planner',
        title: 'Overdue Fiqh Assignment',
        dueDate: '2026-11-05', // overdue!
        priority: 0,
        createdAt: '2026-11-02T10:00:00Z',
      },
      {
        id: 'srs:due-cards',
        kind: 'srs',
        title: 'Review 15 due cards',
        dueDate: '2026-11-09', // due today!
        priority: 2,
        createdAt: '2026-11-01T08:00:00Z',
      },
      {
        id: 'pathway:usul-step-1',
        kind: 'pathway',
        title: 'Read introduction to Usul',
        dueDate: null, // undated
        priority: 1,
        createdAt: '2026-11-03T12:00:00Z',
      },
      {
        id: 'planner:task-today-high-prio',
        kind: 'planner',
        title: 'High priority task today',
        dueDate: '2026-11-09', // due today!
        priority: 2,
        createdAt: '2026-11-04T12:00:00Z',
      },
    ];

    const result = selectTodaySteps(candidates, today);
    // Caps at 3 concrete steps
    assert.equal(result.activeSteps.length, 3);
    // Overdue task comes first
    assert.equal(result.activeSteps[0].id, 'planner:task-overdue');
    // Today's high-priority cards / tasks come next, ordered by age
    assert.equal(result.activeSteps[1].id, 'srs:due-cards');
    assert.equal(result.activeSteps[2].id, 'planner:task-today-high-prio');

    // Remaining candidates in reserve pool for swapping
    assert.equal(result.pool.length, 2);
    assert.equal(result.pool[0].id, 'planner:task-1');
    assert.equal(result.pool[1].id, 'pathway:usul-step-1');
  });

  await t.test('Step selection: swapping and skipping steps for today', () => {
    const today = '2026-11-09';
    const candidates: TodayCandidateStep[] = [
      { id: 'step-1', kind: 'planner', title: 'Step 1', dueDate: today, priority: 1, createdAt: '2026-11-01T00:00:00Z' },
      { id: 'step-2', kind: 'planner', title: 'Step 2', dueDate: today, priority: 1, createdAt: '2026-11-02T00:00:00Z' },
      { id: 'step-3', kind: 'planner', title: 'Step 3', dueDate: today, priority: 1, createdAt: '2026-11-03T00:00:00Z' },
      { id: 'step-4', kind: 'pathway', title: 'Step 4', dueDate: today, priority: 0, createdAt: '2026-11-04T00:00:00Z' },
      { id: 'step-5', kind: 'srs', title: 'Step 5', dueDate: today, priority: 0, createdAt: '2026-11-05T00:00:00Z' },
    ];

    // Initial 3 active steps
    const initial = selectTodaySteps(candidates, today);
    assert.deepEqual(initial.activeSteps.map(s => s.id), ['step-1', 'step-2', 'step-3']);

    // Skipping step-2 for today
    const withSkipped = selectTodaySteps(candidates, today, { skippedIds: ['step-2'] });
    assert.deepEqual(withSkipped.activeSteps.map(s => s.id), ['step-1', 'step-3', 'step-4']);

    // Swapping step-1: step-1 is replaced by step-4 (the first pool item)
    const withSwapped = selectTodaySteps(candidates, today, { swappedIds: ['step-1'] });
    assert.deepEqual(withSwapped.activeSteps.map(s => s.id), ['step-2', 'step-3', 'step-4']);
  });

  await t.test('Step selection: handles empty and low candidate counts gracefully', () => {
    const today = '2026-11-09';
    const emptyResult = selectTodaySteps([], today);
    assert.equal(emptyResult.activeSteps.length, 0);
    assert.equal(emptyResult.pool.length, 0);

    const singleResult = selectTodaySteps([
      { id: 'only-one', kind: 'srs', title: 'Review 5 cards', dueDate: today, priority: 1, createdAt: '2026-11-01T00:00:00Z' }
    ], today);
    assert.equal(singleResult.activeSteps.length, 1);
    assert.equal(singleResult.activeSteps[0].id, 'only-one');
    assert.equal(singleResult.pool.length, 0);
  });

  await t.test('Weekly rhythm: page and minute goal progress calculation', () => {
    const pageConfig: WeeklyRhythmConfig = {
      goalValue: 20,
      goalUnit: 'pages',
      restDays: [5],
      celebrationsEnabled: true,
      dailyReminderTime: null,
    };
    const records: DayActivityRecord[] = [
      { date: '2026-11-07', dayOfWeek: 6, pagesRead: 10, maxPageDwellSeconds: 600 },
      { date: '2026-11-08', dayOfWeek: 0, pagesRead: 12, maxPageDwellSeconds: 700 },
    ];
    const evalResult = evaluateWeeklyRhythm(records, pageConfig, '2026-11-08');
    assert.equal(evalResult.currentWeeklyValue, 22);
    assert.equal(evalResult.targetWeeklyValue, 20);
    assert.equal(evalResult.weeklyGoalMet, true);
    assert.equal(evalResult.activeDaysCount, 2);
  });
});
