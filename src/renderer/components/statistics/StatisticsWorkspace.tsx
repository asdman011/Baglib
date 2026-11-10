import React, { useEffect, useState } from 'react';
import { BookOpen, ChartNoAxesCombined, GraduationCap, Layers, Moon } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { SeriesChart, ProgressRing, SubjectDonut } from './StatisticsCharts';
import { useStatisticsSnapshot } from './useStatisticsSnapshot';
import { buildTimeline, examCountdown, reviewForecast, type StatisticsRange } from '../../../shared/statistics-workspace';
import { civilDate, parseCivilDate } from '../../../shared/study-planner';
import type { Pathway } from '../../../shared/pathways';
import type { CurriculumExamConfig } from '../../../shared/curriculum-exam';
import type { KhatmahPlan } from '../../../shared/types/khatmah';
import type { QuranWirdConfig } from '../../../shared/quran-wird';
import type { TranslationKey } from '../../translations';

type StudyPath = Pathway & { exam: CurriculumExamConfig | null };
const RANGE_KEYS: Record<StatisticsRange, TranslationKey> = {
  week: 'statisticsWeek', month: 'statisticsMonth', year: 'statisticsYear', all: 'statisticsAll',
};

function StatisticsSection({ id, title, icon: Icon, children }: {
  id: string; title: string; icon: typeof BookOpen; children: React.ReactNode;
}) {
  return <section data-statistics-section={id} aria-labelledby={`statistics-${id}`} className="rounded-3xl border border-border bg-surface p-4 sm:p-6 space-y-4 min-w-0">
    <h2 id={`statistics-${id}`} className="flex items-center gap-3 text-base sm:text-lg font-bold leading-relaxed"><span className="p-2 rounded-xl bg-primary/10 text-primary-text"><Icon aria-hidden="true" className="w-5 h-5" /></span>{title}</h2>
    {children}
  </section>;
}

export function StatisticsWorkspace() {
  const { t, lang, dir } = useWorkspace();
  const { snapshot, streak, error, retry } = useStatisticsSnapshot();
  const [range, setRange] = useState<StatisticsRange>('month');
  const [paths, setPaths] = useState<StudyPath[]>([]);
  const [plans, setPlans] = useState<KhatmahPlan[]>([]);
  const [wird, setWird] = useState<QuranWirdConfig | null>(null);
  const [detailsError, setDetailsError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [detailsLoaded, setDetailsLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    const api = window.electronAPI;
    void Promise.allSettled([
      api.pathways.list().then(async rows => Promise.all(rows.map(async (path: Pathway) => ({ ...path, exam: path.kind === 'curriculum' ? await api.pathwayExam.getConfig(path.id) : null })))),
      api.quran.khatmahList().then(result => { if (!result.ok) throw new Error(result.error); return result.data.plans; }),
      api.studyWird.getConfig(),
    ]).then(([pathResult, planResult, wirdResult]) => {
      if (!alive) return;
      setDetailsError([pathResult, planResult, wirdResult].some(result => result.status === 'rejected'));
      if (pathResult.status === 'fulfilled') setPaths(pathResult.value);
      if (planResult.status === 'fulfilled') setPlans(planResult.value);
      if (wirdResult.status === 'fulfilled') setWird(wirdResult.value);
      setDetailsLoaded(true);
    });
    return () => { alive = false; };
  }, [revision]);
  const today = civilDate(new Date());
  const locale = lang === 'ar' ? 'ar-EG-u-nu-arab' : 'en-US';
  const number = (value: number) => value.toLocaleString(locale, { maximumFractionDigits: 1 });
  const date = (value: string) => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(parseCivilDate(value));
  const reading = snapshot?.reading || [];
  const knowledge = snapshot?.knowledge || [];
  const reviews = snapshot?.reviews || [];
  const timeline = (points: { date: string; value: number }[]) => buildTimeline(points, range, today);
  const minutes = timeline(reading.map(day => ({ date: day.date, value: day.seconds / 60 })));
  const pages = timeline(reading.map(day => ({ date: day.date, value: day.pages })));
  const notes = timeline(knowledge.map(day => ({ date: day.date, value: day.notes })));
  const cards = timeline(knowledge.map(day => ({ date: day.date, value: day.cards })));
  const reviewTotal = timeline(reviews.map(day => ({ date: day.date, value: day.total }))).reduce((sum, day) => sum + day.value, 0);
  const retained = timeline(reviews.map(day => ({ date: day.date, value: day.retained }))).reduce((sum, day) => sum + day.value, 0);
  const pageCount = pages.reduce((sum, point) => sum + point.value, 0);
  const empty = <p className="text-sm text-text-muted leading-relaxed">{t('statisticsEmpty')}</p>;
  return <div data-statistics-workspace dir={dir} className="flex-1 min-h-0 overflow-y-auto bg-canvas/40 p-3 sm:p-6 space-y-5 text-text">
    <header className="flex flex-wrap justify-between items-start gap-4">
      <div className="space-y-1">
        <h1 className="flex items-center gap-3 text-xl sm:text-2xl font-bold leading-relaxed"><ChartNoAxesCombined className="w-6 h-6 text-primary-text" aria-hidden="true" />{t('statisticsTitle')}</h1>
        <p className="text-sm text-text-muted leading-relaxed">{t('statisticsIntro')}</p>
      </div>
      <fieldset className="flex flex-wrap gap-1 p-1 rounded-xl border border-border bg-surface">
        <legend className="sr-only">{t('statisticsRange')}</legend>
        {(Object.keys(RANGE_KEYS) as StatisticsRange[]).map(value => <button type="button" key={value} data-statistics-range={value} aria-pressed={range === value} onClick={() => setRange(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-focus ${range === value ? 'bg-primary/15 text-primary-text' : 'text-text-muted hover:bg-canvas'}`}>{t(RANGE_KEYS[value])}</button>)}
      </fieldset>
    </header>
    {(error || detailsError) && <div role="alert" className="rounded-xl border border-border p-3 text-sm">{t('statisticsLoadError')} <button className="underline" type="button" onClick={() => { retry(); setRevision(value => value + 1); }}>{t('statisticsRetry')}</button></div>}
    {!snapshot && !error && <p role="status">{t('plannerLoading')}</p>}
    {snapshot && <>
      <StatisticsSection id="reading" title={t('statisticsReading')} icon={BookOpen}>
        <div className="flex flex-wrap gap-3 items-center text-sm">
          <span className="px-3 py-2 rounded-xl bg-primary/10 text-primary-text">{t('statisticsPages')} · <strong>{number(pageCount)}</strong></span>
          <span className="text-text-muted">{t('statisticsCurrentStreak')} · {number(streak?.currentStreakDays || 0)} {t('statisticsDaysUnit')} · {t('statisticsSnapshot')}</span>
        </div>
        <p className="text-xs text-text-muted">{t('statisticsReadingHint')}</p>
        <div className="grid md:grid-cols-2 gap-4">
          <SeriesChart title={t('statisticsMinutes')} points={minutes} unit={t('statisticsMinutesUnit')} />
          <SeriesChart title={t('statisticsHeatmap')} points={pages} unit={t('statisticsPages')} kind="heatmap" />
        </div>
      </StatisticsSection>
      <StatisticsSection id="books" title={t('statisticsBooks')} icon={BookOpen}>
        <p className="text-xs text-text-muted">{t('statisticsSnapshot')}</p>
        <div className="flex flex-wrap gap-3 text-sm"><span>{t('statisticsInProgress')} · <strong>{number(snapshot.inProgress)}</strong></span><span>{t('statisticsCompleted')} · <strong>{number(snapshot.completed)}</strong></span></div>
        <div className="grid md:grid-cols-2 gap-4">
          <SeriesChart kind="area" title={t('statisticsCompletions')} points={timeline(snapshot.completions)} unit={t('statisticsCompleted')} />
          <SubjectDonut items={snapshot.subjects.map(subject => ({ label: (lang === 'ar' ? subject.ar : subject.en) || subject.ar || subject.en || t('studyUncategorized'), value: subject.count }))} />
          <SeriesChart title={t('statisticsActiveBooks')} points={timeline(reading.map(day => ({ date: day.date, value: day.activeBooks })))} unit={t('statisticsBookDays')} />
        </div>
        <p className="text-xs text-text-muted leading-relaxed">{t('statisticsHistoryHint')}</p>
      </StatisticsSection>
      <StatisticsSection id="knowledge" title={t('statisticsKnowledge')} icon={Layers}>
        <div className="grid md:grid-cols-2 gap-4">
          <SeriesChart title={t('statisticsNotes')} points={notes} unit={t('statisticsNotes')} />
          <SeriesChart title={t('statisticsCards')} points={cards} unit={t('statisticsCards')} />
          <ProgressRing title={t('statisticsRetention')} value={retained} total={reviewTotal} detail={t('statisticsRetentionHint')} />
          <SeriesChart title={t('statisticsForecast')} points={reviewForecast(snapshot.due, today)} unit={t('statisticsDue')} />
        </div>
        <p className="text-xs text-text-muted">{t('statisticsForecastHint')}</p>
      </StatisticsSection>
    </>}
    <StatisticsSection id="study" title={t('statisticsStudy')} icon={GraduationCap}>
      <p className="text-xs text-text-muted">{t('statisticsSnapshot')}</p>
      {!detailsLoaded && <p role="status">{t('plannerLoading')}</p>}
      {detailsLoaded && !paths.length && empty}
      <div className="grid md:grid-cols-2 gap-4">{paths.map(path => {
        const days = examCountdown(path.exam?.examDate || null, today);
        const examLabel = days === null ? t('statisticsNoExam') : days < 0 ? t('statisticsExamPassed') : t('statisticsDaysRemaining', { count: number(days) });
        return <div key={path.id} className="space-y-2 min-w-0">
          <ProgressRing title={path.name} value={path.done} total={path.steps} detail={t('statisticsSteps')} />
          {path.kind === 'curriculum' && <p className="text-xs text-text-muted px-2 leading-relaxed">{t('statisticsExam')} · {examLabel}{path.exam?.examDate && <> · <time>{date(path.exam.examDate)}</time></>}</p>}
        </div>;
      })}</div>
      <p className="text-xs text-text-muted">{t('statisticsPathwayHint')}</p>
    </StatisticsSection>
    <StatisticsSection id="quran" title={t('statisticsQuran')} icon={Moon}>
      <p className="text-xs text-text-muted">{t('statisticsSnapshot')}</p>
      {detailsLoaded && !plans.length && !wird?.lastCompletedDate && empty}
      <div className="grid md:grid-cols-2 gap-4">{plans.map(plan => <div key={plan.id} className="space-y-3 min-w-0">
        <ProgressRing title={plan.title || t('statisticsKhatmah')} value={new Set(plan.reads.map(read => read.page)).size} total={plan.binding.totalPages} detail={t('statisticsKhatmah')} />
        <SeriesChart title={t('statisticsPages')} points={timeline(plan.reads.map(read => ({ date: read.date, value: 1 })))} unit={t('statisticsPages')} />
      </div>)}
      {wird?.lastCompletedDate && <div className="space-y-3 min-w-0">
        <ProgressRing title={t('statisticsWird')} value={wird.lastCompletedDate === today ? 1 : 0} total={1} detail={t('statisticsWirdDone', { date: date(wird.lastCompletedDate) })} />
        <p className="text-sm px-2">{t('statisticsWirdPosition')} · {t('statisticsQuranPosition', { surah: number(wird.currentPosition.surah), ayah: number(wird.currentPosition.ayah) })}</p>
      </div>}
      </div>
      <p className="text-xs text-text-muted leading-relaxed">{t('statisticsQuranHint')}</p>
    </StatisticsSection>
  </div>;
}
