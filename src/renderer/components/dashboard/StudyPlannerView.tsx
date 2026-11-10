'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Plus } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { StudyLinkPicker } from '../notes/StudyLinkPicker';
import { matchesStudyQuery, studyLinks } from '../../../shared/study-notes';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';
import { addCivilDays, calendarParts, civilDate, parseCivilDate, plannerRange, plannerReferenceTarget, type PlannerCalendar, type PlannerPeriod, type StudyTask, type StudyTaskInput } from '../../../shared/study-planner';

const emptyTask = (): StudyTaskInput => ({ title: '', description: '', status: 'open', startDate: null, dueDate: null, priority: 0, sortOrder: 0, references: [] });
const control = 'rounded-lg border border-subtle bg-surface p-2 text-sm text-main min-w-0';

export function StudyPlannerView({ adjustment = 0 }: { adjustment?: number }) {
  const { t, lang, dir, books, openBookForReading } = useWorkspace();
  const { notes } = useStudyNotes();
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [draft, setDraft] = useState<StudyTaskInput>(emptyTask);
  const [anchor, setAnchor] = useState(() => civilDate(new Date()));
  const [calendar, setCalendar] = useState<PlannerCalendar>('gregorian');
  const [period, setPeriod] = useState<PlannerPeriod>('month');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'all' | 'scheduled' | 'unscheduled'>('all');
  const reload = useCallback(async () => {
    if (!window.electronAPI?.planner) throw new Error('missing-api');
    setTasks(await window.electronAPI.planner.list());
  }, []);
  useEffect(() => {
    let alive = true;
    window.electronAPI?.planner?.list().then(rows => { if (alive) { setTasks(rows); setLoading(false); } }).catch(() => { if (alive) { setError(true); setLoading(false); } });
    if (!window.electronAPI?.planner) { queueMicrotask(() => { if (alive) { setError(true); setLoading(false); } }); }
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const handleNewTask = () => {
      setDraft(emptyTask());
      const inputEl = document.querySelector<HTMLInputElement>('[data-study-planner] input[type="text"]');
      inputEl?.focus();
    };
    window.addEventListener('baglib:new-task', handleNewTask);
    return () => window.removeEventListener('baglib:new-task', handleNewTask);
  }, []);
  const range = useMemo(() => plannerRange(parseCivilDate(anchor), period, calendar, adjustment), [anchor, period, calendar, adjustment]);
  const from = civilDate(range.start);
  const to = civilDate(range.end);
  const format = (date: Date) => {
    const shown = calendar === 'hijri' ? addCivilDays(date, adjustment) : date;
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', { calendar: calendar === 'hijri' ? 'islamic-umalqura' : 'gregory', dateStyle: 'medium' }).format(shown);
  };
  const overlap = (task: StudyTask, first: string, last: string) => !!(task.startDate || task.dueDate) && (task.startDate || task.dueDate)! <= last && (task.dueDate || task.startDate)! >= first;
  const visible = tasks.filter(task => {
    const matches = matchesStudyQuery(`${task.title} ${task.description}`, search);
    return matches && (scope === 'all' || scope === 'unscheduled' && !task.startDate && !task.dueDate || scope === 'scheduled' && overlap(task, from, to));
  });
  const days: Date[] = [];
  for (let date = range.start; date <= range.end; date = addCivilDays(date, 1)) days.push(date);
  const months = days.filter((date, index) => index === 0 || calendarParts(date, calendar, adjustment).month !== calendarParts(days[index - 1], calendar, adjustment).month);
  const perform = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError(false);
    try { await operation(); await reload(); } catch { setError(true); } finally { setBusy(false); }
  };
  const save = async () => {
    await perform(async () => { await window.electronAPI.planner.save(draft); setDraft(emptyTask()); });
  };
  const edit = (task: StudyTask) => setDraft({ ...task, expectedUpdatedAt: task.updatedAt });
  const openReference = async (target: string) => {
    try { await navigateStudyReference(target, books, openBookForReading, (id, anchor) => openStudyNote({ id, anchor })); } catch { setError(true); }
  };
  return <section data-study-planner dir={dir} className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 space-y-4 text-main">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-bold flex gap-2 items-center"><CalendarDays className="w-5 h-5" />{t('plannerTitle')}</h1>
      <button className={control} onClick={() => setDraft(emptyTask())}><Plus className="w-4 h-4 inline" /> {t('plannerNew')}</button>
    </header>
    {error && <div role="alert" className="p-3 border border-red-500 rounded-lg">{t('plannerError')} <button className="underline" onClick={() => void perform(reload)}>{t('plannerReload')}</button></div>}
    {loading && <p role="status">{t('plannerLoading')}</p>}
    {tasks.length >= 5000 && <p role="status">{t('plannerLimit')}</p>}
    <div className="flex gap-2 flex-wrap items-center">
      <select aria-label={t('plannerCalendar')} className={control} value={calendar} onChange={event => setCalendar(event.target.value as PlannerCalendar)}><option value="gregorian">{t('plannerGregorian')}</option><option value="hijri">{t('plannerHijri')}</option></select>
      <select aria-label={t('plannerPeriod')} className={control} value={period} onChange={event => setPeriod(event.target.value as PlannerPeriod)}><option value="week">{t('plannerWeek')}</option><option value="month">{t('plannerMonth')}</option><option value="year">{t('plannerYear')}</option></select>
      <button className={control} aria-label={t('plannerPrevious')} onClick={() => setAnchor(civilDate(addCivilDays(range.start, -1)))}><ChevronLeft className="w-4 h-4 rtl:rotate-180" /></button>
      <button className={control} onClick={() => setAnchor(civilDate(new Date()))}>{t('plannerToday')}</button>
      <button className={control} aria-label={t('plannerNext')} onClick={() => setAnchor(civilDate(addCivilDays(range.end, 1)))}><ChevronRight className="w-4 h-4 rtl:rotate-180" /></button>
      <p className="text-sm">{format(range.start)} — {format(range.end)}</p>
    </div>
    <div className="max-w-full overflow-x-auto overscroll-x-contain pb-2" tabIndex={0} role="region" aria-label={t('plannerCalendar')}>
    <div className={`grid gap-1 ${period === 'year' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'min-w-[42rem] grid-cols-7'}`}>
      {period === 'month' && Array.from({ length: (range.start.getDay() + 1) % 7 }, (_, index) => <div key={`offset-${index}`} aria-hidden="true" />)}
      {(period === 'year' ? months : days).map(date => {
        const value = civilDate(date);
        const cellRange = period === 'year' ? plannerRange(date, 'month', calendar, adjustment) : { start: date, end: date };
        const count = tasks.filter(task => task.status === 'open' && overlap(task, civilDate(cellRange.start), civilDate(cellRange.end))).length;
        return <button key={value} className={`${control} text-start min-h-20 ${value === civilDate(new Date()) ? 'ring-1 ring-pale-sky-500' : ''}`} onClick={() => { setAnchor(value); if (period === 'year') setPeriod('month'); else setDraft({ ...emptyTask(), startDate: value, dueDate: value }); }}>
          <time dateTime={value} className="block text-xs leading-relaxed">{period === 'year' ? format(date) : `${new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(date)} ${calendarParts(date, calendar, adjustment).day}`}</time>
          {count > 0 && <span className="block text-pale-sky-500 text-xs mt-2">{count === 1 ? t('dashCalendarSingleTask') : t('plannerTaskCount', { count })}</span>}
        </button>;
      })}
    </div>
    </div>
    <div className="grid lg:grid-cols-2 gap-4">
      <form className="border border-subtle rounded-xl bg-surface p-3 space-y-3 min-w-0" onSubmit={event => { event.preventDefault(); void save(); }}>
        <h2 className="font-bold">{draft.id ? t('plannerEdit') : t('plannerNew')}</h2>
        <label className="block text-sm">{t('plannerTaskTitle')}<input required maxLength={300} dir="auto" className={`${control} block w-full`} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="block text-sm">{t('plannerDescription')}<textarea maxLength={20000} dir="auto" className={`${control} block w-full`} rows={3} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
        <p className="text-xs text-muted">{t('plannerDateHint')}</p>
        <div className="flex gap-2 flex-wrap">
          <label className="min-w-0 flex-1 text-sm">{t('plannerStart')}<input type="date" min="1900-01-01" max="2200-12-31" className={`${control} block w-full`} value={draft.startDate || ''} onChange={event => setDraft({ ...draft, startDate: event.target.value || null })} /></label>
          <label className="min-w-0 flex-1 text-sm">{t('plannerDue')}<input type="date" min="1900-01-01" max="2200-12-31" className={`${control} block w-full`} value={draft.dueDate || ''} onChange={event => setDraft({ ...draft, dueDate: event.target.value || null })} /></label>
        </div>
        <label className="text-sm block">{t('plannerPriority')}<select className={`${control} ms-2`} value={draft.priority} onChange={event => setDraft({ ...draft, priority: Number(event.target.value) })}>{[0, 1, 2, 3].map(value => <option key={value} value={value}>{t(value === 0 ? 'plannerNormal' : value === 1 ? 'plannerLow' : value === 2 ? 'plannerHigh' : 'plannerUrgent')}</option>)}</select></label>
        <label className="text-sm block">{t('plannerStatus')}<select className={`${control} ms-2`} value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as StudyTask['status'] })}><option value="open">{t('plannerOpen')}</option><option value="completed">{t('plannerCompleted')}</option><option value="cancelled">{t('plannerCancelled')}</option></select></label>
        <p className="text-sm">{t('plannerLinks')}</p>
        <StudyLinkPicker notes={notes} onInsert={text => { const links = studyLinks(text); setDraft(previous => ({ ...previous, references: [...previous.references, ...links.map(link => ({ target: link.target, label: link.label }))].slice(0, 20) })); }} />
        {draft.references.map((reference, index) => <div key={`${reference.target}-${index}`} className="flex gap-2 flex-wrap text-sm min-w-0"><span className="break-all flex-1" dir="auto">{reference.label}</span>{reference.target.startsWith('quran:') && <label><input type="checkbox" checked={reference.scope === 'surah'} onChange={event => setDraft({ ...draft, references: draft.references.map((item, position) => position !== index ? item : { target: item.target, label: item.label, ...(event.target.checked ? { scope: 'surah' as const } : {}) }) })} /> {t('plannerWholeSurah')}</label>}<button type="button" className="underline" onClick={() => setDraft({ ...draft, references: draft.references.filter((_, position) => position !== index) })}>{t('plannerRemoveLink')}</button></div>)}
        <button disabled={busy || loading} className={`${control} bg-pale-sky-500 text-white w-full`}>{t('plannerSave')}</button>
      </form>
      <div className="space-y-3 min-w-0">
        <label className="block text-sm">{t('plannerSearch')}<input className={`${control} w-full block`} value={search} onChange={event => setSearch(event.target.value)} /></label>
        <select aria-label={t('plannerFilter')} className={control} value={scope} onChange={event => setScope(event.target.value as typeof scope)}><option value="all">{t('plannerAll')}</option><option value="scheduled">{t('plannerScheduled')}</option><option value="unscheduled">{t('plannerUnscheduled')}</option></select>
        {!visible.length && !loading && <p>{t('plannerEmpty')}</p>}
        {visible.map((task, index) => <article key={task.id} data-planner-task className="border border-subtle rounded-xl bg-surface p-3 space-y-2">
          <label className="flex items-start gap-2"><input type="checkbox" disabled={busy} checked={task.status === 'completed'} onChange={() => void perform(() => window.electronAPI.planner.save({ ...task, status: task.status === 'completed' ? 'open' : 'completed', expectedUpdatedAt: task.updatedAt }))} /><span dir="auto" className={`break-words min-w-0 ${task.status === 'completed' ? 'line-through' : ''}`}>{task.title}</span></label>
          <p dir="auto" className="whitespace-pre-wrap break-words text-sm">{task.description}</p>
          <p className="text-xs text-muted">{task.startDate || task.dueDate ? `${task.startDate ? format(parseCivilDate(task.startDate)) : ''} — ${task.dueDate ? format(parseCivilDate(task.dueDate)) : ''}` : t('plannerUnscheduled')}</p>
          <div className="flex flex-wrap gap-2">{task.references.map((reference, position) => <button key={`${reference.target}-${position}`} dir="auto" className="underline text-sm break-all" onClick={() => void openReference(plannerReferenceTarget(reference))}>{reference.label}{reference.scope === 'surah' && ` (${t('plannerWholeSurah')})`}</button>)}</div>
          <div className="flex gap-2 flex-wrap text-sm"><button disabled={busy} className={control} onClick={() => edit(task)}>{t('plannerEdit')}</button><button disabled={busy || index === 0} className={control} onClick={() => void perform(() => window.electronAPI.planner.save({ ...task, sortOrder: (visible[index - 1]?.sortOrder || 0) - 1, expectedUpdatedAt: task.updatedAt }))}>{t('plannerMoveEarlier')}</button><button disabled={busy} className={control} onClick={() => { if (window.confirm(t('plannerDeleteConfirm'))) void perform(() => window.electronAPI.planner.remove(task.id, task.updatedAt)); }}>{t('plannerDelete')}</button></div>
        </article>)}
      </div>
    </div>
  </section>;
}
