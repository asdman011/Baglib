'use client';
import { FeedbackSkeleton } from '../ui/FeedbackSkeleton';

import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  BookOpen,
  Award,
  Clock,
  Sparkles,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { InfoTip } from '../layout/InfoTip';
import type {
  TargetProgressSummary,
  ProgressTargetItem,
  MasteryLevel,
} from '../../../shared/study-progress';

function MasteryBadge({
  level,
  t,
}: {
  level: MasteryLevel;
  t: (k: Parameters<ReturnType<typeof useWorkspace>['t']>[0]) => string;
}) {
  switch (level) {
    case 'mastered':
      return (
        <span
          data-mastery-badge="mastered"
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
        >
          <Sparkles className="w-3 h-3 text-amber-500" />
          {t('masteryLevelMastered')}
        </span>
      );
    case 'proficient':
      return (
        <span
          data-mastery-badge="proficient"
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30"
        >
          <Award className="w-3 h-3 text-purple-500" />
          {t('masteryLevelProficient')}
        </span>
      );
    case 'familiar':
      return (
        <span
          data-mastery-badge="familiar"
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30"
        >
          {t('masteryLevelFamiliar')}
        </span>
      );
    case 'started':
      return (
        <span
          data-mastery-badge="started"
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30"
        >
          {t('masteryLevelStarted')}
        </span>
      );
    case 'not_started':
    default:
      return (
        <span
          data-mastery-badge="not-started"
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted/15 text-muted border border-subtle"
        >
          {t('masteryLevelNotStarted')}
        </span>
      );
  }
}

export function StudyProgressPanel() {
  const { t, dir, setViewMode } = useWorkspace();

  const [targets, setTargets] = useState<ProgressTargetItem[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<ProgressTargetItem | null>(null);
  const [summary, setSummary] = useState<TargetProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // 1. Fetch available progress targets (pathways and books)
  useEffect(() => {
    let alive = true;
    const fetchTargets = async () => {
      try {
        const api = window.electronAPI?.studyInsights;
        if (api?.progressTargets) {
          const list = await api.progressTargets();
          if (alive) {
            setTargets(list || []);
            if (list && list.length > 0) {
              setSelectedTarget((curr) => curr ?? list[0]);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load progress targets:', err);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void fetchTargets();
    return () => {
      alive = false;
    };
  }, []);

  // 2. Fetch summary when selected target changes
  useEffect(() => {
    let alive = true;
    if (!selectedTarget) {
      return;
    }
    const fetchSummary = async () => {
      setSummary(null);
      try {
        const api = window.electronAPI?.studyInsights;
        if (api?.progressSummary) {
          const res = await api.progressSummary(selectedTarget.kind, selectedTarget.id);
          if (alive) {
            setSummary(res);
          }
        }
      } catch (err) {
        console.error('Failed to load progress summary:', err);
      }
    };

    void fetchSummary();
    return () => {
      alive = false;
    };
  }, [selectedTarget]);

  if (loading) {
    return (
      <div
        data-study-progress-panel
        className="rounded-2xl border border-subtle bg-surface/70 backdrop-blur-sm p-4 text-xs text-muted"
        dir={dir}
      >
        <FeedbackSkeleton />
      </div>
    );
  }

  if (targets.length === 0) {
    return (
      <div
        data-study-progress-panel
        className="rounded-2xl border border-subtle bg-surface/70 backdrop-blur-sm p-4 sm:p-5 shadow-sm space-y-3"
        dir={dir}
      >
        <div className="flex items-center gap-2 text-main font-bold text-sm">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          <span>{t('studyProgressTitle')}</span>
        </div>
        <p className="text-xs text-muted leading-relaxed">{t('studyProgressNoTargets')}</p><button type="button" className="underline text-sm" onClick={() => setViewMode('pathways')}>{t('pathwaysTitle')}</button>
      </div>
    );
  }

  return (
    <div
      data-study-progress-panel
      className="rounded-2xl border border-subtle bg-surface/70 backdrop-blur-sm p-4 sm:p-5 shadow-sm space-y-4"
      dir={dir}
    >
      {/* Header and Target Picker */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-main leading-tight flex items-center gap-2">
              <span>{t('studyProgressTitle')}</span>
            </h2>
            <p className="text-xs text-muted leading-normal mt-0.5 hidden sm:block">
              {t('studyProgressSubtitle')}
            </p>
          </div>
        </div>

        {/* Target Picker Dropdown */}
        <div className="relative">
          <button
            type="button"
            data-target-picker-trigger
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-canvas hover:bg-surface border border-subtle text-main flex items-center gap-2 transition-all cursor-pointer shadow-xs max-w-[240px] truncate"
            aria-expanded={isDropdownOpen}
          >
            <Layers className="w-3.5 h-3.5 text-muted shrink-0" />
            <span className="truncate">
              {selectedTarget ? selectedTarget.title : t('studyProgressTargetSelect')}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
          </button>

          {isDropdownOpen && (
            <div
              data-target-picker-menu
              className="absolute end-0 top-full mt-1.5 w-64 max-h-60 overflow-y-auto rounded-xl border border-subtle bg-surface p-1 shadow-lg z-30 space-y-0.5 text-xs"
            >
              {targets.map((tgt) => (
                <button
                  key={`${tgt.kind}:${tgt.id}`}
                  type="button"
                  onClick={() => {
                    setSelectedTarget(tgt);
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full text-start px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    selectedTarget?.id === tgt.id && selectedTarget?.kind === tgt.kind
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold'
                      : 'text-main hover:bg-canvas'
                  }`}
                >
                  <span className="truncate">{tgt.title}</span>
                  <span className="text-[10px] text-muted shrink-0 px-1.5 py-0.5 rounded bg-canvas border border-subtle">
                    {tgt.kind === 'pathway' ? t('studyProgressTypePathway') : t('studyProgressTypeBook')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Target Content */}
      {selectedTarget && !summary && <FeedbackSkeleton />}
      {summary && (
        <div className="space-y-4">
          {/* Target Title & Subtitle */}
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <span className="text-xs uppercase tracking-wider text-muted font-bold me-2">
                {summary.targetKind === 'pathway' ? t('studyProgressTypePathway') : t('studyProgressTypeBook')}
              </span>
              <span className="text-sm font-bold text-main">{summary.title}</span>
              {summary.subtitle && (
                <span className="text-xs text-muted ms-2 truncate">({summary.subtitle})</span>
              )}
            </div>
          </div>

          {/* Three SEPARATE Measures (never merged into one score) */}
          <div className="grid grid-cols-1 @min-[44rem]:grid-cols-3 gap-3.5 items-stretch">
            {/* ------------------------------------------------------------- */}
            {/* Measure 1: Reading Coverage                                   */}
            {/* ------------------------------------------------------------- */}
            <div
              data-measure="reading-coverage"
              className="rounded-xl border border-subtle bg-canvas/60 p-3.5 flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-main">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{t('studyProgressReadingCoverage')}</span>
                  </div>
                  <InfoTip
                    label="reading-coverage"
                    ariaLabel={t('studyProgressReadingCoverageInfo')}
                    text={t('studyProgressReadingCoverageInfo')}
                  />
                </div>

                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-2xl font-black text-main">
                    {summary.readingCoverage.coveragePercent}%
                  </span>
                  <span className="text-xs text-muted">
                    {summary.readingCoverage.readPagesCount} / {summary.readingCoverage.totalBookPages}{' '}
                    {t('studyProgressPagesRead')}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-surface border border-subtle overflow-hidden mt-2">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-300"
                    style={{ width: `${summary.readingCoverage.coveragePercent}%` }}
                  />
                </div>
              </div>

              <div className="text-[11px] text-muted flex items-center justify-between pt-2 border-t border-subtle/50">
                <span>
                  {summary.readingCoverage.openedPagesCount} {t('studyProgressPagesOpened')}
                </span>
                <span>
                  {Math.round(summary.readingCoverage.totalDwellSeconds / 60)} {t('studyProgressMinutesRead')}
                </span>
              </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* Measure 2: Demonstrated Knowledge                             */}
            {/* ------------------------------------------------------------- */}
            <div
              data-measure="demonstrated-knowledge"
              className="rounded-xl border border-subtle bg-canvas/60 p-3.5 flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-main">
                    <Award className="w-3.5 h-3.5 text-purple-500" />
                    <span>{t('studyProgressDemonstratedKnowledge')}</span>
                  </div>
                  <InfoTip
                    label="demonstrated-knowledge"
                    ariaLabel={t('studyProgressDemonstratedKnowledgeInfo')}
                    text={t('studyProgressDemonstratedKnowledgeInfo')}
                  />
                </div>

                <div className="flex items-center justify-between gap-2 mt-2">
                  <span className="text-xs text-muted">{t('studyProgressTitle')}:</span>
                  <MasteryBadge level={summary.demonstratedKnowledge.overallLevel} t={t} />
                </div>

                {/* Segmented breakdown */}
                <div className="grid grid-cols-4 gap-1 text-center mt-3 pt-2 border-t border-subtle/50 text-[10px]">
                  <div className="px-1 py-1 rounded bg-surface border border-subtle">
                    <div className="text-muted">{t('masteryLevelStarted')}</div>
                    <div className="font-bold text-main">{summary.demonstratedKnowledge.levelCounts.started}</div>
                  </div>
                  <div className="px-1 py-1 rounded bg-surface border border-subtle">
                    <div className="text-muted">{t('masteryLevelFamiliar')}</div>
                    <div className="font-bold text-main">{summary.demonstratedKnowledge.levelCounts.familiar}</div>
                  </div>
                  <div className="px-1 py-1 rounded bg-surface border border-subtle">
                    <div className="text-muted">{t('masteryLevelProficient')}</div>
                    <div className="font-bold text-main">{summary.demonstratedKnowledge.levelCounts.proficient}</div>
                  </div>
                  <div className="px-1 py-1 rounded bg-surface border border-subtle">
                    <div className="text-muted">{t('masteryLevelMastered')}</div>
                    <div className="font-bold text-main">{summary.demonstratedKnowledge.levelCounts.mastered}</div>
                  </div>
                </div>
              </div>

              {/* Self-rated cards kept strictly separate */}
              <div
                data-measure="self-rated"
                className="flex items-center justify-between pt-2 border-t border-subtle/50 text-[11px] text-muted"
              >
                <div className="flex items-center gap-1">
                  <span>
                    {summary.demonstratedKnowledge.selfRatedCardsCount} {t('studyProgressSelfRatedCards')}
                  </span>
                  <InfoTip
                    label="self-rated"
                    ariaLabel={t('studyProgressSelfRatedInfo')}
                    text={t('studyProgressSelfRatedInfo')}
                  />
                </div>
                <span>
                  {summary.demonstratedKnowledge.demonstratedCardsCount} /{' '}
                  {t('feedbackCardsCount', { count: summary.demonstratedKnowledge.totalCards })}
                </span>
              </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* Measure 3: Reviews Due                                        */}
            {/* ------------------------------------------------------------- */}
            <div
              data-measure="reviews-due"
              className="rounded-xl border border-subtle bg-canvas/60 p-3.5 flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-main">
                    <Clock className="w-3.5 h-3.5 text-sky-500" />
                    <span>{t('studyProgressReviewsDue')}</span>
                  </div>
                  <InfoTip
                    label="reviews-due"
                    ariaLabel={t('studyProgressReviewsDueInfo')}
                    text={t('studyProgressReviewsDueInfo')}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="p-2.5 rounded-lg bg-surface border border-subtle">
                    <div className="text-[11px] text-muted">{t('studyProgressDueToday')}</div>
                    <div className="text-xl font-black text-main mt-0.5">
                      {summary.reviewsDue.dueTodayCount}
                    </div>
                    {summary.reviewsDue.overdueCount > 0 && (
                      <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
                        {summary.reviewsDue.overdueCount} {t('studyProgressOverdue')}
                      </div>
                    )}
                  </div>

                  <div className="p-2.5 rounded-lg bg-surface border border-subtle">
                    <div className="text-[11px] text-muted">{t('studyProgressDueThisWeek')}</div>
                    <div className="text-xl font-black text-main mt-0.5">
                      {summary.reviewsDue.dueThisWeekCount}
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-muted flex items-center justify-between pt-2 border-t border-subtle/50">
                <span>{summary.reviewsDue.totalScheduledCards} {t('studyProgressTotalMemorizing')}</span>
              </div>
            </div>
          </div>

          {/* Optional Sections Breakdown (for pathways with multiple sections) */}
          {summary.demonstratedKnowledge.sections &&
            summary.demonstratedKnowledge.sections.length > 1 && (
              <div className="pt-2 border-t border-subtle/60 space-y-2">
                <div className="text-xs font-bold text-muted flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>{t('studyProgressSections')}</span>
                </div>
                <div className="grid grid-cols-1 @min-[28rem]:grid-cols-2 @min-[44rem]:grid-cols-3 gap-2">
                  {summary.demonstratedKnowledge.sections.map((sec) => (
                    <div
                      key={sec.sectionName}
                      className="p-2.5 rounded-xl border border-subtle bg-canvas/40 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-main truncate">{sec.sectionName}</div>
                        <div className="text-[10px] text-muted">
                          {t('feedbackCardsCount', { count: sec.totalCards })} ({sec.levelCounts.mastered} {t('masteryLevelMastered')})
                        </div>
                      </div>
                      <div className="shrink-0">
                        <MasteryBadge level={sec.level} t={t} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
