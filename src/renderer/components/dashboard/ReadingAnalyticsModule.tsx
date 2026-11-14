'use client';
import { FeedbackSkeleton } from '../ui/FeedbackSkeleton';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BarChart2,
  BookOpen,
  Clock,
  FileText,
  Flame,
  Highlighter,
  PieChart,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import type {
  DailyReadingHeatmapEntry,
  ReadingStreakStats,
} from '../../../shared/types/reading-statistics';
import type { KnowledgeItemDTO } from '../../../shared/types/knowledge';
import type { CategoryNode } from '../../../shared/types/category';

interface ReadingAnalyticsModuleProps {
  onStreakLoaded?: (streakDays: number) => void;
  onOpenFullStatsModal?: () => void;
}

function flattenCategories(nodes: CategoryNode[]): CategoryNode[] {
  const result: CategoryNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (Array.isArray(node.children) && node.children.length > 0) {
      result.push(...flattenCategories(node.children));
    }
  }
  return result;
}

export const ReadingAnalyticsModule: React.FC<ReadingAnalyticsModuleProps> = ({
  onStreakLoaded,
  onOpenFullStatsModal,
}) => {
  const { books, bookNotes, highlights, categoryTree, lang, t, setViewMode } = useWorkspace();
  const { notes: studyNotes } = useStudyNotes();
  const [streakStats, setStreakStats] = useState<ReadingStreakStats | null>(null);
  const [weeklyHeatmap, setWeeklyHeatmap] = useState<DailyReadingHeatmapEntry[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    let alive = true;
    const loadAnalytics = async () => {
      try {
        const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
        const [streak, heatmap, allKnowledge] = await Promise.all([
          api?.statistics?.getStreakStats ? api.statistics.getStreakStats() : Promise.resolve(null),
          api?.statistics?.getDailyHeatmap ? api.statistics.getDailyHeatmap(7) : Promise.resolve([]),
          api?.knowledge?.getAll ? api.knowledge.getAll() : Promise.resolve([]),
        ]);
        if (!alive) return;
        if (streak) {
          setStreakStats(streak);
          onStreakLoaded?.(streak.currentStreakDays || 0);
        }
        if (Array.isArray(heatmap)) {
          setWeeklyHeatmap(heatmap);
        }
        if (Array.isArray(allKnowledge)) {
          setKnowledgeItems(allKnowledge);
        }
      } catch {}
    };
    void loadAnalytics().finally(() => { if (alive) setLoading(false); });
    return () => {
      alive = false;
    };
  }, [books.length, bookNotes.length, onStreakLoaded]);

  const metrics = useMemo(() => {
    const weekAgoMs = nowMs - 7 * 86_400_000;

    const weeklySeconds = weeklyHeatmap.reduce(
      (sum, entry) => sum + (entry.totalDurationSeconds || 0),
      0
    );
    const weeklyPages = weeklyHeatmap.reduce(
      (sum, entry) => sum + (entry.pagesRead || 0),
      0
    );

    const todayIso = new Date().toISOString().slice(0, 10);
    const todayEntry = weeklyHeatmap.find((d) => d.date === todayIso);
    const todaySeconds = todayEntry?.totalDurationSeconds || 0;

    // Count highlights & notes created this week from SQLite knowledge items + workspace state
    let highlightsThisWeek = knowledgeItems.filter((item) => {
      if (item.knowledgeType !== 'highlight') return false;
      const ts = item.createdAt ? new Date(item.createdAt).getTime() : 0;
      return ts >= weekAgoMs;
    }).length;
    if (highlightsThisWeek === 0 && highlights.length > 0) {
      highlightsThisWeek = highlights.length;
    }

    const kbNotesThisWeek = knowledgeItems.filter((item) => {
      if (item.knowledgeType !== 'note') return false;
      const ts = item.createdAt ? new Date(item.createdAt).getTime() : 0;
      return ts >= weekAgoMs;
    }).map(item => item.id);
    const wsNotesThisWeek = bookNotes.filter((n) => {
      const ts = n.createdAt ? new Date(n.createdAt).getTime() : 0;
      return ts >= weekAgoMs;
    }).map(note => note.id);
    const studyNotesThisWeek = studyNotes.filter(note => new Date(note.createdAt).getTime() >= weekAgoMs).map(note => note.id);
    const notesThisWeek = new Set([...kbNotesThisWeek, ...wsNotesThisWeek, ...studyNotesThisWeek]).size;

    return {
      currentStreak: streakStats?.currentStreakDays || 0,
      longestStreak: streakStats?.longestStreakDays || 0,
      weeklySeconds,
      todaySeconds,
      pagesThisWeek: weeklyPages,
      highlightsThisWeek,
      notesThisWeek,
    };
  }, [streakStats, weeklyHeatmap, knowledgeItems, highlights.length, bookNotes, studyNotes, nowMs]);

  // Bilingual Category Breakdown (utilizing Baglib's bilingual category taxonomy)
  const categoryBreakdown = useMemo(() => {
    const flatCats = flattenCategories(categoryTree);
    const byId = new Map<string, CategoryNode>();
    const byName = new Map<string, CategoryNode>();
    for (const c of flatCats) {
      byId.set(c.id, c);
      if (c.nameAr) byName.set(c.nameAr.toLowerCase(), c);
      if (c.nameEn) byName.set(c.nameEn.toLowerCase(), c);
    }

    const counts = new Map<string, { labelAr: string; labelEn: string; count: number }>();

    const recordCategory = (key: string, labelAr: string, labelEn: string, weight = 1) => {
      const prev = counts.get(key);
      if (prev) {
        prev.count += weight;
      } else {
        counts.set(key, { labelAr, labelEn, count: weight });
      }
    };

    // 1. From reading statistics subjectBreakdown
    if (streakStats?.subjectBreakdown && streakStats.subjectBreakdown.length > 0) {
      for (const s of streakStats.subjectBreakdown) {
        const matched = byName.get((s.subject || '').toLowerCase());
        const labelAr = matched?.nameAr || s.subject || t('dashStatsUncategorized');
        const labelEn = matched?.nameEn || s.subject || t('dashStatsUncategorized');
        recordCategory(matched?.id || s.subject, labelAr, labelEn, Math.max(1, s.pagesRead));
      }
    }

    // 2. From library books & category taxonomy
    for (const book of books) {
      if (book.primaryCategory) {
        recordCategory(
          book.primaryCategory.id,
          book.primaryCategory.nameAr || book.primaryCategory.nameEn,
          book.primaryCategory.nameEn || book.primaryCategory.nameAr,
          1
        );
      } else if (book.categories && book.categories.length > 0) {
        for (const rawCat of book.categories) {
          const matched = byId.get(rawCat) || byName.get(rawCat.toLowerCase());
          recordCategory(
            matched?.id || rawCat,
            matched?.nameAr || rawCat,
            matched?.nameEn || rawCat,
            1
          );
        }
      }
    }

    // 3. If no books/stats yet, display top bilingual taxonomy nodes with their recursive counts
    if (counts.size === 0 && flatCats.length > 0) {
      for (const c of flatCats.slice(0, 5)) {
        recordCategory(c.id, c.nameAr, c.nameEn, c.totalWorkCount || c.directWorkCount || 0);
      }
    }

    const items = Array.from(counts.entries())
      .map(([id, val]) => ({
        id,
        label: lang === 'ar' ? val.labelAr : val.labelEn,
        count: val.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const total = Math.max(
      1,
      items.reduce((acc, item) => acc + item.count, 0)
    );
    return items.map((item) => ({
      ...item,
      percent: Math.min(100, Math.round((item.count / total) * 100)),
    }));
  }, [categoryTree, streakStats, books, lang, t]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} ${t('statsMinutesUnit')}`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return remMins > 0
      ? `${hrs} ${t('statsHoursUnit')} ${remMins} ${t('statsMinutesUnit')}`
      : `${hrs} ${t('statsHoursUnit')}`;
  };

  if (loading) return <FeedbackSkeleton />;

  return (
    <section
      data-dashboard-module="reading-analytics"
      aria-label={t('dashStatsTitle')}
      className="rounded-2xl border border-subtle bg-surface p-4 shadow-sm space-y-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
            <BarChart2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display font-bold text-base text-main truncate">
              {t('dashStatsTitle')}
            </h2>
            <p className="text-xs text-muted truncate">{t('dashStatsSubtitle')}</p>
          </div>
        </div>

        {onOpenFullStatsModal && (
          <button
            type="button"
            onClick={onOpenFullStatsModal}
            className="px-3 py-1.5 rounded-xl border border-subtle bg-canvas hover:bg-surface text-xs font-bold text-main transition-colors cursor-pointer"
          >
            {t('dashStatsOpenFullModal')}
          </button>
        )}
      </header>

      {/* Streak & Reading Time KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-1">
          <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 font-bold">
            <span>{t('statsCurrentStreak')}</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-black text-main font-mono">
            {metrics.currentStreak}{' '}
            <span className="text-xs font-sans font-normal text-muted">
              {t('statsDaysUnit')}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 space-y-1">
          <div className="flex items-center justify-between text-xs text-purple-700 dark:text-purple-300 font-bold">
            <span>{t('statsLongestStreak')}</span>
            <Award className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-xl font-black text-main font-mono">
            {metrics.longestStreak}{' '}
            <span className="text-xs font-sans font-normal text-muted">
              {t('statsDaysUnit')}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-pale-sky-500/10 border border-pale-sky-500/20 space-y-1 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-xs text-pale-sky-700 dark:text-pale-sky-300 font-bold">
            <span>{t('dashStatsWeeklyTime')}</span>
            <Clock className="w-4 h-4 text-pale-sky-500" />
          </div>
          <div className="text-lg font-black text-main font-mono">
            {formatDuration(metrics.weeklySeconds)}
          </div>
        </div>
      </div>

      {/* Weekly Activity Totals: Pages, Highlights, Notes */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-2xl bg-canvas border border-subtle flex items-center gap-2.5">
          <BookOpen className="w-4 h-4 text-emerald-500 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-black font-mono text-main">
              {metrics.pagesThisWeek}
            </div>
            <div className="text-[11px] text-muted truncate">
              {t('dashStatsPagesThisWeek')}
            </div>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-canvas border border-subtle flex items-center gap-2.5">
          <Highlighter className="w-4 h-4 text-amber-500 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-black font-mono text-main">
              {metrics.highlightsThisWeek}
            </div>
            <div className="text-[11px] text-muted truncate">
              {t('dashStatsHighlightsThisWeek')}
            </div>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-canvas border border-subtle flex items-center gap-2.5">
          <FileText className="w-4 h-4 text-pale-sky-500 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-black font-mono text-main">
              {metrics.notesThisWeek}
            </div>
            <div className="text-[11px] text-muted truncate">
              {t('dashStatsNotesThisWeek')}
            </div>
          </div>
        </div>
      </div>

      {/* Bilingual Category Breakdown */}
      <div className="rounded-2xl bg-canvas/60 border border-subtle p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-main">
          <PieChart className="w-4 h-4 text-pale-sky-500" />
          <span>{t('dashStatsCategoryBreakdown')}</span>
        </div>

        {categoryBreakdown.length === 0 ? (
          <div className="space-y-2"><p className="text-xs text-muted">{t('statsNoData')}</p><button type="button" className="underline text-xs" onClick={() => setViewMode('library')}>{t('dashOpenLibraryAction')}</button></div>
        ) : (
          <div className="space-y-2.5">
            {categoryBreakdown.map((cat) => (
              <div key={cat.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-main truncate">{cat.label}</span>
                  <span className="font-mono text-muted">
                    {cat.count} ({cat.percent}%)
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-subtle/60 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-pale-sky-500 transition-all"
                    style={{ width: `${Math.max(6, cat.percent)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
