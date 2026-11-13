import { calculateHijriDate } from './athan-calculator';
import { matchesStudyQuery, parseBookTarget, validStudyTarget } from './study-notes';

export type PlannerCalendar = 'gregorian' | 'hijri';
export type PlannerPeriod = 'week' | 'month' | 'year';
export interface PlannerReference { target: string; label: string; scope?: 'surah' }
export function plannerReferenceTarget(reference: PlannerReference): string {
  return reference.scope === 'surah' && reference.target.startsWith('quran:') ? reference.target.replace(/:\d+(?:-\d+)?$/u, ':1') : reference.target;
}
export const DEFAULT_TASK_LIST = 'tasks';
export interface TaskList {
  id: string;
  name: string;
  icon: string | null;
  groupName: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
export type TaskListInput = Pick<TaskList, 'name' | 'icon' | 'groupName' | 'sortOrder'> & { id?: string; expectedUpdatedAt?: string };
export interface TaskRecurrence {
  kind: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  interval?: number;
  unit?: 'days' | 'weeks' | 'months';
  weekdays?: number[];
  anchorDay?: number;
  anchorMonth?: number;
}
export interface StudyTask {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'completed' | 'cancelled';
  startDate: string | null;
  dueDate: string | null;
  priority: number;
  sortOrder: number;
  references: PlannerReference[];
  listId?: string;
  recurrence?: TaskRecurrence | null;
  reminderAt?: string | null;
  subject?: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export type StudyTaskInput = Pick<StudyTask, 'title' | 'description' | 'status' | 'startDate' | 'dueDate' | 'priority' | 'sortOrder' | 'references'> & Partial<Pick<StudyTask, 'listId' | 'recurrence' | 'reminderAt' | 'subject'>> & { id?: string; expectedUpdatedAt?: string };
export interface PlannerAPI {
  list(): Promise<StudyTask[]>;
  lists(): Promise<TaskList[]>;
  saveList(input: TaskListInput): Promise<TaskList>;
  removeList(id: string, expectedUpdatedAt: string): Promise<void>;
  renameGroup(name: string, nextName: string | null): Promise<void>;
  save(input: StudyTaskInput): Promise<StudyTask>;
  remove(id: string, expectedUpdatedAt: string): Promise<void>;
}

export function civilDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseCivilDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error('invalid-request');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  if (year < 1900 || year > 2200 || civilDate(date) !== value) throw new Error('invalid-request');
  return date;
}

export function addCivilDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  next.setDate(next.getDate() + days);
  return next;
}

export function calendarParts(date: Date, calendar: PlannerCalendar, adjustment = 0): { year: number; month: number; day: number } {
  if (calendar === 'hijri') {
    const parts = calculateHijriDate(date, adjustment);
    return { year: parts.year, month: parts.month, day: parts.day };
  }
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

export function plannerRange(anchor: Date, period: PlannerPeriod, calendar: PlannerCalendar, adjustment = 0): { start: Date; end: Date } {
  let start = addCivilDays(anchor, 0);
  let end = addCivilDays(anchor, 0);
  if (period === 'week') {
    start = addCivilDays(start, -((start.getDay() + 1) % 7));
    return { start, end: addCivilDays(start, 6) };
  }
  const selected = calendarParts(anchor, calendar, adjustment);
  const same = (date: Date) => {
    const candidate = calendarParts(date, calendar, adjustment);
    return candidate.year === selected.year && (period === 'year' || candidate.month === selected.month);
  };
  for (let count = 0; count < 370 && same(addCivilDays(start, -1)); count++) start = addCivilDays(start, -1);
  for (let count = 0; count < 370 && same(addCivilDays(end, 1)); count++) end = addCivilDays(end, 1);
  return { start, end };
}

export function validateTask(input: unknown): StudyTaskInput {
  if (!input || typeof input !== 'object') throw new Error('invalid-request');
  const value = input as Record<string, unknown>;
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 300 || typeof value.description !== 'string' || value.description.length > 20000) throw new Error('invalid-request');
  if (!['open', 'completed', 'cancelled'].includes(String(value.status)) || !Number.isInteger(value.priority) || Number(value.priority) < 0 || Number(value.priority) > 3 || !Number.isSafeInteger(value.sortOrder)) throw new Error('invalid-request');
  for (const field of ['startDate', 'dueDate']) {
    if (value[field] !== null) {
      if (typeof value[field] !== 'string') throw new Error('invalid-request');
      parseCivilDate(value[field] as string);
    }
  }
  if (value.startDate && value.dueDate && String(value.startDate) > String(value.dueDate)) throw new Error('invalid-request');
  if (!Array.isArray(value.references) || value.references.length > 20) throw new Error('invalid-request');
  const references = value.references.map((reference: unknown): PlannerReference => {
    if (!reference || typeof reference !== 'object') throw new Error('invalid-request');
    const item = reference as Record<string, unknown>;
    if (typeof item.target !== 'string' || !validStudyTarget(item.target) || typeof item.label !== 'string' || item.label.length > 300 || (item.scope !== undefined && (item.scope !== 'surah' || !item.target.startsWith('quran:')))) throw new Error('invalid-request');
    return { target: item.target, label: item.label, ...(item.scope === 'surah' ? { scope: 'surah' as const } : {}) };
  });
  if (value.id !== undefined && (typeof value.id !== 'string' || !value.id || value.id.length > 100 || typeof value.expectedUpdatedAt !== 'string')) throw new Error('invalid-request');
  if (value.listId !== undefined && (typeof value.listId !== 'string' || !value.listId || value.listId.length > 100)) throw new Error('invalid-request');
  if (value.subject !== undefined && (typeof value.subject !== 'string' || value.subject.length > 300)) throw new Error('invalid-request');
  if (value.reminderAt !== undefined && value.reminderAt !== null) parseLocalDateTime(value.reminderAt);
  if (value.recurrence !== undefined && value.recurrence !== null) validateRecurrence(value.recurrence);
  return { ...value, title: value.title.trim(), references } as StudyTaskInput;
}


export function parseLocalDateTime(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/u.test(value)) throw new Error('invalid-request');
  parseCivilDate(value.slice(0, 10));
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || localDateTime(date) !== value) throw new Error('invalid-request');
  return date;
}

export function localDateTime(date: Date): string {
  return `${civilDate(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function validateRecurrence(raw: unknown): TaskRecurrence {
  if (!raw || typeof raw !== 'object') throw new Error('invalid-request');
  const value = raw as TaskRecurrence;
  if (!['daily', 'weekdays', 'weekly', 'monthly', 'yearly', 'custom'].includes(value.kind)) throw new Error('invalid-request');
  if (value.kind === 'custom' && (!Number.isInteger(value.interval) || value.interval! < 1 || value.interval! > 365 || !['days', 'weeks', 'months'].includes(value.unit!))) throw new Error('invalid-request');
  if (value.weekdays !== undefined && (!Array.isArray(value.weekdays) || value.weekdays.length > 7 || value.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6))) throw new Error('invalid-request');
  if (value.anchorDay !== undefined && (!Number.isInteger(value.anchorDay) || value.anchorDay < 1 || value.anchorDay > 31)) throw new Error('invalid-request');
  if (value.anchorMonth !== undefined && (!Number.isInteger(value.anchorMonth) || value.anchorMonth < 0 || value.anchorMonth > 11)) throw new Error('invalid-request');
  return value;
}

/** Uses civil arithmetic, preserving the intended month day across short months. */
export function nextTaskDate(value: string, raw: TaskRecurrence): string {
  const repeat = validateRecurrence(raw);
  const date = parseCivilDate(value);
  if (repeat.kind === 'monthly' || repeat.kind === 'yearly' || repeat.kind === 'custom' && repeat.unit === 'months') {
    const months = repeat.kind === 'yearly' ? 12 : repeat.kind === 'custom' ? repeat.interval! : 1;
    const next = new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
    if (repeat.kind === 'yearly' && repeat.anchorMonth !== undefined) next.setMonth(repeat.anchorMonth);
    const last = new Date(next.getFullYear(), next.getMonth() + 1, 0, 12).getDate();
    next.setDate(Math.min(repeat.anchorDay ?? date.getDate(), last));
    return civilDate(next);
  }
  const interval = repeat.kind === 'weekly' ? 7 : repeat.kind === 'custom' ? repeat.interval! * (repeat.unit === 'weeks' ? 7 : 1) : 1;
  if (repeat.kind === 'weekdays') {
    let next = addCivilDays(date, 1);
    while (next.getDay() === 0 || next.getDay() === 6) next = addCivilDays(next, 1);
    return civilDate(next);
  }
  if (repeat.kind === 'custom' && repeat.unit === 'weeks' && repeat.weekdays?.length) {
    // Weeks are Monday-based. Chosen days in the current active week precede the next interval week.
    const origin = (date.getDay() + 6) % 7;
    for (let offset = 1; offset <= interval + 7; offset++) {
      const next = addCivilDays(date, offset);
      const weeks = Math.floor((origin + offset) / 7);
      if (weeks % repeat.interval! === 0 && repeat.weekdays.includes(next.getDay())) return civilDate(next);
    }
  }
  return civilDate(addCivilDays(date, interval));
}

export function validateTaskList(raw: unknown): TaskListInput {
  if (!raw || typeof raw !== 'object') throw new Error('invalid-request');
  const value = raw as TaskListInput;
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100 || !Number.isSafeInteger(value.sortOrder)) throw new Error('invalid-request');
  for (const field of ['icon', 'groupName'] as const) {
    if (value[field] !== null && (typeof value[field] !== 'string' || value[field]!.length > 100)) throw new Error('invalid-request');
  }
  if (value.id !== undefined && (typeof value.id !== 'string' || !value.id || value.id.length > 100 || typeof value.expectedUpdatedAt !== 'string')) throw new Error('invalid-request');
  return { ...value, name: value.name.trim(), groupName: value.groupName?.trim() || null };
}

export function inferTaskSubject(title: string, known: string[]): string {
  return known.find(subject => subject.trim() && matchesStudyQuery(title, subject)) ?? '';
}

export function referenceTaskSubject(target: string, books: { id: string; title: string; categories?: string[] }[], labels: { quran: string; sunnah: string; poetry: string }): string {
  if (target.startsWith('book:')) {
    const book = books.find(item => item.id === parseBookTarget(target)?.id);
    return book?.categories?.[0] || book?.title || '';
  }
  for (const kind of ['quran', 'sunnah', 'poetry'] as const) if (target.startsWith(`${kind}:`)) return labels[kind];
  return '';
}
