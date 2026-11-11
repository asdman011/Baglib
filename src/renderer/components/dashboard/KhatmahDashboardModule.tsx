'use client';
import { FeedbackSkeleton } from '../ui/FeedbackSkeleton';

import React, { useEffect, useState } from 'react';
import {
  BookMarked,
  BookOpen,
  Check,
  ExternalLink,
  Flame,
  Plus,
  Target,
  X,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useKhatmah } from '../quran/useKhatmah';
import { addDays, khatmahStats, localDate, pageRanges } from '../../../shared/khatmah';
import { openQuranPage } from '../../utils/quran-navigation';
import { translations } from '../../translations';
import { PRAYER_LABELS } from '../../../shared/athan-calculator';
import type { PrayerStatusSnapshot } from '../../../shared/types/athan';
import type { QuranReaderSource } from '../../../shared/types/quran';

/**
 * Resolves the 1-based Juz number (1..30) for a given Mushaf page (1..604).
 */
export function resolveJuzForPage(page: number, juzEndPages?: number[]): number {
  if (Array.isArray(juzEndPages) && juzEndPages.length === 30) {
    const idx = juzEndPages.findIndex((endPage) => endPage >= page);
    if (idx >= 0) return idx + 1;
  }
  return Math.min(30, Math.max(1, Math.ceil((page / 604) * 30)));
}

interface KhatmahDashboardModuleProps {
  onOpenQuranKhatmah?: () => void;
}

export const KhatmahDashboardModule: React.FC<KhatmahDashboardModuleProps> = ({
  onOpenQuranKhatmah,
}) => {
  const { lang, setViewMode, t } = useWorkspace();
  const khatmah = useKhatmah();
  const [sources, setSources] = useState<QuranReaderSource[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');

  useEffect(() => {
    let alive = true;
    const api = typeof window !== 'undefined' ? window.electronAPI?.quran : undefined;
    if (api?.readerCatalog) {
      api
        .readerCatalog()
        .then((res) => {
          if (alive && res?.ok && res.data?.sources) {
            setSources(res.data.sources);
          }
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, []);

  const activePlans = khatmah.plans.filter((p) => !p.paused);
  const plan =
    khatmah.plans.find((p) => p.id === selectedPlanId) ||
    activePlans[0] ||
    khatmah.plans[0] ||
    null;

  const stats = plan ? khatmahStats(plan, khatmah.today) : null;
  const firstTargetPage = stats?.todayPages?.[0] || (stats ? Math.min(604, stats.completed + 1) : 1);
  const currentJuz = plan ? resolveJuzForPage(firstTargetPage, plan.binding?.juzEndPages) : 1;

  const handleQuickCreate30Day = async () => {
    const scriptSource =
      sources.find((s) => s.kind === 'script' && s.profile === 'hafs') ||
      sources.find((s) => s.kind === 'script');
    const layoutSource =
      sources.find((s) => s.kind === 'mushaf-layout') ||
      sources.find((s) => s.kind === 'glyph-layout');

    const scriptId = scriptSource?.id || 'quran-script/312';
    const layoutId = layoutSource?.id || 'mushaf-layout/svg';
    const today = localDate();

    await khatmah.mutate({
      action: 'create',
      config: {
        title: t('khatmahDefaultTitle'),
        script: scriptId,
        layout: layoutId,
        startDate: today,
        mode: 'duration',
        durationDays: 30,
        targetDate: addDays(today, 29),
        pagesPerSession: 4,
        sessionsPerDay: 5,
        juzPerDay: 1,
        automatic: false,
        reminder: {
          enabled: false,
          time: '06:00',
          language: lang,
        },
      },
    });
  };

  const handleReadTargetNow = () => {
    if (!plan || !stats) return;
    const targetPage = stats.todayPages[0] || Math.min(604, stats.completed + 1);
    setViewMode('quran');
    setTimeout(() => {
      openQuranPage({
        script: plan.script,
        layout: plan.layout,
        page: targetPage,
        khatmah: plan.id,
      });
    }, 30);
  };

  const handleMarkComplete = async () => {
    if (!plan || !stats || stats.todayPages.length === 0) return;
    await khatmah.mutate({
      action: 'mark',
      id: plan.id,
      script: plan.script,
      layout: plan.layout,
      pages: stats.todayPages,
      read: true,
    });
  };

  // SVG Circular Progress Ring geometry
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const percent = stats ? Math.min(100, Math.max(0, stats.percent)) : 0;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <section
      data-dashboard-module="khatmah-tracker"
      aria-label={t('dashKhatmahTitle')}
      className="rounded-2xl border border-emerald-600/25 bg-surface p-4 shadow-sm space-y-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
            <Target className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display font-bold text-base text-main truncate">
              {t('dashKhatmahTitle')}
            </h2>
            <p className="text-xs text-muted truncate">{t('dashKhatmahSubtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {khatmah.plans.length > 1 && (
            <select
              aria-label={t('dashKhatmahTitle')}
              value={plan?.id || ''}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className="rounded-xl border border-subtle bg-canvas px-2.5 py-1.5 text-xs font-bold text-main"
            >
              {khatmah.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => {
              if (onOpenQuranKhatmah) onOpenQuranKhatmah();
              else setViewMode('quran');
            }}
            className="px-3 py-1.5 rounded-xl border border-subtle bg-canvas hover:bg-surface text-xs font-bold text-main transition-colors cursor-pointer"
          >
            {t('dashKhatmahManageAll')}
          </button>
        </div>
      </header>

      {khatmah.loading ? <FeedbackSkeleton /> : !plan || !stats ? (
        <div
          data-khatmah-dashboard-empty
          className="rounded-2xl border border-dashed border-emerald-600/30 bg-emerald-500/5 p-6 text-center space-y-3"
        >
          <BookMarked className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
          <p className="text-xs text-muted max-w-md mx-auto leading-relaxed">
            {t('khatmahEmpty')}
          </p>
          <button
            type="button"
            disabled={khatmah.busy}
            onClick={handleQuickCreate30Day}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {t('dashKhatmahStart30Day')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Circular + Linear Progress Header */}
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-canvas/60 border border-subtle">
            {/* Circular Progress Indicator */}
            <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
              <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                <circle
                  cx="40"
                  cy="40"
                  r={radius}
                  stroke="currentColor"
                  strokeWidth="6"
                  fill="transparent"
                  className="text-emerald-500/15"
                />
                <circle
                  cx="40"
                  cy="40"
                  r={radius}
                  stroke="currentColor"
                  strokeWidth="6"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                  className="text-emerald-600 dark:text-emerald-400 transition-all duration-500"
                />
              </svg>
              <span className="absolute text-xs font-mono font-black text-main">
                {Math.round(percent)}%
              </span>
            </div>

            {/* Linear Progress & Streak */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-sm text-main truncate">{plan.title}</h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold shrink-0">
                  <Flame className="w-3.5 h-3.5" />
                  {t('khatmahStreak', { days: stats.streak })}
                </span>
              </div>

              <div
                role="progressbar"
                aria-label={t('khatmahProgress')}
                aria-valuemin={0}
                aria-valuemax={604}
                aria-valuenow={stats.completed}
                className="h-2.5 rounded-full bg-emerald-500/15 overflow-hidden"
              >
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  {t('khatmahProgressValue', {
                    pages: stats.completed,
                    percent: Math.round(percent * 10) / 10,
                  })}
                </span>
                <span>{t(stats.schedule === 'ahead' ? 'khatmahAhead' : stats.schedule === 'behind' ? 'khatmahBehind' : 'khatmahOnTrack')}</span>
              </div>
            </div>
          </div>

          {/* Today's Goal Tracker */}
          <div
            data-khatmah-today-tracker
            className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  {t('khatmahToday')}
                </span>
                <p className="text-sm font-bold text-main">
                  {stats.todayPages.length > 0
                    ? t('dashKhatmahTodayQuota', {
                        count: stats.todayPages.length,
                        juz: currentJuz,
                      })
                    : t('dashKhatmahTodayCompleted', { juz: currentJuz })}
                </p>
              </div>
              {stats.todayPages.length > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-surface border border-emerald-500/30 text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300">
                  {t('khatmahPages', { pages: pageRanges(stats.todayPages) })}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-khatmah-read-now
                disabled={khatmah.busy}
                onClick={handleReadTargetNow}
                className="flex-1 py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-40"
              >
                <BookOpen className="w-3.5 h-3.5" />
                {t('dashKhatmahReadTargetNow')}
              </button>
              <button
                type="button"
                data-khatmah-mark-complete
                disabled={khatmah.busy || stats.todayPages.length === 0}
                onClick={handleMarkComplete}
                className="py-2 px-4 rounded-xl border border-emerald-600/40 bg-surface hover:bg-canvas text-xs font-bold text-emerald-700 dark:text-emerald-300 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
              >
                <Check className="w-3.5 h-3.5" />
                {t('dashKhatmahMarkComplete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

/**
 * Lightweight Companion Widget View (supports both floating/dashboard summary tile
 * AND Electron frameless desktop mini-window overlay).
 */
export const CompanionMiniWidget: React.FC<{
  prayerSnapshot: PrayerStatusSnapshot;
  readingStreakDays: number;
  onClose?: () => void;
  onPopoutDesktop?: () => void;
  isFramelessWindow?: boolean;
}> = ({
  prayerSnapshot,
  readingStreakDays,
  onClose,
  onPopoutDesktop,
  isFramelessWindow = false,
}) => {
  const { lang, dir } = useWorkspace();
  const khatmah = useKhatmah();

  const forceAr = prayerSnapshot.settings.localization.forceArabicWidgets;
  const effectiveLang = forceAr ? 'ar' : lang;
  const effectiveDir = forceAr ? 'rtl' : dir;
  const tr = translations[effectiveLang];

  const activePlan = khatmah.plans.find((p) => !p.paused) || khatmah.plans[0];
  const kStats = activePlan ? khatmahStats(activePlan, khatmah.today) : null;
  const remainingPages = kStats ? kStats.todayPages.length : 0;
  const effectiveStreak = Math.max(readingStreakDays, kStats?.streak || 0);
  const nextPrayerLabel = PRAYER_LABELS[prayerSnapshot.nextPrayer.name][effectiveLang];

  if (khatmah.loading) return <FeedbackSkeleton />;

  return (
    <aside
      dir={effectiveDir}
      data-companion-widget
      aria-label={tr.dashCompanionTitle}
      className={`rounded-2xl border border-emerald-500/30 bg-surface/95 backdrop-blur-md p-4 shadow-xl space-y-3 ${
        isFramelessWindow ? 'h-full w-full min-h-0 rounded-none border-0 flex flex-col justify-between' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-subtle pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Target className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="text-xs font-bold text-main truncate">
            {tr.dashCompanionTitle}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onPopoutDesktop && !isFramelessWindow && (
            <button
              type="button"
              onClick={onPopoutDesktop}
              title={tr.dashboardPopoutMiniWindow}
              className="p-1 rounded-lg hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={tr.studyClose}
              className="p-1 rounded-lg hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5 text-center">
        {/* Remaining Khatmah Target */}
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 block leading-relaxed">
            {tr.dashCompanionKhatmahTarget}
          </span>
          <span className="text-sm font-black text-main font-mono block">
            {remainingPages} {effectiveLang === 'ar' ? 'ص' : 'p'}
          </span>
        </div>

        {/* Current Streak */}
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1">
          <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 block leading-relaxed">
            {tr.dashCompanionStreak}
          </span>
          <span className="text-sm font-black text-main font-mono inline-flex items-center justify-center gap-1">
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            {effectiveStreak}
          </span>
        </div>

        {/* Next Prayer Time */}
        <div className="p-2.5 rounded-xl bg-pale-sky-500/10 border border-pale-sky-500/20 space-y-1">
          <span className="text-[10px] font-bold text-pale-sky-700 dark:text-pale-sky-300 block leading-relaxed">
            {nextPrayerLabel}
          </span>
          <span className="text-xs font-black text-main font-mono block">
            {prayerSnapshot.nextPrayer.time}
          </span>
          <span className="text-[10px] font-mono text-muted block">
            {prayerSnapshot.nextPrayer.countdownFormatted}
          </span>
        </div>
      </div>
    </aside>
  );
};
