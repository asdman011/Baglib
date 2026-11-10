import { civilDate, addCivilDays, parseCivilDate } from './study-planner';

export type StatisticsRange = 'week' | 'month' | 'year' | 'all';
export interface ChartPoint { date: string; value: number }
export interface StatisticsSnapshot {
  reading: { date: string; seconds: number; pages: number; activeBooks: number }[];
  knowledge: { date: string; notes: number; cards: number }[];
  reviews: { date: string; total: number; retained: number }[];
  due: { dueAt: string; count: number }[];
  completions: ChartPoint[];
  subjects: { ar: string | null; en: string | null; count: number }[];
  inProgress: number;
  completed: number;
}

export function buildTimeline(points: ChartPoint[], range: StatisticsRange, today = civilDate(new Date())): ChartPoint[] {
  const values = new Map<string, number>();
  for (const point of points) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(point.date) && point.date <= today) {
      values.set(point.date, (values.get(point.date) || 0) + Math.max(0, Number.isFinite(point.value) ? point.value : 0));
    }
  }
  const days = { week: 7, month: 30, year: 365 };
  const earliest = [...values.keys()].sort()[0] || today;
  const start = range === 'all' ? earliest : civilDate(addCivilDays(parseCivilDate(today), 1 - days[range]));
  const result: ChartPoint[] = [];
  for (let date = start; date <= today; date = civilDate(addCivilDays(parseCivilDate(date), 1))) {
    result.push({ date, value: values.get(date) || 0 });
  }
  return result;
}

export function bucketSeries(points: ChartPoint[], maximum = 14): ChartPoint[] {
  const size = Math.max(1, Math.ceil(points.length / Math.max(1, maximum)));
  const result: ChartPoint[] = [];
  for (let index = 0; index < points.length; index += size) {
    result.push({ date: points[index].date, value: points.slice(index, index + size).reduce((sum, point) => sum + point.value, 0) });
  }
  return result;
}

export function donutSegments(values: number[]) {
  const total = values.reduce((sum, value) => sum + (Number.isFinite(value) ? Math.max(0, value) : 0), 0);
  if (!total) return [];
  let offset = 0;
  return values.map(value => {
    const fraction = Number.isFinite(value) ? Math.max(0, value) / total : 0;
    const segment = { fraction, offset };
    offset += fraction;
    return segment;
  });
}

export function progressRatio(value: number, total: number): number {
  return total > 0 && Number.isFinite(value) && Number.isFinite(total) ? Math.min(1, Math.max(0, value / total)) : 0;
}

export function reviewForecast(due: StatisticsSnapshot['due'], today = civilDate(new Date())): ChartPoint[] {
  const points = due.map(item => ({ date: item.dueAt.slice(0, 10) < today ? today : item.dueAt.slice(0, 10), value: item.count }));
  return buildTimeline(points, 'week', civilDate(addCivilDays(parseCivilDate(today), 6)));
}

export function examCountdown(date: string | null, today = civilDate(new Date())): number | null {
  if (!date) return null;
  return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
}

/** Place civil days into real weekday rows. Arabic calendars start on Saturday. */
export function calendarCells(points: ChartPoint[], weekStartsOn = 0) {
  if (!points.length) return [];
  const offset = (parseCivilDate(points[0].date).getDay() - weekStartsOn + 7) % 7;
  return points.map((point, index) => ({ ...point, column: Math.floor((index + offset) / 7), row: (index + offset) % 7 }));
}

export function areaCoordinates(points: ChartPoint[], rtl = false) {
  const maximum = Math.max(1, ...points.map(point => point.value));
  return points.map((point, index) => ({
    x: rtl ? 390 - (index + 0.5) * 380 / points.length : 10 + (index + 0.5) * 380 / points.length,
    y: 116 - Math.max(0, point.value) / maximum * 104,
  }));
}
