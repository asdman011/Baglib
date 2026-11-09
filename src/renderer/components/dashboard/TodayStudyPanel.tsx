'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  Calendar,
  CheckCircle2,
  Coffee,
  ArrowRightLeft,
  SkipForward,
  Play,
  Settings,
  X,
  Award,
  Clock,
  Layers,
  BookOpen,
  CheckSquare,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { calculateHijriDate } from '../../../shared/athan-calculator';
import { civilDate, addCivilDays } from '../../../shared/study-planner';
import { navigateStudyReference } from '../../utils/study-navigation';
import {
  WEEKLY_RHYTHM_SETTINGS_KEY,
  WEEKLY_RHYTHM_CHANGED_EVENT,
  DEFAULT_WEEKLY_RHYTHM,
  validateWeeklyRhythmConfig,
  evaluateWeeklyRhythm,
  selectTodaySteps,
  type WeeklyRhythmConfig,
  type TodayCandidateStep,
  type DayActivityRecord,
  type WeeklyGoalUnit,
} from '../../../shared/study-rhythm';

export function TodayStudyPanel() {
  const { t, lang, dir, books, openBookForReading, setViewMode } = useWorkspace();

  const [todayStr] = useState(() => civilDate(new Date()));
  const [config, setConfig] = useState<WeeklyRhythmConfig>(DEFAULT_WEEKLY_RHYTHM);
  const [activities, setActivities] = useState<DayActivityRecord[]>([]);
  const [candidates, setCandidates] = useState<TodayCandidateStep[]>([]);
  const [skippedIds, setSkippedIds] = useState<string[]>([]);
  const [swappedIds, setSwappedIds] = useState<string[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<WeeklyRhythmConfig>(DEFAULT_WEEKLY_RHYTHM);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const skipStorageKey = useMemo(() => `study.today.skipped.v1:${todayStr}`, [todayStr]);

  // Load config & skipped steps
  useEffect(() => {
    let alive = true;
    const loadSettings = async () => {
      try {
        const raw = await window.electronAPI?.settings?.get?.(WEEKLY_RHYTHM_SETTINGS_KEY, DEFAULT_WEEKLY_RHYTHM);
        if (alive && raw) {
          const valid = validateWeeklyRhythmConfig(raw);
          setConfig(valid);
          setSettingsDraft(valid);
        }
      } catch {
        // Fallback to default
      }
      try {
        const skipped = await window.electronAPI?.settings?.get?.(skipStorageKey, []);
        if (alive && Array.isArray(skipped)) {
          setSkippedIds(skipped as string[]);
        }
      } catch {}
    };

    void loadSettings();
    const handleSettingsChanged = () => void loadSettings();
    window.addEventListener(WEEKLY_RHYTHM_CHANGED_EVENT, handleSettingsChanged);
    return () => {
      alive = false;
      window.removeEventListener(WEEKLY_RHYTHM_CHANGED_EVENT, handleSettingsChanged);
    };
  }, [skipStorageKey]);

  // Load daily activity & candidates from planner, SRS and pathways
  useEffect(() => {
    let alive = true;
    const loadData = async () => {
      const candidateList: TodayCandidateStep[] = [];

      // 1. Weekly activity
      try {
        const records = await window.electronAPI?.studyInsights?.rhythmDailyActivity?.(14);
        if (alive && Array.isArray(records)) {
          setActivities(records);
        }
      } catch {}

      // 2. Planner tasks
      try {
        const tasks = await window.electronAPI?.planner?.list?.();
        if (alive && Array.isArray(tasks)) {
          for (const task of tasks) {
            if (task.status === 'completed' || task.status === 'cancelled') continue;
            candidateList.push({
              id: `planner:${task.id}`,
              kind: 'planner',
              title: task.title,
              subtitle: task.description || undefined,
              dueDate: task.dueDate || null,
              priority: task.priority,
              createdAt: task.createdAt,
              target: task.references?.[0]?.target || `planner:${task.id}`,
              payload: { taskId: task.id },
            });
          }
        }
      } catch {}

      // 3. Due SRS cards
      try {
        const queue = await window.electronAPI?.knowledgeCards?.reviewQueue?.();
        if (alive && queue && typeof queue.due === 'number' && queue.due > 0) {
          candidateList.push({
            id: 'srs:due-cards',
            kind: 'srs',
            title: t('todaySrsReviewTitle', { count: queue.due }),
            subtitle: t('todaySrsReviewSubtitle'),
            dueDate: todayStr,
            priority: 2, // High priority because cards are due
            createdAt: queue.cards?.[0]?.createdAt || new Date().toISOString(),
            target: 'notes',
            payload: { count: queue.due },
          });
        }
      } catch {}

      // 4. Pathways unfinished steps
      try {
        const pathwaysList = await window.electronAPI?.pathways?.list?.();
        if (alive && Array.isArray(pathwaysList)) {
          for (const pathway of pathwaysList) {
            if (pathway.done >= pathway.steps) continue;
            try {
              const detail = await window.electronAPI?.pathways?.get?.(pathway.id);
              if (detail?.items && Array.isArray(detail.items)) {
                const nextStep = detail.items.find(
                  (item: { kind?: string; done?: boolean; id: string; title: string; section?: string; createdAt?: string; reference?: string }) =>
                    item.kind === 'step' && !item.done
                );
                if (nextStep) {
                  candidateList.push({
                    id: `pathway:${pathway.id}:${nextStep.id}`,
                    kind: 'pathway',
                    title: nextStep.title,
                    subtitle: `${pathway.name}${nextStep.section ? ` — ${nextStep.section}` : ''}`,
                    dueDate: null,
                    priority: 1,
                    createdAt: nextStep.createdAt || new Date().toISOString(),
                    target: nextStep.reference || `pathway:${pathway.id}`,
                    payload: { pathwayId: pathway.id, itemId: nextStep.id },
                  });
                }
              }
            } catch {}
          }
        }
      } catch {}

      if (alive) {
        setCandidates(candidateList);
      }
    };

    void loadData();
    return () => {
      alive = false;
    };
  }, [t, todayStr]);

  // Evaluate weekly rhythm for the current 7-day week (Saturday through Friday)
  const rhythmEvaluation = useMemo(() => {
    const today = new Date();
    // Align week start to Saturday (offset = (today.getDay() + 1) % 7)
    const satOffset = (today.getDay() + 1) % 7;
    const weekStart = addCivilDays(today, -satOffset);

    const weekDays: DayActivityRecord[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addCivilDays(weekStart, i);
      const dStr = civilDate(d);
      const existing = activities.find(a => a.date === dStr);
      weekDays.push(
        existing || {
          date: dStr,
          dayOfWeek: d.getDay(),
          srsReviewsCount: 0,
          maxPageDwellSeconds: 0,
          pagesRead: 0,
          readingMinutes: 0,
          practiceAttemptsCount: 0,
          completedTasksCount: 0,
        }
      );
    }

    return evaluateWeeklyRhythm(weekDays, config, todayStr);
  }, [activities, config, todayStr]);

  // Select up to 3 concrete steps
  const { activeSteps } = useMemo(() => {
    return selectTodaySteps(candidates, todayStr, {
      skippedIds,
      swappedIds,
      maxSteps: 3,
    });
  }, [candidates, todayStr, skippedIds, swappedIds]);

  // User actions
  const handleSwap = (stepId: string) => {
    setSwappedIds(prev => [...prev, stepId]);
  };

  const handleSkip = async (stepId: string) => {
    const updated = [...skippedIds, stepId];
    setSkippedIds(updated);
    try {
      await window.electronAPI?.settings?.set?.(skipStorageKey, updated);
    } catch {}
  };

  const handleOpenStep = async (step: TodayCandidateStep) => {
    if (!step.target) return;
    if (step.target.startsWith('book:') || step.target.startsWith('note:')) {
      try {
        await navigateStudyReference(
          step.target,
          books,
          openBookForReading,
          () => setViewMode('notes')
        );
      } catch {}
    } else if (step.kind === 'srs') {
      setViewMode('notes');
    } else if (step.kind === 'planner') {
      setViewMode('planner');
    } else if (step.kind === 'pathway') {
      setViewMode('pathways');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const valid = validateWeeklyRhythmConfig(settingsDraft);
      await window.electronAPI?.settings?.set?.(WEEKLY_RHYTHM_SETTINGS_KEY, valid);
      setConfig(valid);
      window.dispatchEvent(new Event(WEEKLY_RHYTHM_CHANGED_EVENT));
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setIsSettingsOpen(false);
      }, 800);
    } catch {}
  };

  // Date formatted strings
  const todayDateObj = useMemo(() => new Date(), []);
  const hijri = useMemo(() => calculateHijriDate(todayDateObj), [todayDateObj]);
  const gregorianFormatted = useMemo(() => {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(todayDateObj);
  }, [lang, todayDateObj]);

  const hijriFormatted = lang === 'ar' ? hijri.formattedAr : hijri.formattedEn;

  // Day name labels
  const getDayLabel = (dayOfWeek: number) => {
    switch (dayOfWeek) {
      case 6: return t('todayDaySat');
      case 0: return t('todayDaySun');
      case 1: return t('todayDayMon');
      case 2: return t('todayDayTue');
      case 3: return t('todayDayWed');
      case 4: return t('todayDayThu');
      case 5: return t('todayDayFri');
      default: return '';
    }
  };

  const getGoalUnitLabel = (unit: WeeklyGoalUnit) => {
    switch (unit) {
      case 'minutes': return t('todayGoalMinutes');
      case 'reviews': return t('todayGoalReviews');
      case 'pages': return t('todayGoalPages');
    }
  };

  return (
    <section
      data-today-study-panel
      dir={dir}
      className="rounded-2xl border border-subtle bg-surface/70 p-4 sm:p-5 shadow-sm space-y-5 text-main transition-all"
    >
      {/* Top Header: Title, Dates, Settings */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle/50 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pale-sky-500/15 text-pale-sky-600 dark:text-pale-sky-400 border border-pale-sky-500/30">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold leading-tight">{t('todayStudyTitle')}</h2>
            <p className="text-xs text-muted mt-0.5">{t('todayStudySubtitle')}</p>
            <p className="text-xs text-muted flex flex-wrap items-center gap-1.5 mt-0.5" data-today-date-display>
              <Calendar className="h-3.5 w-3.5 inline text-emerald-500" />
              <span>{gregorianFormatted}</span>
              <span className="opacity-40">•</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">{hijriFormatted}</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          data-today-settings-button
          onClick={() => setIsSettingsOpen(true)}
          title={t('todayRhythmSettings')}
          aria-label={t('todayRhythmSettings')}
          className="flex items-center gap-1.5 rounded-xl border border-subtle bg-surface px-3 py-1.5 text-xs text-muted hover:text-main hover:bg-surface/90 cursor-pointer transition-all shrink-0"
        >
          <Settings className="h-3.5 w-3.5" />
          <span>{t('todayRhythmSettings')}</span>
        </button>
      </div>

      {/* Weekly Rhythm Section */}
      <div className="space-y-3" data-today-weekly-rhythm>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs sm:text-sm font-semibold text-muted flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-emerald-500" />
            <span>{t('todayWeeklyRhythmTitle')}</span>
          </h3>

          <div className="text-xs text-muted font-medium" data-today-active-days-count>
            {t('todayActiveDays', {
              active: rhythmEvaluation.activeDaysCount,
              total: 5,
            })}
          </div>
        </div>

        {/* 7-Day Rhythm Strip (Saturday to Friday) */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5" role="list" aria-label={t('todayWeeklyRhythmTitle')}>
          {rhythmEvaluation.days.map((day) => {
            const isToday = day.date === todayStr;
            const dateNum = day.date.split('-')[2];

            let badgeBg = 'bg-surface/50 border-subtle/50 text-muted';
            let icon = null;
            const statusTitle =
              day.status === 'active'
                ? t('todayActiveDay')
                : day.status === 'rest'
                ? t('todayRestDay')
                : t('todayUnreachedDay');

            if (day.status === 'active') {
              badgeBg = 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-bold';
              icon = <CheckCircle2 className="h-3.5 w-3.5" />;
            } else if (day.status === 'rest') {
              badgeBg = 'bg-pale-sky-500/15 border-pale-sky-500/40 text-pale-sky-600 dark:text-pale-sky-400';
              icon = <Coffee className="h-3.5 w-3.5" />;
            } else if (day.status === 'unreached') {
              badgeBg = 'bg-canvas border-subtle/40 text-muted/60';
              icon = <span className="text-xs font-bold leading-none">—</span>;
            }

            return (
              <div
                key={day.date}
                role="listitem"
                title={statusTitle}
                aria-label={`${getDayLabel(day.dayOfWeek)}: ${statusTitle}`}
                data-rhythm-day={day.date}
                data-rhythm-status={day.status}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all text-center ${badgeBg} ${
                  isToday ? 'ring-2 ring-emerald-500/50 shadow-sm' : ''
                }`}
              >
                <span className="text-[10px] sm:text-xs text-muted font-medium">
                  {getDayLabel(day.dayOfWeek)}
                </span>
                <span className="text-xs sm:text-sm font-bold my-0.5">{dateNum}</span>
                <span className="h-4 flex items-center justify-center">{icon}</span>
              </div>
            );
          })}
        </div>

        {/* Weekly Goal Progress Bar */}
        <div className="space-y-1.5 pt-1" data-today-goal-progress>
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted">{t('todayGoalLabel')}</span>
            <span className="font-semibold text-main">
              {rhythmEvaluation.currentWeeklyValue} / {rhythmEvaluation.targetWeeklyValue}{' '}
              {getGoalUnitLabel(rhythmEvaluation.goalUnit)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-subtle/30">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-pale-sky-500 transition-all duration-300"
              style={{
                width: `${Math.min(
                  100,
                  Math.round(
                    (rhythmEvaluation.currentWeeklyValue /
                      Math.max(1, rhythmEvaluation.targetWeeklyValue)) *
                      100
                  )
                )}%`,
              }}
            />
          </div>
        </div>

        {/* Milestone Celebration Banner */}
        {rhythmEvaluation.weeklyGoalMet && rhythmEvaluation.celebrationsEnabled && (
          <div
            data-today-milestone-banner
            className="flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 to-pale-sky-500/10 p-3 text-emerald-800 dark:text-emerald-200 motion-safe:animate-fade-in"
          >
            <Award className="h-6 w-6 text-emerald-500 shrink-0" />
            <div className="text-xs">
              <p className="font-bold">{t('todayMilestoneCelebration')}</p>
              <p className="opacity-90">{t('todayMilestoneDesc')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Suggested 3 Concrete Steps Section */}
      <div className="space-y-3 pt-2 border-t border-subtle/40" data-today-steps-section>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-main">{t('todayThreeStepsTitle')}</h3>
            <p className="text-xs text-muted">{t('todayThreeStepsHint')}</p>
          </div>
        </div>

        {activeSteps.length === 0 ? (
          <div
            data-today-empty-steps
            className="flex flex-col items-center justify-center p-6 rounded-xl border border-dashed border-subtle bg-canvas/30 text-center space-y-1.5"
          >
            <CheckCircle2 className="h-8 w-8 text-emerald-500/80 mb-1" />
            <p className="text-sm font-bold text-main">{t('todayAllCaughtUp')}</p>
            <p className="text-xs text-muted max-w-sm">{t('todayAllCaughtUpDesc')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-today-steps-list>
            {activeSteps.map((step) => {
              const isOverdue = step.dueDate !== null && step.dueDate < todayStr;
              const isDueToday = step.dueDate === todayStr;

              let kindIcon = <CheckSquare className="h-3.5 w-3.5 text-pale-sky-500" />;
              let kindLabel = t('todayStepPlanner');
              if (step.kind === 'srs') {
                kindIcon = <Layers className="h-3.5 w-3.5 text-amber-500" />;
                kindLabel = t('todayStepSrs');
              } else if (step.kind === 'pathway') {
                kindIcon = <BookOpen className="h-3.5 w-3.5 text-emerald-500" />;
                kindLabel = t('todayStepPathway');
              }

              return (
                <div
                  key={step.id}
                  data-today-step={step.id}
                  data-today-step-id={step.id}
                  className="flex flex-col justify-between rounded-xl border border-subtle bg-surface p-3.5 shadow-xs hover:border-pale-sky-500/40 transition-all space-y-3"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center justify-between gap-1 text-[11px]">
                      <span className="flex items-center gap-1 font-semibold text-muted">
                        {kindIcon}
                        <span>{kindLabel}</span>
                      </span>

                      {isOverdue ? (
                        <span className="rounded-md bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                          {t('todayStepOverdue')}
                        </span>
                      ) : isDueToday ? (
                        <span className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          {t('todayStepDueToday')}
                        </span>
                      ) : null}
                    </div>

                    <h4 className="text-xs sm:text-sm font-bold text-main line-clamp-2 leading-snug">
                      {step.title}
                    </h4>

                    {step.subtitle && (
                      <p className="text-xs text-muted line-clamp-2 leading-relaxed">
                        {step.subtitle}
                      </p>
                    )}
                  </div>

                  {/* Actions: Start, Swap, Skip for today */}
                  <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-subtle/30 text-xs">
                    <button
                      type="button"
                      data-today-step-open
                      onClick={() => void handleOpenStep(step)}
                      className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 px-2.5 cursor-pointer shadow-xs transition-all"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      <span>{t('todayStepOpen')}</span>
                    </button>

                    <button
                      type="button"
                      data-today-step-swap
                      onClick={() => handleSwap(step.id)}
                      title={t('todayStepSwap')}
                      aria-label={t('todayStepSwap')}
                      className="flex items-center justify-center rounded-lg border border-subtle p-1.5 text-muted hover:text-main hover:bg-surface/80 cursor-pointer transition-all"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      data-today-step-skip
                      onClick={() => void handleSkip(step.id)}
                      title={t('todayStepSkip')}
                      aria-label={t('todayStepSkip')}
                      className="flex items-center justify-center rounded-lg border border-subtle p-1.5 text-muted hover:text-main hover:bg-surface/80 cursor-pointer transition-all"
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div
          role="dialog"
          data-today-settings-modal
          aria-modal="true"
          aria-label={t('todayRhythmSettings')}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-subtle bg-surface p-5 shadow-xl space-y-4 text-main"
            onClick={(e) => e.stopPropagation()}
            dir={dir}
          >
            <div className="flex items-center justify-between border-b border-subtle pb-3">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Settings className="h-4 w-4 text-pale-sky-500" />
                <span>{t('todayRhythmSettings')}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="rounded-lg p-1 text-muted hover:text-main cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveSettings(e)} className="space-y-4">
              {/* Goal value & Unit */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted block">
                  {t('todayGoalLabel')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    value={settingsDraft.goalValue}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, goalValue: Number(e.target.value) })
                    }
                    className="flex-1 rounded-xl border border-subtle bg-canvas p-2 text-sm text-main"
                  />
                  <select
                    value={settingsDraft.goalUnit}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        goalUnit: e.target.value as WeeklyGoalUnit,
                      })
                    }
                    className="rounded-xl border border-subtle bg-canvas p-2 text-sm text-main cursor-pointer"
                  >
                    <option value="minutes">{t('todayGoalMinutes')}</option>
                    <option value="reviews">{t('todayGoalReviews')}</option>
                    <option value="pages">{t('todayGoalPages')}</option>
                  </select>
                </div>
              </div>

              {/* Rest Days selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted block">
                  {t('todayRestDaysLabel')}
                </label>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  {[6, 0, 1, 2, 3, 4, 5].map((d) => {
                    const checked = settingsDraft.restDays.includes(d);
                    return (
                      <label
                        key={d}
                        className={`flex items-center justify-center p-2 rounded-lg border cursor-pointer font-medium transition-all ${
                          checked
                            ? 'bg-pale-sky-500/20 border-pale-sky-500/40 text-pale-sky-600 dark:text-pale-sky-400 font-bold'
                            : 'bg-canvas border-subtle text-muted hover:text-main'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={(e) => {
                            const newRest = e.target.checked
                              ? [...settingsDraft.restDays, d]
                              : settingsDraft.restDays.filter((x) => x !== d);
                            setSettingsDraft({ ...settingsDraft, restDays: newRest });
                          }}
                        />
                        <span>{getDayLabel(d)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Celebrations Toggle */}
              <label className="flex items-center gap-2.5 text-xs text-main cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={settingsDraft.celebrationsEnabled}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, celebrationsEnabled: e.target.checked })
                  }
                  className="rounded border-subtle text-emerald-500 focus:ring-emerald-500"
                />
                <span>{t('todayCelebrationsToggle')}</span>
              </label>

              {/* Daily Reminder (optional) */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-semibold text-muted block">
                  {t('todayDailyReminder')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={settingsDraft.dailyReminderTime || ''}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        dailyReminderTime: e.target.value || null,
                      })
                    }
                    className="flex-1 rounded-xl border border-subtle bg-canvas p-2 text-sm text-main"
                  />
                  {settingsDraft.dailyReminderTime && (
                    <button
                      type="button"
                      onClick={() =>
                        setSettingsDraft({ ...settingsDraft, dailyReminderTime: null })
                      }
                      className="text-xs text-muted hover:text-main underline px-1"
                    >
                      {t('todayReminderNone')}
                    </button>
                  )}
                </div>
              </div>

              {/* Save Button */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-subtle">
                {saveSuccess && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                    {t('todaySettingsSaved')}
                  </span>
                )}
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 text-xs cursor-pointer shadow-sm transition-all"
                >
                  {t('todaySaveSettings')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
