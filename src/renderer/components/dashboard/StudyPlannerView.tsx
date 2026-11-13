'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CalendarDays, ChevronDown, Circle, List, MoreHorizontal, Plus, Repeat, Sun, X } from 'lucide-react';
import { FeedbackSkeleton } from '../ui/FeedbackSkeleton';
import { useToast } from '../ui/Toast';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { StudyLinkPicker } from '../notes/StudyLinkPicker';
import { matchesStudyQuery, studyLinks } from '../../../shared/study-notes';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';
import { taskCountLabel } from '../../utils/task-count';
import { addCivilDays, civilDate, inferTaskSubject, referenceTaskSubject, plannerReferenceTarget, DEFAULT_TASK_LIST, type StudyTask, type StudyTaskInput, type TaskList } from '../../../shared/study-planner';
import { PlannerCalendar } from './PlannerCalendar';
import { PlannerScheduleFields } from './PlannerScheduleFields';

const control = 'rounded-lg border border-subtle bg-surface p-2 text-sm text-main min-w-0 max-w-full';
const GROUPS_KEY = 'planner.groups.v1';
const emptyTask = (listId = DEFAULT_TASK_LIST): StudyTaskInput => ({ title: '', description: '', status: 'open', startDate: null, dueDate: civilDate(new Date()), priority: 0, sortOrder: 0, references: [], listId, subject: '', reminderAt: null, recurrence: null });
type Management = { kind: 'list' | 'group'; original?: string; id?: string; name: string; icon: string; groupName: string; sortOrder: number };

export function StudyPlannerView({ adjustment = 0 }: { adjustment?: number }) {
  const { t, lang, dir, books, openBookForReading } = useWorkspace();
  const { notes } = useStudyNotes();
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [active, setActive] = useState('all');
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [draft, setDraft] = useState<StudyTaskInput>(() => emptyTask());
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [details, setDetails] = useState<StudyTaskInput | null>(null);
  const [management, setManagement] = useState<Management | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [hijri, setHijri] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const quickInput = useRef<HTMLInputElement>(null);
  const descriptionInput = useRef<HTMLTextAreaElement>(null);
  const calendarDialog = useRef<HTMLDialogElement>(null);
  const managementDialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const reload = useCallback(async () => {
    const api = window.electronAPI?.planner;
    if (!api) throw new Error('missing-api');
    const [rows, taskLists] = await Promise.all([api.list(), api.lists()]);
    setTasks(rows); setLists(taskLists);
    return rows;
  }, []);
  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(reload).then(async () => {
      const names = await window.electronAPI.settings.get(GROUPS_KEY);
      if (alive && Array.isArray(names)) setGroups(names.filter((name): name is string => typeof name === 'string'));
    }).catch(() => { if (alive) setError(true); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [reload]);
  useEffect(() => {
    if (calendarOpen) calendarDialog.current?.showModal();
    else calendarDialog.current?.close();
  }, [calendarOpen]);
  useEffect(() => {
    if (management) managementDialog.current?.showModal();
    else managementDialog.current?.close();
  }, [management]);
  const edit = useCallback((task: StudyTask) => setDetails({ ...task, expectedUpdatedAt: task.updatedAt }), []);
  useEffect(() => {
    const newTask = () => { setDraft(emptyTask(lists.some(list => list.id === active) ? active : DEFAULT_TASK_LIST)); setDescriptionOpen(false); quickInput.current?.focus(); };
    const openTask = async () => {
      const id = sessionStorage.getItem('baglib.planner.open-task');
      if (!id) return;
      sessionStorage.removeItem('baglib.planner.open-task');
      try {
        const task = (await reload()).find(item => item.id === id);
        if (task) { setActive('all'); setSearch(''); setSubject(''); edit(task); } else setError(true);
      } catch { setError(true); }
    };
    void openTask();
    window.addEventListener('baglib:new-task', newTask);
    window.addEventListener('baglib:open-task', openTask);
    return () => { window.removeEventListener('baglib:new-task', newTask); window.removeEventListener('baglib:open-task', openTask); };
  }, [active, lists, edit, reload]);
  const perform = async (operation: () => Promise<unknown>) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(false);
    try { await operation(); await reload(); } catch { setError(true); }
    finally { saving.current = false; setBusy(false); }
  };
  const subjects = useMemo(() => [...new Set([...tasks.map(task => task.subject || ''), ...books.flatMap(book => book.categories || [])].filter(Boolean))], [tasks, books]);
  const scoped = tasks.filter(task => matchesStudyQuery(`${task.title} ${task.description} ${task.subject || ''}`, search)
    && (!subject || task.subject === subject)
    && (active === 'all' || active === 'today' && task.dueDate === civilDate(new Date()) || task.listId === active));
  const visible = [...scoped].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  const groupNames = [...new Set([...groups, ...lists.map(list => list.groupName).filter((name): name is string => !!name)])];
  const selectedList = lists.find(list => list.id === active);
  const listName = (list: TaskList) => list.id === DEFAULT_TASK_LIST && list.name === 'Tasks' ? t('plannerTasks') : list.name;
  const heading = active === 'all' ? t('plannerAll') : active === 'today' ? t('plannerMyDay') : selectedList ? listName(selectedList) : t('plannerTasks');
  const dateLabel = new Intl.DateTimeFormat(lang, { calendar: hijri ? 'islamic-umalqura' : 'gregory', dateStyle: 'full' }).format(hijri ? addCivilDays(new Date(), adjustment) : new Date());
  const saveQuick = () => perform(async () => {
    await window.electronAPI.planner.save(draft);
    setDraft(emptyTask(draft.listId)); setDescriptionOpen(false); quickInput.current?.focus();
  });
  const persistGroups = async (names: string[]) => { await window.electronAPI.settings.set(GROUPS_KEY, names); setGroups(names); };
  const saveManagement = () => perform(async () => {
    if (!management) return;
    const name = management.name.trim();
    if (management.kind === 'group') {
      if (management.original) await window.electronAPI.planner.renameGroup(management.original, name);
      const next = groups.filter(value => value !== management.original && value !== name);
      next.splice(Math.max(0, management.sortOrder), 0, name);
      await persistGroups(next);
    } else {
      const previous = lists.find(list => list.id === management.id);
      await window.electronAPI.planner.saveList({ name, icon: management.icon || null, groupName: management.groupName || null, sortOrder: management.sortOrder, ...(previous ? { id: previous.id, expectedUpdatedAt: previous.updatedAt } : {}) });
    }
    setManagement(null);
  });
  const deleteManagement = () => {
    if (!management || !window.confirm(t(management.kind === 'group' ? 'plannerDeleteGroupConfirm' : 'plannerDeleteListConfirm'))) return;
    void perform(async () => {
      if (management.kind === 'group') {
        await window.electronAPI.planner.renameGroup(management.original!, null);
        await persistGroups(groups.filter(name => name !== management.original));
      } else {
        const list = lists.find(item => item.id === management.id)!;
        await window.electronAPI.planner.removeList(list.id, list.updatedAt);
        if (active === list.id) setActive(DEFAULT_TASK_LIST);
        setDetails(null);
      }
      setManagement(null);
    });
  };
  const openReference = async (target: string) => {
    try { await navigateStudyReference(target, books, openBookForReading, (id, anchor) => openStudyNote({ id, anchor })); }
    catch { setError(true); }
  };
  const listButton = (list: TaskList) => <button key={list.id} data-planner-list-id={list.id} aria-pressed={active === list.id} className={`w-full text-start px-3 py-2 rounded-lg flex gap-2 items-start ${active === list.id ? 'bg-pale-sky-500/15 text-pale-sky-500' : 'hover:bg-surface-hover'}`} onClick={() => { setActive(list.id); setDraft(previous => ({ ...previous, listId: list.id })); }}><span aria-hidden="true">{list.icon || <List size={16} />}</span><span className="break-words min-w-0 flex-1" dir="auto">{listName(list)}</span><span className="text-xs text-muted">{new Intl.NumberFormat(lang).format(tasks.filter(task => task.listId === list.id && task.status === 'open').length)}</span></button>;
  return <section data-study-planner dir={dir} className="flex-1 min-h-0 overflow-auto p-3 sm:p-5 text-main">
    {error && <div role="alert" className="p-3 border border-red-500 rounded-lg mb-3">{t('plannerError')} <button className="underline" onClick={() => void perform(reload)}>{t('plannerReload')}</button></div>}
    {loading && <FeedbackSkeleton />}
    {tasks.length >= 5000 && <p role="status">{t('plannerLimit')}</p>}
    <div className={`grid gap-4 min-w-0 ${details ? 'lg:grid-cols-[11rem_minmax(0,1fr)_16rem]' : 'lg:grid-cols-[13rem_minmax(0,1fr)]'}`}>
      <aside data-planner-start className="min-w-0 bg-surface p-2 space-y-1 self-start">
        <label className="block text-sm p-1">{t('plannerSearch')}<input type="search" className={`${control} block w-full mt-1`} value={search} onChange={event => setSearch(event.target.value)} /></label>
        <button data-planner-my-day className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-start text-sm hover:bg-surface-hover" aria-pressed={active === 'today'} onClick={() => setActive('today')}><Sun size={16} /><span className="flex-1">{t('plannerMyDay')}</span><span className="text-xs text-muted">{new Intl.NumberFormat(lang).format(tasks.filter(task => task.dueDate === civilDate(new Date()) && task.status === 'open').length)}</span></button>
        <button data-planner-all className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-start text-sm hover:bg-surface-hover" aria-pressed={active === 'all'} onClick={() => setActive('all')}><List size={16} /><span className="flex-1">{t('plannerAll')}</span><span className="text-xs text-muted" aria-label={taskCountLabel(tasks.filter(task => task.status === 'open').length, lang, t)}>{new Intl.NumberFormat(lang).format(tasks.filter(task => task.status === 'open').length)}</span></button>
        {lists.filter(list => !list.groupName).map(listButton)}
        {groupNames.map(group => <div key={group} className="border-t border-subtle pt-1">
          <div className="flex items-start gap-1"><button aria-expanded={!collapsed.includes(group)} className="flex-1 min-w-0 text-start p-2 flex gap-1 items-center" onClick={() => setCollapsed(previous => previous.includes(group) ? previous.filter(name => name !== group) : [...previous, group])}><ChevronDown size={14} className={`shrink-0 ${collapsed.includes(group) ? '-rotate-90 rtl:rotate-90' : ''}`} /><span dir="auto" className="break-words">{group}</span></button><button data-planner-group-edit={group} aria-label={t('plannerEditGroup')} className="p-2" onClick={() => setManagement({ kind: 'group', original: group, name: group, icon: '', groupName: '', sortOrder: groupNames.indexOf(group) })}><MoreHorizontal size={14} /></button></div>
          {!collapsed.includes(group) && lists.filter(list => list.groupName === group).map(listButton)}
        </div>)}
        <label className="block text-sm p-1">{t('plannerSubject')}<select data-planner-subject-filter className={`${control} block w-full mt-1`} value={subject} onChange={event => setSubject(event.target.value)}><option value="">{t('plannerAllSubjects')}</option>{subjects.map(name => <option key={name}>{name}</option>)}</select></label>
        {selectedList && <button data-planner-edit-list className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-start text-sm hover:bg-surface-hover" onClick={() => setManagement({ kind: 'list', id: selectedList.id, name: selectedList.name, icon: selectedList.icon || '', groupName: selectedList.groupName || '', sortOrder: selectedList.sortOrder })}>{t('plannerEditList')}</button>}
        <button data-planner-new-list className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-start text-sm hover:bg-surface-hover" onClick={() => setManagement({ kind: 'list', name: '', icon: '', groupName: '', sortOrder: lists.length })}><Plus size={14} className="inline" /> {t('plannerNewList')}</button>
        <button data-planner-new-group className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-start text-sm hover:bg-surface-hover" onClick={() => setManagement({ kind: 'group', name: '', icon: '', groupName: '', sortOrder: groupNames.length })}>{t('plannerNewGroup')}</button>
      </aside>
      <main data-planner-centre className="min-w-0 flex flex-col gap-3">
        <header className="flex items-start justify-between gap-2"><div className="min-w-0"><h1 className="text-xl font-bold break-words" dir="auto">{heading}</h1><p className="text-sm leading-relaxed text-muted">{dateLabel}</p><label className="text-xs"><input type="checkbox" checked={hijri} onChange={event => setHijri(event.target.checked)} /> {t('plannerHijri')}</label></div><button data-planner-calendar-open className={control} aria-label={t('plannerCalendar')} onClick={() => setCalendarOpen(true)}><CalendarDays size={18} /></button></header>
        <div className="space-y-2 flex-1 min-w-0">
          {!visible.length && !loading && <div className="p-4 space-y-2"><p>{t('plannerEmpty')}</p><button className={control} onClick={() => { setSearch(''); setSubject(''); quickInput.current?.focus(); }}>{t(search || subject ? 'clearAllFilters' : 'plannerNew')}</button></div>}
          {visible.map((task, index) => <article key={task.id} data-planner-task data-task-id={task.id} className={`rounded-xl border bg-surface p-3 space-y-2 ${details?.id === task.id ? 'border-pale-sky-500' : 'border-subtle'}`}>
            <div className="flex items-start gap-2"><input type="checkbox" aria-label={t('plannerCompleted')} className="mt-1 size-4 appearance-none rounded-full border border-subtle checked:bg-pale-sky-500 checked:border-pale-sky-500 focus-visible:outline-2 shrink-0" disabled={busy} checked={task.status === 'completed'} onChange={() => void perform(async () => { const saved = await window.electronAPI.planner.save({ ...task, status: task.status === 'completed' ? 'open' : 'completed', expectedUpdatedAt: task.updatedAt }); if (details?.id === saved.id) edit(saved); })} /><button className={`text-start min-w-0 flex-1 break-words leading-relaxed ${task.status === 'completed' ? 'line-through text-muted' : ''}`} dir="auto" onClick={() => edit(task)}>{task.title}</button></div>
            <div className="flex flex-wrap gap-2 text-xs text-muted items-center">{task.dueDate && <time dateTime={task.dueDate} className="rounded-md bg-pale-sky-500/10 px-2 py-1">{new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(task.dueDate + 'T12:00:00'))}</time>}{task.recurrence && <Repeat size={14} aria-label={t('plannerRepeat')} />}{task.reminderAt && <Bell size={14} aria-label={t('plannerReminder')} />}{task.subject && <span dir="auto">{task.subject}</span>}</div>
            {task.description && <p className="text-sm whitespace-pre-wrap break-words" dir="auto">{task.description}</p>}
            <div className="flex flex-wrap gap-2">{task.references.map((reference, position) => <button key={`${reference.target}-${position}`} className="underline text-sm break-all" dir="auto" onClick={() => void openReference(plannerReferenceTarget(reference))}>{reference.label}{reference.scope === 'surah' && ` (${t('plannerWholeSurah')})`}</button>)}</div>
            <div className="flex gap-3 text-xs"><button data-planner-edit className="underline" onClick={() => edit(task)}>{t('plannerEdit')}</button><button disabled={busy || index === 0} className="underline disabled:opacity-40" onClick={() => void perform(() => window.electronAPI.planner.save({ ...task, sortOrder: visible[index - 1].sortOrder - 1, expectedUpdatedAt: task.updatedAt }))}>{t('plannerMoveEarlier')}</button></div>
          </article>)}
        </div>
        <form data-planner-quick-add className="sticky bottom-0 z-10 rounded-xl border border-subtle bg-surface px-2 py-1 shadow-lg space-y-1" onSubmit={event => { event.preventDefault(); void saveQuick(); }}>
          <fieldset disabled={busy || loading} className="space-y-2 min-w-0">
            <div data-planner-quick-row className="flex min-h-12 gap-1 items-center">{draft.title ? <Circle size={18} className="shrink-0" /> : <Plus size={18} className="shrink-0" />}<input ref={quickInput} data-planner-quick-title type="text" required maxLength={300} dir="auto" aria-label={t('plannerTaskTitle')} placeholder={t('plannerAddTask')} className="min-w-0 flex-1 bg-transparent p-2 leading-relaxed outline-none" value={draft.title} onChange={event => setDraft(previous => ({ ...previous, title: event.target.value, subject: inferTaskSubject(event.target.value, subjects) }))} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); if (event.ctrlKey) { setDescriptionOpen(true); requestAnimationFrame(() => descriptionInput.current?.focus()); } else if (draft.title.trim()) void saveQuick(); } }} />{!!draft.title && <PlannerScheduleFields value={draft} lists={lists} onChange={patch => setDraft(previous => ({ ...previous, ...patch }))} />}</div>
            {descriptionOpen && <label className="block text-sm ps-7 border-s-2 border-subtle">{t('plannerDescription')}<textarea ref={descriptionInput} data-planner-quick-description dir="auto" maxLength={20000} rows={2} className={`${control} block w-full mt-1`} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (draft.title.trim()) void saveQuick(); } }} /></label>}
            {!!draft.title && <><p className="text-xs text-muted leading-relaxed">{t('plannerQuickHint')}{draft.subject && <span dir="auto"> · {draft.subject}</span>}</p></>}
          </fieldset>
        </form>
      </main>
      {details && <aside data-planner-details className="min-w-0 self-start rounded-xl border border-subtle bg-surface p-3 space-y-3">
        <div className="flex justify-between items-center"><h2 className="font-bold">{t('plannerEdit')}</h2><button aria-label={t('plannerClose')} className={control} onClick={() => setDetails(null)}><X size={16} /></button></div>
        <form onSubmit={event => { event.preventDefault(); void perform(async () => { edit(await window.electronAPI.planner.save(details)); showToast({ message: t('plannerSaved') }); }); }}>
          <fieldset disabled={busy} className="space-y-3 min-w-0">
            <label className="block text-sm">{t('plannerTaskTitle')}<input data-planner-detail-title type="text" dir="auto" required maxLength={300} className={`${control} block w-full`} value={details.title} onChange={event => setDetails({ ...details, title: event.target.value })} /></label>
            <label className="block text-sm">{t('plannerDescription')}<textarea data-planner-detail-description dir="auto" rows={3} maxLength={20000} className={`${control} block w-full`} value={details.description} onChange={event => setDetails({ ...details, description: event.target.value })} /></label>
            <label className="block text-sm">{t('plannerSubject')}<input data-planner-detail-subject type="text" list="planner-subjects" dir="auto" maxLength={300} className={`${control} block w-full`} value={details.subject || ''} onChange={event => setDetails({ ...details, subject: event.target.value })} /></label>
            <datalist id="planner-subjects">{subjects.map(name => <option key={name} value={name} />)}</datalist>
            <label className="block text-sm">{t('plannerStart')}<input type="date" min="1900-01-01" max="2200-12-31" className={`${control} block w-full`} value={details.startDate || ''} onChange={event => setDetails({ ...details, startDate: event.target.value || null })} /></label>
            <p className="text-xs text-muted leading-relaxed">{t('plannerDateHint')}</p>
            <PlannerScheduleFields value={details} lists={lists} onChange={patch => setDetails(previous => previous ? { ...previous, ...patch } : null)} />
            <label className="block text-sm">{t('plannerDue')}<input data-planner-detail-due type="date" min="1900-01-01" max="2200-12-31" className={`${control} block w-full`} value={details.dueDate || ''} onChange={event => setDetails({ ...details, dueDate: event.target.value || null })} /></label>
            <label className="block text-sm">{t('plannerReminder')}<input data-planner-detail-reminder type="datetime-local" min="1900-01-01T00:00" max="2200-12-31T23:59" className={`${control} block w-full`} value={details.reminderAt || ''} onChange={event => setDetails({ ...details, reminderAt: event.target.value || null })} /></label>
            <label className="block text-sm">{t('plannerPriority')}<select className={`${control} block w-full`} value={details.priority} onChange={event => setDetails({ ...details, priority: Number(event.target.value) })}>{[0, 1, 2, 3].map(value => <option key={value} value={value}>{t(value === 0 ? 'plannerNormal' : value === 1 ? 'plannerLow' : value === 2 ? 'plannerHigh' : 'plannerUrgent')}</option>)}</select></label>
            <label className="block text-sm">{t('plannerStatus')}<select className={`${control} block w-full`} value={details.status} onChange={event => setDetails({ ...details, status: event.target.value as StudyTask['status'] })}><option value="open">{t('plannerOpen')}</option><option value="completed">{t('plannerCompleted')}</option><option value="cancelled">{t('plannerCancelled')}</option></select></label>
            <p className="text-sm">{t('plannerLinks')}</p><StudyLinkPicker notes={notes} onInsert={text => {
              const links = studyLinks(text);
              const inferred = links.map(link => referenceTaskSubject(link.target, books, { quran: t('plannerQuranSubject'), sunnah: t('plannerSunnahSubject'), poetry: t('plannerPoetrySubject') })).find(Boolean);
              setDetails(previous => previous ? { ...previous, subject: previous.subject || inferred || '', references: [...previous.references, ...links.map(link => ({ target: link.target, label: link.label }))].slice(0, 20) } : null);
            }} />
            {details.references.map((reference, index) => <div key={`${reference.target}-${index}`} className="flex gap-2 flex-wrap text-sm min-w-0"><span dir="auto" className="break-all flex-1">{reference.label}</span>{reference.target.startsWith('quran:') && <label><input type="checkbox" checked={reference.scope === 'surah'} onChange={event => setDetails({ ...details, references: details.references.map((item, position) => position === index ? { target: item.target, label: item.label, ...(event.target.checked ? { scope: 'surah' as const } : {}) } : item) })} /> {t('plannerWholeSurah')}</label>}<button type="button" className="underline" onClick={() => setDetails({ ...details, references: details.references.filter((_, position) => index !== position) })}>{t('plannerRemoveLink')}</button></div>)}
            <button data-planner-detail-save type="submit" className={`${control} w-full bg-pale-sky-500 text-white`}>{t('plannerSave')}</button>
            <button type="button" className={`${control} w-full text-red-500`} onClick={() => { if (window.confirm(t('plannerDeleteConfirm'))) void perform(async () => { await window.electronAPI.planner.remove(details.id!, details.expectedUpdatedAt!); setDetails(null); showToast({ message: t('feedbackRemoved') }); }); }}>{t('plannerDelete')}</button>
          </fieldset>
        </form>
      </aside>}
    </div>
    <dialog ref={calendarDialog} data-planner-calendar-dialog dir={dir} onCancel={() => setCalendarOpen(false)} onClose={event => { if (!event.currentTarget.open) setCalendarOpen(false); }} className="m-auto w-[min(64rem,calc(100vw-1rem))] max-h-[90vh] overflow-auto rounded-xl border border-subtle bg-surface p-3 text-main backdrop:bg-black/50">
      <div className="flex justify-between items-center mb-3"><h2 className="font-bold">{t('plannerCalendar')}{subject && <span dir="auto"> · {subject}</span>}</h2><button data-planner-calendar-close className={control} aria-label={t('plannerClose')} onClick={() => setCalendarOpen(false)}><X size={18} /></button></div>
      {calendarOpen && <PlannerCalendar tasks={scoped} adjustment={adjustment} onSelectTask={task => { edit(task); setCalendarOpen(false); }} onPickDate={date => { setDraft(previous => ({ ...previous, dueDate: date })); setCalendarOpen(false); quickInput.current?.focus(); }} />}
    </dialog>
    <dialog ref={managementDialog} dir={dir} onCancel={() => setManagement(null)} className="m-auto w-[min(26rem,calc(100vw-1rem))] max-h-[90vh] overflow-auto rounded-xl border border-subtle bg-surface p-4 text-main backdrop:bg-black/50">
      {management && <form data-planner-management onSubmit={event => { event.preventDefault(); void saveManagement(); }} className="space-y-3">
        <h2 className="font-bold">{t(management.kind === 'group' ? 'plannerEditGroup' : 'plannerEditList')}</h2>
        <label className="block">{t('plannerName')}<input data-planner-management-name autoFocus required maxLength={100} dir="auto" className={`${control} block w-full`} value={management.name} onChange={event => setManagement({ ...management, name: event.target.value })} /></label>
        {management.kind === 'list' && <><label className="block">{t('plannerIcon')}<input maxLength={100} dir="auto" className={`${control} block w-full`} value={management.icon} onChange={event => setManagement({ ...management, icon: event.target.value })} /></label><label className="block">{t('plannerGroup')}<select data-planner-management-group className={`${control} block w-full`} value={management.groupName} onChange={event => setManagement({ ...management, groupName: event.target.value })}><option value="">{t('plannerNoGroup')}</option>{groupNames.map(name => <option key={name}>{name}</option>)}</select></label></>}
        <label className="block">{t('plannerOrder')}<input data-planner-management-order type="number" step={1} min={0} required className={`${control} block w-full`} value={management.sortOrder} onChange={event => setManagement({ ...management, sortOrder: Number(event.target.value) })} /></label>
        <div className="flex flex-wrap gap-2"><button data-planner-management-save disabled={busy} className={control}>{t('plannerSave')}</button><button type="button" className={control} onClick={() => setManagement(null)}>{t('plannerClose')}</button>{(management.original || management.id && management.id !== DEFAULT_TASK_LIST) && <button data-planner-management-delete type="button" disabled={busy} className={`${control} text-red-500`} onClick={deleteManagement}>{t('plannerDelete')}</button>}</div>
      </form>}
    </dialog>
  </section>;
}
