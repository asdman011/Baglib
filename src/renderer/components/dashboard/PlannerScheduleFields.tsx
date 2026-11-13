import { useEffect, useRef, useState } from 'react';
import { Bell, CalendarDays, List, Repeat } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { addCivilDays, civilDate, localDateTime, DEFAULT_TASK_LIST, type StudyTaskInput, type TaskList, type TaskRecurrence } from '../../../shared/study-planner';
const control = 'rounded-lg border border-subtle bg-surface p-2 text-sm text-main min-w-0 max-w-full';
export function PlannerScheduleFields({ value, onChange, lists }: { value: StudyTaskInput; onChange: (patch: Partial<StudyTaskInput>) => void; lists: TaskList[] }) {
  const { t, lang } = useWorkspace();
  const root = useRef<HTMLDivElement>(null);
  const [pickDue, setPickDue] = useState(false);
  const [pickReminder, setPickReminder] = useState(false);
  const close = () => root.current?.querySelectorAll('details[open]').forEach(element => element.removeAttribute('open'));
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !root.current?.querySelector('details[open]')) return;
      const summary = root.current.querySelector('details[open] summary') as HTMLElement;
      close(); summary?.focus(); event.stopPropagation();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);
  const toggle = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (event.currentTarget.open) root.current?.querySelectorAll('details[open]').forEach(element => { if (element !== event.currentTarget) element.removeAttribute('open'); });
  };
  const menu = 'absolute bottom-full end-0 mb-2 w-64 max-w-[calc(100vw-2rem)] max-h-80 overflow-auto rounded-xl border border-subtle bg-surface p-2 text-sm text-main shadow-xl z-30';
  const item = 'flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-start leading-relaxed hover:bg-surface-hover';
  const trigger = 'flex cursor-pointer list-none items-center gap-1 rounded-md p-1.5 text-muted hover:bg-surface-hover [&::-webkit-details-marker]:hidden';
  const listName = (list: TaskList) => list.id === DEFAULT_TASK_LIST && list.name === 'Tasks' ? t('plannerTasks') : list.name;
  const selected = lists.find(list => list.id === (value.listId || DEFAULT_TASK_LIST));
  const date = (offset: number) => civilDate(addCivilDays(new Date(), offset));
  const weekday = (offset: number) => new Intl.DateTimeFormat(lang, { weekday: 'long' }).format(addCivilDays(new Date(), offset));
  const remind = (offset: number) => {
    const next = offset === 0 ? new Date(new Date().getTime() + 60 * 60_000) : addCivilDays(new Date(), offset);
    if (offset !== 0) next.setHours(9, 0, 0, 0);
    return localDateTime(next);
  };
  const recurrence = value.recurrence;
  const updateRepeat = (patch: Partial<TaskRecurrence>) => onChange({ recurrence: { ...recurrence!, ...patch } });
  return <div ref={root} className="flex shrink-0 items-center gap-0.5" data-planner-schedule>
    <details className="relative" onToggle={toggle} data-planner-list-menu><summary className={trigger} aria-label={t('plannerList')} title={t('plannerList')}><List size={16} /><span dir="auto" className="max-w-14 truncate text-xs">{selected ? listName(selected) : t('plannerTasks')}</span></summary>
      <div className={menu} role="group" aria-label={t('plannerList')}>{lists.map(list => <button key={list.id} type="button" data-planner-list={list.id} aria-pressed={list.id === value.listId} className={item} onClick={() => { onChange({ listId: list.id }); close(); }}><span className="flex gap-2 items-center"><span aria-hidden="true">{list.icon || <List size={16} />}</span><bdi>{listName(list)}</bdi></span></button>)}</div>
    </details>
    <details className="relative" onToggle={toggle} data-planner-due-menu><summary className={trigger} aria-label={t('plannerDue')} title={t('plannerDue')}><CalendarDays size={16} />{value.dueDate && <span className="max-w-12 truncate rounded bg-pale-sky-500/10 px-1 text-xs">{value.dueDate === date(0) ? t('plannerToday') : value.dueDate === date(1) ? t('plannerTomorrow') : new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric' }).format(new Date(value.dueDate + 'T12:00:00'))}</span>}</summary>
      <div className={menu}>{[0, 1, 7].map((offset, index) => <button type="button" key={offset} className={item} onClick={event => { onChange({ dueDate: date(offset) }); event.currentTarget.closest('details')?.removeAttribute('open'); }}><span>{t(index === 0 ? 'plannerToday' : index === 1 ? 'plannerTomorrow' : 'plannerNextWeek')}</span><span className="text-xs text-muted">{weekday(offset)}</span></button>)}
        <div className="border-t border-subtle pt-1"><button type="button" className={item} onClick={() => setPickDue(true)}>{t('plannerPickDate')}</button>{pickDue && <label>{t('plannerPickDate')}<input data-planner-due type="date" min="1900-01-01" max="2200-12-31" className={`${control} block w-full`} value={value.dueDate || ''} onChange={event => onChange({ dueDate: event.target.value || null })} /></label>}</div>
      </div>
    </details>
    <details className="relative" onToggle={toggle} data-planner-reminder-menu><summary className={trigger} aria-label={t('plannerReminder')} title={t('plannerReminder')}><Bell size={16} />{value.reminderAt && <span className="max-w-14 truncate rounded bg-pale-sky-500/10 px-1 text-xs">{new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value.reminderAt))}</span>}</summary>
      <div className={menu}>{[0, 1, 7].map((offset, index) => <button key={offset} type="button" aria-label={t(index === 0 ? 'plannerLaterToday' : index === 1 ? 'plannerTomorrowNine' : 'plannerNextWeekNine')} className={item} onClick={event => { onChange({ reminderAt: remind(offset) }); event.currentTarget.closest('details')?.removeAttribute('open'); }}><span>{t(index === 0 ? 'plannerLaterToday' : index === 1 ? 'plannerTomorrow' : 'plannerNextWeek')}</span><span className="text-xs text-muted">{new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit' }).format(new Date(remind(offset)))}</span></button>)}
        <div className="border-t border-subtle pt-1"><button type="button" className={item} onClick={() => setPickReminder(true)}>{t('plannerPickDateTime')}</button>{pickReminder && <label>{t('plannerPickDateTime')}<input data-planner-reminder type="datetime-local" min="1900-01-01T00:00" max="2200-12-31T23:59" className={`${control} block w-full`} value={value.reminderAt || ''} onChange={event => onChange({ reminderAt: event.target.value || null })} /></label>}</div>
        <button type="button" className="text-start p-1 underline" onClick={() => onChange({ reminderAt: null })}>{t('plannerNoReminder')}</button>
      </div>
    </details>
    <details className="relative" onToggle={toggle} data-planner-repeat-menu><summary className={trigger} aria-label={t('plannerRepeat')} title={t('plannerRepeat')}><Repeat size={16} className={recurrence ? 'text-pale-sky-500' : ''} /></summary>
      <div className={menu} role="group" aria-label={t('plannerRepeat')}>
        <button type="button" className={item} onClick={() => { onChange({ recurrence: null }); close(); }}>{t('plannerNeverRepeat')}</button>
        {(['daily', 'weekdays', 'weekly', 'monthly', 'yearly', 'custom'] as const).map(kind => <button type="button" key={kind} data-planner-repeat={kind} className={item} aria-pressed={recurrence?.kind === kind} onClick={() => { onChange({ recurrence: { kind, ...(kind === 'custom' ? { interval: 1, unit: 'days' as const } : {}) } }); if (kind !== 'custom') close(); }}>{t(({ daily: 'plannerDaily', weekdays: 'plannerWeekdays', weekly: 'plannerWeekly', monthly: 'plannerMonthly', yearly: 'plannerYearly', custom: 'plannerCustom' } as const)[kind])}</button>)}
      {recurrence?.kind === 'custom' && <div className="space-y-2 mt-2">
        <label className="block">{t('plannerEvery')}<input type="number" min={1} max={365} className={`${control} w-20 ms-2`} value={recurrence.interval} onChange={event => updateRepeat({ interval: Number(event.target.value) })} /></label>
        <select aria-label={t('plannerRepeatUnit')} className={control} value={recurrence.unit} onChange={event => updateRepeat({ unit: event.target.value as TaskRecurrence['unit'] })}><option value="days">{t('plannerDays')}</option><option value="weeks">{t('plannerWeeks')}</option><option value="months">{t('plannerMonths')}</option></select>
        {recurrence.unit === 'weeks' && <div className="flex flex-wrap gap-2">{Array.from({ length: 7 }, (_, day) => <label key={day}><input type="checkbox" checked={recurrence.weekdays?.includes(day) ?? false} onChange={event => updateRepeat({ weekdays: event.target.checked ? [...recurrence.weekdays ?? [], day] : recurrence.weekdays?.filter(value => value !== day) })} /> {new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(new Date(2024, 0, 7 + day))}</label>)}</div>}
      </div>}
      </div>
    </details>
  </div>;
}
