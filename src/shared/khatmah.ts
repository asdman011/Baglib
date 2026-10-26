import type { KhatmahBinding, KhatmahConfig, KhatmahPlan, KhatmahStats } from './types/khatmah';

export const KHATMAH_JUZ_STARTS = ['1:1', '2:142', '2:253', '3:93', '4:24', '4:148', '5:82', '6:111', '7:88', '8:41', '9:93', '11:6', '12:53', '15:1', '17:1', '18:75', '21:1', '23:1', '25:21', '27:56', '29:46', '33:31', '36:28', '39:32', '41:47', '46:1', '51:31', '58:1', '67:1', '78:1'];
export const KHATMAH_JUZ_ENDS = ['2:141', '2:252', '3:92', '4:23', '4:147', '5:81', '6:110', '7:87', '8:40', '9:92', '11:5', '12:52', '14:52', '16:128', '18:74', '20:135', '22:78', '25:20', '27:55', '29:45', '33:30', '36:27', '39:31', '41:46', '45:37', '51:30', '57:29', '66:12', '77:50', '114:6'];

export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function dateDay(value: string): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('invalid-resource');
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < '2000-01-01' || value > '2200-12-31') throw new Error('invalid-resource');
  return Math.floor(date.getTime() / 86_400_000);
}

export function addDays(value: string, days: number): string {
  return new Date((dateDay(value) + days) * 86_400_000).toISOString().slice(0, 10);
}

const integer = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;

export function khatmahTargetDate(config: KhatmahConfig): string {
  const start = dateDay(config.startDate);
  let days = config.durationDays;
  if (config.mode === 'date') days = dateDay(config.targetDate) - start + 1;
  if (config.mode === 'pages') days = Math.ceil(604 / (config.pagesPerSession * config.sessionsPerDay));
  if (config.mode === 'juz') days = Math.ceil(30 / config.juzPerDay);
  if (!integer(days, 1, 3660)) throw new Error('invalid-resource');
  const target = addDays(config.startDate, days - 1);
  dateDay(target);
  return target;
}

export function validateKhatmah(config: KhatmahConfig, binding: KhatmahBinding): KhatmahConfig {
  if (!config || !binding || typeof binding.script !== 'string' || !binding.script || typeof binding.layout !== 'string' || !binding.layout || !['hafs', 'warsh'].includes(binding.profile) || typeof binding.adapted !== 'boolean' || !Array.isArray(binding.juzPages) || typeof config.title !== 'string' || !config.title.trim() || config.title.length > 80 || config.script !== binding.script || config.layout !== binding.layout || binding.totalPages !== 604 || !['duration', 'date', 'pages', 'juz'].includes(config.mode) || typeof config.automatic !== 'boolean') throw new Error('invalid-resource');
  dateDay(config.startDate);
  if (!integer(config.durationDays, 1, 3660) || !integer(config.pagesPerSession, 1, 604) || !integer(config.sessionsPerDay, 1, 24) || !integer(config.juzPerDay, 1, 30)) throw new Error('invalid-resource');
  if (!config.reminder || typeof config.reminder.enabled !== 'boolean' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(config.reminder.time) || !['ar', 'en'].includes(config.reminder.language)) throw new Error('invalid-resource');
  if (config.mode === 'juz') {
    if (binding.profile !== 'hafs' || binding.adapted || binding.juzPages.length !== 30 || binding.juzEndPages?.length !== 30 || binding.juzPages[0] !== 1 || binding.juzEndPages[29] !== 604 || binding.juzPages.some((page, index) => !integer(page, 1, 604) || (index > 0 && page <= binding.juzPages[index - 1])) || binding.juzEndPages.some((page, index) => !integer(page, binding.juzPages[index], 604) || (index > 0 && page <= binding.juzEndPages[index - 1]))) throw new Error('unsupported-format');
  }
  const targetDate = khatmahTargetDate(config);
  const days = dateDay(targetDate) - dateDay(config.startDate) + 1;
  return { title: config.title.trim(), script: config.script, layout: config.layout, startDate: config.startDate, mode: config.mode, durationDays: days, targetDate, pagesPerSession: config.pagesPerSession, sessionsPerDay: config.sessionsPerDay, juzPerDay: config.juzPerDay, automatic: config.automatic, reminder: { enabled: config.reminder.enabled, time: config.reminder.time, language: config.reminder.language } };
}

export function khatmahStats(plan: KhatmahPlan, today = localDate()): KhatmahStats {
  const day = dateDay(today);
  const start = dateDay(plan.startDate);
  const target = dateDay(plan.targetDate);
  const completed = new Set(plan.reads.map(read => read.page));
  const unread = Array.from({ length: 604 }, (_, index) => index + 1).filter(page => !completed.has(page));
  const readToday = plan.reads.filter(read => read.date === today).length;
  const future = day < start;
  const elapsed = Math.max(1, day - start + 1);
  const daysRemaining = Math.max(0, target - day + 1);
  let quota = Math.max(0, Math.ceil((unread.length + readToday) / Math.max(1, daysRemaining)) - readToday);
  if (plan.mode === 'pages') quota = Math.max(0, plan.pagesPerSession * plan.sessionsPerDay - readToday);
  if (plan.mode === 'juz' && unread.length) {
    const firstToday = Math.min(unread[0], ...plan.reads.filter(read => read.date === today).map(read => read.page));
    const currentJuz = Math.max(0, plan.binding.juzEndPages.findIndex(page => page >= firstToday));
    const end = plan.binding.juzEndPages[Math.min(29, currentJuz + plan.juzPerDay - 1)];
    quota = unread.filter(page => page <= end).length;
  }
  const todayPages = future || plan.paused ? [] : unread.slice(0, quota);
  const dates = new Set(plan.reads.map(read => read.date));
  let cursor = dates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (dates.has(cursor)) { streak++; cursor = addDays(cursor, -1); }
  const plannedPace = plan.mode === 'pages' ? plan.pagesPerSession * plan.sessionsPerDay : 604 / plan.durationDays;
  const pace = completed.size ? completed.size / elapsed : plannedPace;
  const forecastDate = unread.length ? addDays(future ? plan.startDate : today, Math.max(0, Math.ceil(unread.length / pace) - 1)) : [...plan.reads].sort((first, second) => second.date.localeCompare(first.date))[0]?.date || today;
  const expectedYesterday = Math.min(604, Math.max(0, day - start) * (604 / plan.durationDays));
  const expectedTonight = Math.min(604, Math.max(0, day - start + 1) * (604 / plan.durationDays));
  return { completed: completed.size, percent: completed.size / 604 * 100, streak, todayPages, readToday, targetDate: plan.targetDate, forecastDate, schedule: completed.size > Math.ceil(expectedTonight) ? 'ahead' : completed.size < Math.floor(expectedYesterday) ? 'behind' : 'on-track', daysRemaining, future };
}

export function khatmahReadingDwell(mark: () => void, schedule: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout> = setTimeout, cancel: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = false;
  let disposed = false;
  let marked = false;
  return {
    update(next: boolean) {
      if (disposed || marked || next === active) return;
      active = next;
      if (timer !== undefined) cancel(timer);
      timer = undefined;
      if (active) timer = schedule(() => { timer = undefined; marked = true; mark(); }, 20_000);
    },
    dispose() { disposed = true; if (timer !== undefined) cancel(timer); timer = undefined; },
  };
}

export function pageRanges(pages: number[]): string {
  const ranges: string[] = [];
  for (let index = 0; index < pages.length; index++) {
    const start = pages[index];
    let end = start;
    while (pages[index + 1] === end + 1) { index++; end = pages[index]; }
    ranges.push(start === end ? String(start) : `${start}–${end}`);
  }
  return ranges.join(', ');
}
