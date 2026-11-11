import React from 'react';
import { BookOpen, Clock, Flame, Layers, ArrowUpRight } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStatisticsSnapshot } from '../statistics/useStatisticsSnapshot';
import { buildTimeline } from '../../../shared/statistics-workspace';
import { civilDate } from '../../../shared/study-planner';

export function DashboardEssentialStats() {
  const { t, lang, setViewMode, dir } = useWorkspace();
  const { snapshot, streak, error, retry } = useStatisticsSnapshot();
  const today = civilDate(new Date());
  const minutes = buildTimeline((snapshot?.reading || []).map(day => ({ date: day.date, value: day.seconds / 60 })), 'week', today).reduce((sum, day) => sum + day.value, 0);
  const tiles = [
    { key: 'statisticsCurrentStreak' as const, value: streak?.currentStreakDays, icon: Flame, unit: t('statisticsDaysUnit') },
    { key: 'statisticsWeekTime' as const, value: snapshot ? Math.round(minutes) : undefined, icon: Clock, unit: t('statisticsMinutesUnit') },
    { key: 'statisticsInProgress' as const, value: snapshot?.inProgress, icon: BookOpen },
    { key: 'statisticsDue' as const, value: snapshot?.due.filter(item => item.dueAt <= today).reduce((sum, item) => sum + item.count, 0), icon: Layers },
  ];
  return <section data-dashboard-essential-stats className="space-y-3" aria-label={t('statisticsEssentials')}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">{t('statisticsEssentials')}</h2>
      <button data-open-statistics type="button" className="inline-flex items-center gap-1 text-sm text-primary-text rounded-lg px-2 py-1.5 hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-focus" onClick={() => setViewMode('statistics')}>
        {t('statisticsOpen')}<ArrowUpRight aria-hidden="true" className={`h-4 w-4 ${dir === 'rtl' ? '-scale-x-100' : ''}`} />
      </button>
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{tiles.map(({ key, value, icon: Icon, unit }) => <div key={key} data-essential-tile className="rounded-2xl border border-border bg-surface p-3 sm:p-4 min-w-0 space-y-2">
      <div className="flex items-start gap-2 text-xs text-text-muted leading-relaxed"><Icon aria-hidden="true" className="w-4 h-4 text-primary-text shrink-0 mt-0.5" /><span>{t(key)}</span></div>
      <p className="text-2xl font-semibold tabular-nums leading-relaxed">{value === undefined ? <span aria-hidden="true" data-feedback-inline-skeleton className="inline-block h-8 w-16 animate-pulse rounded-md bg-border/50 align-middle" /> : value.toLocaleString(lang === 'ar' ? 'ar-EG-u-nu-arab' : 'en-US')} <span className="text-xs text-text-muted font-normal">{unit}</span></p>
    </div>)}</div>
    {error && <p role="alert" className="text-sm">{t('statisticsLoadError')} <button type="button" onClick={retry} className="underline">{t('statisticsRetry')}</button></p>}
  </section>;
}
