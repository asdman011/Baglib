import { calculateHijriDate } from './athan-calculator';
import { validStudyTarget } from './study-notes';

export type PlannerCalendar = 'gregorian' | 'hijri';
export type PlannerPeriod = 'week' | 'month' | 'year';
export interface PlannerReference { target: string; label: string; scope?: 'surah' }
export function plannerReferenceTarget(reference: PlannerReference): string {
  return reference.scope === 'surah' && reference.target.startsWith('quran:') ? reference.target.replace(/:\d+(?:-\d+)?$/u, ':1') : reference.target;
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
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export type StudyTaskInput = Pick<StudyTask, 'title' | 'description' | 'status' | 'startDate' | 'dueDate' | 'priority' | 'sortOrder' | 'references'> & { id?: string; expectedUpdatedAt?: string };
export interface PlannerAPI {
  list(): Promise<StudyTask[]>;
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
  return { ...value, title: value.title.trim(), references } as StudyTaskInput;
}
