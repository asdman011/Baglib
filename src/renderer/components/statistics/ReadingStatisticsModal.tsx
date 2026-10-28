/**
 * Baglib — Reading Statistics & Analytics Dashboard Modal (KEY-149)
 *
 * Implements KOReader / Readest visual analytics:
 * - Current and longest reading streaks
 * - Total reading time, pages, and completion velocity (pages/hr, words/min)
 * - 52-week activity calendar heatmap
 * - Subject and knowledge domain breakdown
 * - Book reading pace and median seconds per page
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Flame,
  Award,
  Calendar,
  Clock,
  BookOpen,
  Zap,
  TrendingUp,
  PieChart,
  BarChart2,
  RefreshCw,
} from 'lucide-react';
import { translations, TranslationKey } from '../../translations';
import type {
  ReadingStreakStats,
  DailyReadingHeatmapEntry,
  ReadingBookStat,
} from '../../../shared/types/reading-statistics';

interface ReadingStatisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'ar' | 'en';
}

export const ReadingStatisticsModal: React.FC<ReadingStatisticsModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const t = translations[lang];
  const isRtl = lang === 'ar';

  const [loading, setLoading] = useState(true);
  const [streakStats, setStreakStats] = useState<ReadingStreakStats | null>(null);
  const [heatmapData, setHeatmapData] = useState<DailyReadingHeatmapEntry[]>([]);
  const [booksStats, setBooksStats] = useState<ReadingBookStat[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      if ((window).electronAPI?.statistics) {
        const [streak, heatmap, books] = await Promise.all([
          (window).electronAPI.statistics.getStreakStats(),
          (window).electronAPI.statistics.getDailyHeatmap(365),
          (window).electronAPI.statistics.getAllBookStats(),
        ]);
        setStreakStats(streak);
        setHeatmapData(heatmap || []);
        setBooksStats(books || []);
      }
    } catch (err) {
      console.error('Failed to load reading statistics:', err);
    } finally {
      setLoading(false);
    }
  };

  const [previousStatsVisibility, setPreviousStatsVisibility] = useState<readonly unknown[] | null>(null);
  const inputsStatsVisibility = [isOpen];
  if (previousStatsVisibility === null || inputsStatsVisibility.some((value, index) => !Object.is(value, previousStatsVisibility[index]))) {
    setPreviousStatsVisibility(inputsStatsVisibility);
    if (isOpen) setLoading(true);
  }
  useEffect(() => {
    if (isOpen) {
      let alive = true;
      const statistics = window.electronAPI.statistics;
      void Promise.all([statistics.getStreakStats(), statistics.getDailyHeatmap(365), statistics.getAllBookStats()]).then(([streak, heatmap, books]) => {
        if (alive) { setStreakStats(streak); setHeatmapData(heatmap || []); setBooksStats(books || []); }
      }).catch(console.warn).finally(() => { if (alive) setLoading(false); });
      return () => { alive = false; };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatDuration = (totalSeconds: number) => {
    if (!totalSeconds || totalSeconds <= 0) return `0 ${t.statsMinutesUnit}`;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) {
      return `${hours} ${t.statsHoursUnit} ${minutes > 0 ? `${minutes} ${t.statsMinutesUnit}` : ''}`;
    }
    return `${minutes} ${t.statsMinutesUnit}`;
  };

  // Build 52-week activity map
  const heatmapMap = new Map<string, DailyReadingHeatmapEntry>();
  heatmapData.forEach((d) => heatmapMap.set(d.date, d));

  const today = new Date();
  const pastDays: { dateStr: string; entry?: DailyReadingHeatmapEntry }[] = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    pastDays.push({ dateStr, entry: heatmapMap.get(dateStr) });
  }

  const getHeatmapColor = (entry?: DailyReadingHeatmapEntry) => {
    if (!entry || entry.totalDurationSeconds === 0) {
      return 'bg-gray-100 dark:bg-zinc-800/60';
    }
    const mins = entry.totalDurationSeconds / 60;
    if (mins < 15) return 'bg-emerald-200 dark:bg-emerald-900/60';
    if (mins < 45) return 'bg-emerald-400 dark:bg-emerald-700';
    if (mins < 90) return 'bg-emerald-500 dark:bg-emerald-600';
    return 'bg-emerald-600 dark:bg-emerald-400';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={t.statsDashboardTitle}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/30">
              <BarChart2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-zinc-100">
                {t.statsDashboardTitle}
              </h2>
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                {t.statsDashboardDesc}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              title="Refresh"
              aria-label="Refresh statistics"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
              <p className="text-sm text-gray-500 dark:text-zinc-400">
                {t.clipProgressMessage || 'Loading statistics...'}
              </p>
            </div>
          ) : !streakStats || (streakStats.totalDaysRead === 0 && booksStats.length === 0) ? (
            <div className="text-center py-16 px-4">
              <BookOpen className="w-12 h-12 mx-auto text-gray-400 dark:text-zinc-600 mb-3" />
              <h3 className="text-base font-semibold text-gray-800 dark:text-zinc-200 mb-1">
                {t.statsNoData}
              </h3>
            </div>
          ) : (
            <>
              {/* Primary Metric KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {/* Current Streak */}
                <div className="p-4 rounded-xl border border-amber-200/60 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-amber-800 dark:text-amber-400">
                      {t.statsCurrentStreak}
                    </span>
                    <Flame className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-2xl font-black text-amber-900 dark:text-amber-300">
                    {streakStats.currentStreakDays}{' '}
                    <span className="text-xs font-normal text-amber-700 dark:text-amber-400">
                      {t.statsDaysUnit}
                    </span>
                  </div>
                </div>

                {/* Longest Streak */}
                <div className="p-4 rounded-xl border border-purple-200/60 dark:border-purple-900/40 bg-purple-50/40 dark:bg-purple-950/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-purple-800 dark:text-purple-400">
                      {t.statsLongestStreak}
                    </span>
                    <Award className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="text-2xl font-black text-purple-900 dark:text-purple-300">
                    {streakStats.longestStreakDays}{' '}
                    <span className="text-xs font-normal text-purple-700 dark:text-purple-400">
                      {t.statsDaysUnit}
                    </span>
                  </div>
                </div>

                {/* Total Read Time */}
                <div className="p-4 rounded-xl border border-blue-200/60 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-blue-800 dark:text-blue-400">
                      {t.statsTotalReadTime}
                    </span>
                    <Clock className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="text-2xl font-black text-blue-900 dark:text-blue-300">
                    {formatDuration(streakStats.totalReadTimeSeconds)}
                  </div>
                </div>

                {/* Total Pages Read */}
                <div className="p-4 rounded-xl border border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-emerald-800 dark:text-emerald-400">
                      {t.statsTotalPagesRead}
                    </span>
                    <BookOpen className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="text-2xl font-black text-emerald-900 dark:text-emerald-300">
                    {streakStats.totalReadPages.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Reading Velocity Metrics */}
              <div className="p-5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50/40 dark:bg-zinc-800/30">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-zinc-100">
                    {t.statsReadingVelocity}
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-3 bg-white dark:bg-zinc-800 rounded-lg border border-gray-100 dark:border-zinc-700/60">
                    <div className="text-xs text-gray-500 dark:text-zinc-400 mb-1">
                      {t.statsPagesPerHour}
                    </div>
                    <div className="text-xl font-bold text-gray-900 dark:text-zinc-100">
                      {streakStats.averagePagesPerHour} {t.statsPagesPerHour}
                    </div>
                  </div>
                  <div className="p-3 bg-white dark:bg-zinc-800 rounded-lg border border-gray-100 dark:border-zinc-700/60">
                    <div className="text-xs text-gray-500 dark:text-zinc-400 mb-1">
                      {t.statsWordsPerMinute}
                    </div>
                    <div className="text-xl font-bold text-gray-900 dark:text-zinc-100">
                      {streakStats.averageWordsPerMinute} {t.statsWordsPerMinute}
                    </div>
                  </div>
                  <div className="p-3 bg-white dark:bg-zinc-800 rounded-lg border border-gray-100 dark:border-zinc-700/60">
                    <div className="text-xs text-gray-500 dark:text-zinc-400 mb-1">
                      {t.statsTotalDaysRead}
                    </div>
                    <div className="text-xl font-bold text-gray-900 dark:text-zinc-100">
                      {streakStats.totalDaysRead} {t.statsDaysUnit}
                    </div>
                  </div>
                </div>
              </div>

              {/* 52-Week Activity Heatmap */}
              <div className="p-5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-zinc-100">
                      {t.statsHeatmapTitle}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <span>Less</span>
                    <div className="w-2.5 h-2.5 rounded bg-gray-100 dark:bg-zinc-800" />
                    <div className="w-2.5 h-2.5 rounded bg-emerald-200 dark:bg-emerald-900/60" />
                    <div className="w-2.5 h-2.5 rounded bg-emerald-400 dark:bg-emerald-700" />
                    <div className="w-2.5 h-2.5 rounded bg-emerald-600 dark:bg-emerald-400" />
                    <span>More</span>
                  </div>
                </div>

                <div className="overflow-x-auto pb-2">
                  <div className="grid grid-rows-7 grid-flow-col gap-1 w-max">
                    {pastDays.map(({ dateStr, entry }) => (
                      <div
                        key={dateStr}
                        className={`w-3 h-3 rounded-sm transition-all hover:ring-2 hover:ring-emerald-400 cursor-pointer ${getHeatmapColor(
                          entry
                        )}`}
                        title={`${dateStr}: ${entry ? `${Math.round(entry.totalDurationSeconds / 60)} mins, ${entry.pagesRead} pages` : 'No reading'}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Subject Breakdown & Topic Distribution */}
              {streakStats.subjectBreakdown && streakStats.subjectBreakdown.length > 0 && (
                <div className="p-5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60">
                  <div className="flex items-center gap-2 mb-4">
                    <PieChart className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-zinc-100">
                      {t.statsSubjectBreakdown}
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {streakStats.subjectBreakdown.map((item) => {
                      const percentage =
                        streakStats.totalReadTimeSeconds > 0
                          ? Math.round((item.timeSeconds / streakStats.totalReadTimeSeconds) * 100)
                          : 0;
                      return (
                        <div key={item.subject} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-gray-800 dark:text-zinc-200">
                              {item.subject}
                            </span>
                            <span className="text-gray-500 dark:text-zinc-400">
                              {formatDuration(item.timeSeconds)} ({percentage}%) • {item.pagesRead}{' '}
                              {t.bookPlural || 'pages'}
                            </span>
                          </div>
                          <div className="w-full h-2 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Books Reading History */}
              {booksStats.length > 0 && (
                <div className="p-5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-zinc-100 mb-3">
                    {t.navLibrary}: {booksStats.length} {t.bookPlural || 'books'}
                  </h3>
                  <div className="divide-y divide-gray-100 dark:divide-zinc-800">
                    {booksStats.slice(0, 10).map((b) => (
                      <div key={b.bookId} className="py-2.5 flex items-center justify-between text-xs">
                        <div className="truncate max-w-sm">
                          <div className="font-semibold text-gray-800 dark:text-zinc-200 truncate">
                            {b.title}
                          </div>
                          {b.authors && (
                            <div className="text-gray-400 truncate">{b.authors}</div>
                          )}
                        </div>
                        <div className="text-end text-gray-500 dark:text-zinc-400 whitespace-nowrap">
                          <div>{formatDuration(b.totalReadTime)}</div>
                          <div className="text-[11px] text-gray-400">
                            {b.totalReadPages} / {b.pages || '?'} {t.bookPlural || 'pages'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
