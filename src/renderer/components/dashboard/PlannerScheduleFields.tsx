import { Bell, CalendarDays, List, Repeat } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { addCivilDays, civilDate, localDateTime, DEFAULT_TASK_LIST, type StudyTaskInput, type TaskList, type TaskRecurrence } from '../../../shared/study-planner';
const control = 'rounded-lg border border-subtle bg-surface p-2 text-sm text-main min-w-0 max-w-full';
export function PlannerScheduleFields({ value, onChange, lists }: { value: StudyTaskInput; onChange: (patch: Partial<StudyTaskInput>) => void; lists: TaskList[] }) {
  const { t, lang } = useWorkspace();
  const date = (offset: number) => civilDate(addCivilDays(new Date(), offset));
  const weekday = (offset: number) => new Intl.DateTimeFormat(lang, { weekday: 'long' }).format(addCivilDays(new Date(), offset));
  const remind = (offset: number) => {
    const next = offset === 0 ? new Date(new Date().getTime() + 60 * 60_000) : addCivilDays(new Date(), offset);
    if (offset !== 0) next.setHours(9, 0, 0, 0);
    return localDateTime(next);
  };
  const recurrence = value.recurrence;
  const updateRepeat = (patch: Partial<TaskRecurrence>) => onChange({ recurrence: { ...recurrence!, ...patch } });
  return <div className="flex flex-wrap items-start gap-2" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.querySelectorAll('details[open]').forEach(item => item.removeAttribute('open')); event.stopPropagation(); } }}>
    <details className={control} data-planner-list-menu><summary className="cursor-pointer flex gap-1 items-center"><List size={16} />{t('plannerList')}</summary>
      <label className="block mt-2">{t('plannerList')}<select data-planner-list className={`${control} block w-full`} value={value.listId || DEFAULT_TASK_LIST} onChange={event => onChange({ listId: event.target.value })}>{lists.map(list => <option key={list.id} value={list.id}>{list.icon} {list.id === DEFAULT_TASK_LIST && list.name === 'Tasks' ? t('plannerTasks') : list.name}</option>)}</select></label>
    </details>
    <details className={control} data-planner-due-menu><summary className="cursor-pointer flex gap-1 items-center"><CalendarDays size={16} />{t('plannerDue')}</summary>
      <div className="flex flex-col gap-1 mt-2">{[0, 1, 7].map((offset, index) => <button type="button" key={offset} className="text-start p-1 hover:bg-surface-hover" onClick={event => { onChange({ dueDate: date(offset) }); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{t(index === 0 ? 'plannerToday' : index === 1 ? 'plannerTomorrow' : 'plannerNextWeek')} · {weekday(offset)}</button>)}
        <label>{t('plannerPickDate')}<input data-planner-due type="date" min="1900-01-01" max="2200-12-31" className={`${control} block w-full`} value={value.dueDate || ''} onChange={event => onChange({ dueDate: event.target.value || null })} /></label>
      </div>
    </details>
    <details className={control} data-planner-reminder-menu><summary className="cursor-pointer flex gap-1 items-center"><Bell size={16} />{t('plannerReminder')}</summary>
      <div className="flex flex-col gap-1 mt-2">{[0, 1, 7].map((offset, index) => <button key={offset} type="button" className="text-start p-1 hover:bg-surface-hover" onClick={event => { onChange({ reminderAt: remind(offset) }); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{t(index === 0 ? 'plannerLaterToday' : index === 1 ? 'plannerTomorrowNine' : 'plannerNextWeekNine')}</button>)}
        <label>{t('plannerPickDateTime')}<input data-planner-reminder type="datetime-local" min="1900-01-01T00:00" max="2200-12-31T23:59" className={`${control} block w-full`} value={value.reminderAt || ''} onChange={event => onChange({ reminderAt: event.target.value || null })} /></label>
        <button type="button" className="text-start p-1 underline" onClick={() => onChange({ reminderAt: null })}>{t('plannerNoReminder')}</button>
      </div>
    </details>
    <details className={control} data-planner-repeat-menu><summary className="cursor-pointer flex gap-1 items-center"><Repeat size={16} />{t('plannerRepeat')}</summary>
      <label className="block mt-2">{t('plannerRepeat')}<select data-planner-repeat className={`${control} block w-full`} value={recurrence?.kind || ''} onChange={event => onChange({ recurrence: event.target.value ? { kind: event.target.value as TaskRecurrence['kind'], ...(event.target.value === 'custom' ? { interval: 1, unit: 'days' as const } : {}) } : null })}>
        <option value="">{t('plannerNeverRepeat')}</option>{(['daily', 'weekdays', 'weekly', 'monthly', 'yearly', 'custom'] as const).map(kind => <option key={kind} value={kind}>{t(({ daily: 'plannerDaily', weekdays: 'plannerWeekdays', weekly: 'plannerWeekly', monthly: 'plannerMonthly', yearly: 'plannerYearly', custom: 'plannerCustom' } as const)[kind])}</option>)}
      </select></label>
      {recurrence?.kind === 'custom' && <div className="space-y-2 mt-2">
        <label className="block">{t('plannerEvery')}<input type="number" min={1} max={365} className={`${control} w-20 ms-2`} value={recurrence.interval} onChange={event => updateRepeat({ interval: Number(event.target.value) })} /></label>
        <select aria-label={t('plannerRepeatUnit')} className={control} value={recurrence.unit} onChange={event => updateRepeat({ unit: event.target.value as TaskRecurrence['unit'] })}><option value="days">{t('plannerDays')}</option><option value="weeks">{t('plannerWeeks')}</option><option value="months">{t('plannerMonths')}</option></select>
        {recurrence.unit === 'weeks' && <div className="flex flex-wrap gap-2">{Array.from({ length: 7 }, (_, day) => <label key={day}><input type="checkbox" checked={recurrence.weekdays?.includes(day) ?? false} onChange={event => updateRepeat({ weekdays: event.target.checked ? [...recurrence.weekdays ?? [], day] : recurrence.weekdays?.filter(value => value !== day) })} /> {new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(new Date(2024, 0, 7 + day))}</label>)}</div>}
      </div>}
    </details>
  </div>;
}
