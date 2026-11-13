import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { taskCountLabel } from '../../utils/task-count';
import { addCivilDays, calendarParts, civilDate, parseCivilDate, plannerRange, type PlannerCalendar as Calendar, type PlannerPeriod, type StudyTask } from '../../../shared/study-planner';
const control = 'rounded-lg border border-subtle bg-surface p-2 text-sm text-main min-w-0';
export function PlannerCalendar({ tasks, adjustment, onPickDate, onSelectTask }: { tasks: StudyTask[]; adjustment: number; onPickDate: (date: string) => void; onSelectTask: (task: StudyTask) => void }) {
  const { t, lang } = useWorkspace();
  const [anchor, setAnchor] = useState(() => civilDate(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => civilDate(new Date()));
  const [calendar, setCalendar] = useState<Calendar>('gregorian');
  const [scope, setScope] = useState<'all' | 'scheduled' | 'unscheduled'>('all');
  const [period, setPeriod] = useState<PlannerPeriod>('month');
  const range = useMemo(() => plannerRange(parseCivilDate(anchor), period, calendar, adjustment), [anchor, period, calendar, adjustment]);
  const format = (date: Date) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', { calendar: calendar === 'hijri' ? 'islamic-umalqura' : 'gregory', dateStyle: 'medium' }).format(calendar === 'hijri' ? addCivilDays(date, adjustment) : date);
  const overlap = (task: StudyTask, first: string, last: string) => !!(task.startDate || task.dueDate) && (task.startDate || task.dueDate)! <= last && (task.dueDate || task.startDate)! >= first;
  const filtered = tasks.filter(task => scope === 'all' || scope === 'scheduled' && overlap(task, civilDate(range.start), civilDate(range.end)) || scope === 'unscheduled' && !task.startDate && !task.dueDate);
  const dayTasks = scope === 'unscheduled' ? filtered : filtered.filter(task => overlap(task, selectedDate, selectedDate));
  const days: Date[] = [];
  for (let date = range.start; date <= range.end; date = addCivilDays(date, 1)) days.push(date);
  const months = days.filter((date, index) => index === 0 || calendarParts(date, calendar, adjustment).month !== calendarParts(days[index - 1], calendar, adjustment).month);
  return <div data-planner-calendar-grid className="space-y-3">
    <div className="flex gap-2 flex-wrap items-center">
      <select aria-label={t('plannerCalendar')} data-planner-calendar className={control} value={calendar} onChange={event => setCalendar(event.target.value as Calendar)}><option value="gregorian">{t('plannerGregorian')}</option><option value="hijri">{t('plannerHijri')}</option></select>
      <select aria-label={t('plannerPeriod')} data-planner-period className={control} value={period} onChange={event => setPeriod(event.target.value as PlannerPeriod)}><option value="week">{t('plannerWeek')}</option><option value="month">{t('plannerMonth')}</option><option value="year">{t('plannerYear')}</option></select>
      <select data-planner-calendar-scope aria-label={t('plannerFilter')} className={control} value={scope} onChange={event => setScope(event.target.value as typeof scope)}><option value="all">{t('plannerAll')}</option><option value="scheduled">{t('plannerScheduled')}</option><option value="unscheduled">{t('plannerUnscheduled')}</option></select>
      <button className={control} aria-label={t('plannerPrevious')} onClick={() => setAnchor(civilDate(addCivilDays(range.start, -1)))}><ChevronLeft className="w-4 h-4 rtl:rotate-180" /></button>
      <button className={control} onClick={() => setAnchor(civilDate(new Date()))}>{t('plannerToday')}</button>
      <button className={control} aria-label={t('plannerNext')} onClick={() => setAnchor(civilDate(addCivilDays(range.end, 1)))}><ChevronRight className="w-4 h-4 rtl:rotate-180" /></button>
      <p className="text-sm">{format(range.start)} — {format(range.end)}</p>
    </div>
    <div className="max-w-full overflow-x-auto overscroll-x-contain pb-2" tabIndex={0} role="region" aria-label={t('plannerCalendar')}>
    <div className={`grid gap-1 ${period === 'year' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'grid-cols-7 sm:min-w-[42rem]'}`}>
      {/* Phones: the seven columns fit without scrolling, so day cells show only the day number under a weekday header (Saturday first, like the grid). */}
      {period !== 'year' && Array.from({ length: 7 }, (_, index) => <div key={`weekday-${index}`} aria-hidden="true" className="sm:hidden text-center text-[11px] leading-relaxed text-muted">{new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(new Date(2024, 0, 6 + index))}</div>)}
      {period === 'month' && Array.from({ length: (range.start.getDay() + 1) % 7 }, (_, index) => <div key={`offset-${index}`} aria-hidden="true" />)}
      {(period === 'year' ? months : days).map(date => {
        const value = civilDate(date);
        const cellRange = period === 'year' ? plannerRange(date, 'month', calendar, adjustment) : { start: date, end: date };
        const count = filtered.filter(task => task.status === 'open' && overlap(task, civilDate(cellRange.start), civilDate(cellRange.end))).length;
        return <button key={value} className={`${control} text-start min-h-14 sm:min-h-20 max-sm:px-1 max-sm:py-1 ${value === selectedDate ? 'ring-1 ring-pale-sky-500' : ''}`} onClick={() => { setAnchor(value); if (period === 'year') setPeriod('month'); else setSelectedDate(value); }}>
          <time dateTime={value} className="block text-xs leading-relaxed">{period === 'year' ? format(date) : <><span className="max-sm:hidden">{new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(date)} </span>{calendarParts(date, calendar, adjustment).day}</>}</time>
          {filtered.filter(task => overlap(task, value, value)).slice(0, 3).map(task => <span key={task.id} className="hidden sm:block truncate text-xs leading-relaxed" dir="auto">{task.title}</span>)}
          {count > 0 && <span className="block text-pale-sky-500 text-xs mt-2 max-sm:text-[10px] max-sm:mt-1 break-words">{taskCountLabel(count, lang, t)}</span>}
        </button>;
      })}
    </div>
    </div>
    <section data-planner-day-tasks className="border-t border-subtle pt-3 space-y-2">
      <div className="flex flex-wrap gap-2 items-center justify-between"><h3 className="font-bold">{scope === 'unscheduled' ? t('plannerUnscheduled') : format(parseCivilDate(selectedDate))}</h3>{scope !== 'unscheduled' && <button className={control} onClick={() => onPickDate(selectedDate)}>{t('plannerNew')}</button>}</div>
      {dayTasks.map(task => <button key={task.id} dir="auto" className={`${control} block text-start w-full break-words leading-relaxed`} onClick={() => onSelectTask(task)}>{task.title}</button>)}
      {!dayTasks.length && <p className="text-sm text-muted">{t('plannerEmpty')}</p>}
    </section>
  </div>;
}
