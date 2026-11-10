import React from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { areaCoordinates, bucketSeries, calendarCells, donutSegments, progressRatio, type ChartPoint } from '../../../shared/statistics-workspace';
import { parseCivilDate } from '../../../shared/study-planner';

export const CHART_COLORS = ['var(--color-primary-text)', 'var(--color-accent)', 'var(--color-focus)', 'var(--color-text-muted)'];

function useChartFormat() {
  const { lang, dir, t } = useWorkspace();
  const locale = lang === 'ar' ? 'ar-EG-u-nu-arab' : 'en-US';
  const number = (value: number) => value.toLocaleString(locale, { maximumFractionDigits: 1 });
  const date = (value: string) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(parseCivilDate(value));
  return { dir, lang, t, number, date };
}

export function SeriesChart({ title, points, unit, kind = 'bar' }: {
  title: string; points: ChartPoint[]; unit: string; kind?: 'bar' | 'heatmap' | 'area';
}) {
  const { dir, lang, t, number, date } = useChartFormat();
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const bars = kind === 'heatmap' ? points.slice(-366) : bucketSeries(points, 14);
  const cells = calendarCells(bars, lang === 'ar' ? 6 : 0);
  const maximum = Math.max(1, ...bars.map(point => point.value));
  const area = areaCoordinates(bars, dir === 'rtl');
  const linePath = area.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const summary = points.length ? t('statisticsChartSummary', {
    count: number(total), unit, from: date(points[0].date), to: date(points[points.length - 1].date),
  }) : t('statisticsEmpty');
  const columns = Math.max(1, (cells[cells.length - 1]?.column || 0) + 1);
  const heatWidth = Math.max(120, columns * 14 + 8);
  return <figure className="min-w-0 rounded-2xl border border-border bg-canvas/40 p-4 space-y-3">
    <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold leading-relaxed">{title}</h3>
      <span className="text-xs text-primary-text tabular-nums">{t('statisticsTotal', { count: number(total) })}</span>
    </figcaption>
    {kind !== 'heatmap' ? <svg role="img" aria-label={summary} viewBox="0 0 400 140" className="w-full h-36 text-primary-text" preserveAspectRatio="none">
      <title>{summary}</title>
      {[0, 1, 2].map(index => <line key={index} x1="4" x2="396" y1={12 + index * 52} y2={12 + index * 52} stroke="var(--color-border)" strokeDasharray="3 4" />)}
      {kind === 'area' && area.length > 0 && <>
        <path d={`${linePath} L ${area[area.length - 1].x} 116 L ${area[0].x} 116 Z`} fill="currentColor" opacity="0.16" />
        <path d={linePath} fill="none" stroke="currentColor" strokeWidth="2.5" />
        {area.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="3" fill="currentColor"><title>{date(bars[index].date)} · {number(bars[index].value)} {unit}</title></circle>)}
      </>}
      {kind === 'bar' && bars.map((point, index) => {
        const width = 380 / Math.max(1, bars.length);
        const x = dir === 'rtl' ? 390 - (index + 1) * width : 10 + index * width;
        const height = point.value / maximum * 104;
        return <rect key={point.date} x={x + 2} y={116 - height} width={Math.max(1, width - 4)} height={height} rx="3" fill="currentColor"><title>{date(point.date)} · {number(point.value)} {unit}</title></rect>;
      })}
    </svg> : <svg role="img" aria-label={summary} viewBox={`0 0 ${heatWidth} 106`} className="w-full h-32 text-primary-text" preserveAspectRatio="xMidYMid meet">
      <title>{summary}</title>
      {cells.map(point => {
        const column = point.column;
        return <rect key={point.date} x={4 + (dir === 'rtl' ? columns - column - 1 : column) * 14} y={4 + point.row * 14} width="11" height="11" rx="2" fill={point.value ? 'currentColor' : 'var(--color-border)'} opacity={point.value ? 0.3 + point.value / maximum * 0.7 : 1}><title>{date(point.date)} · {number(point.value)} {unit}</title></rect>;
      })}
    </svg>}
    {points.length > 0 && <div className="flex justify-between gap-2 text-[11px] text-text-muted"><time>{date(points[0].date)}</time><time>{date(points[points.length - 1].date)}</time></div>}
    {kind === 'heatmap' && points.length > 366 && <p className="text-xs text-text-muted">{t('statisticsHeatmapWindow')}</p>}
    <p className="text-xs text-text-muted leading-relaxed">{total ? summary : t('statisticsEmpty')}</p>
    <details className="text-xs text-text-muted">
      <summary className="cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-focus">{t('statisticsChartDetail')}</summary>
      <ul className="mt-2 max-h-40 overflow-y-auto space-y-1">{bars.map(point => <li key={point.date}>{date(point.date)} · {number(point.value)} {unit}</li>)}</ul>
    </details>
  </figure>;
}

export function ProgressRing({ title, value, total, detail }: { title: string; value: number; total: number; detail?: string }) {
  const { t, lang, number } = useChartFormat();
  const fraction = progressRatio(value, total);
  const fractionText = t('statisticsFraction', { value: number(value), total: number(total) });
  const summary = `${title} · ${fractionText}`;
  return <figure className="flex min-w-0 items-center gap-4 rounded-2xl border border-border bg-canvas/40 p-4">
    <div className="relative shrink-0 w-24 h-24">
      <svg role="img" aria-label={summary} viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <title>{summary}</title>
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--color-border)" strokeWidth="8" />
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--color-primary-text)" strokeWidth="8" strokeLinecap="round" pathLength="100" strokeDasharray={`${fraction * 100} 100`} />
      </svg>
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-base font-bold tabular-nums">{new Intl.NumberFormat(lang === 'ar' ? 'ar-EG-u-nu-arab' : 'en-US', { style: 'percent', maximumFractionDigits: 0 }).format(fraction)}</span>
    </div>
    <figcaption className="min-w-0 space-y-1 leading-relaxed">
      <h3 className="font-semibold text-sm break-words" dir="auto">{title}</h3>
      <p className="text-sm text-primary-text tabular-nums">{fractionText}</p>
      <p className="text-xs text-text-muted">{detail || (total ? '' : t('statisticsEmpty'))}</p>
    </figcaption>
  </figure>;
}

export function SubjectDonut({ items }: { items: { label: string; value: number }[] }) {
  const { t, number } = useChartFormat();
  const segments = donutSegments(items.map(item => item.value));
  const summary = items.map(item => `${item.label} ${number(item.value)}`).join(' · ') || t('statisticsEmpty');
  return <figure className="rounded-2xl border border-border bg-canvas/40 p-4 space-y-3 min-w-0">
    <figcaption className="text-sm font-semibold">{t('statisticsSubjects')}</figcaption>
    <div className="flex flex-wrap items-center gap-4">
      <svg role="img" aria-label={summary} viewBox="0 0 100 100" className="h-32 w-32 shrink-0 -rotate-90">
        <title>{summary}</title>
        <circle cx="50" cy="50" r="38" fill="none" stroke="var(--color-border)" strokeWidth="16" />
        {segments.map((segment, index) => <circle key={index} cx="50" cy="50" r="38" fill="none" stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth="16" pathLength="100" strokeDasharray={`${segment.fraction * 100} ${100 - segment.fraction * 100}`} strokeDashoffset={-segment.offset * 100} />)}
      </svg>
      <ul className="space-y-2 text-xs flex-1 min-w-0">{items.map((item, index) => <li key={index} className="flex items-start gap-2"><span aria-hidden="true" className="w-2.5 h-2.5 mt-1 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} /><bdi className="break-words flex-1">{item.label}</bdi><span className="tabular-nums">{number(item.value)}</span></li>)}</ul>
    </div>
    {!items.length && <p className="text-xs text-text-muted">{t('statisticsEmpty')}</p>}
  </figure>;
}
