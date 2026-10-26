import { randomUUID } from 'node:crypto';
import { dateDay, khatmahStats, localDate, validateKhatmah } from '../../../shared/khatmah';
import type { KhatmahBinding, KhatmahConfig, KhatmahMutation, KhatmahPlan } from '../../../shared/types/khatmah';
import type { ISettingsRepository } from '../../database/repositories/settings.repository';

const key = 'quran.khatmah.v1';

export class KhatmahService {
  constructor(private settings: ISettingsRepository, private now: () => Date = () => new Date()) {}

  list(): KhatmahPlan[] {
    const stored = this.settings.get<{ version: number; plans: KhatmahPlan[] }>(key);
    if (stored === undefined) return [];
    try {
      if (stored.version !== 1 || !Array.isArray(stored.plans) || stored.plans.length > 20) throw new Error();
      const ids = new Set<string>();
      for (const plan of stored.plans) {
        validateKhatmah(plan, plan.binding);
        if (typeof plan.id !== 'string' || ids.has(plan.id) || typeof plan.paused !== 'boolean' || !Array.isArray(plan.reads) || plan.reads.length > 604) throw new Error();
        ids.add(plan.id);
        const pages = new Set<number>();
        for (const read of plan.reads) {
          if (!Number.isInteger(read.page) || read.page < 1 || read.page > 604 || pages.has(read.page) || dateDay(read.date) < dateDay(plan.startDate)) throw new Error();
          pages.add(read.page);
        }
        if (plan.remindedOn) dateDay(plan.remindedOn);
      }
      return stored.plans;
    } catch { throw new Error('storage'); }
  }

  private save(plans: KhatmahPlan[]): KhatmahPlan[] {
    this.settings.set(key, { version: 1, plans });
    return plans;
  }

  create(config: KhatmahConfig, binding: KhatmahBinding): KhatmahPlan[] {
    const valid = validateKhatmah(config, binding);
    const plans = this.list();
    if (plans.length >= 20) throw new Error('busy');
    return this.save([...plans, { ...valid, id: randomUUID(), binding, paused: false, reads: [] }]);
  }

  mutate(query: Exclude<KhatmahMutation, { action: 'create' }>): KhatmahPlan[] {
    if (!query || typeof query.id !== 'string') throw new Error('invalid-resource');
    const plans = this.list();
    const plan = plans.find(candidate => candidate.id === query.id);
    if (!plan) throw new Error('invalid-resource');
    if (query.action === 'delete') return this.save(plans.filter(candidate => candidate.id !== query.id));
    if (query.action === 'edit') {
      const valid = validateKhatmah(query.config, plan.binding);
      if (plan.reads.some(read => read.date < valid.startDate)) throw new Error('invalid-resource');
      Object.assign(plan, valid);
    } else if (query.action === 'pause') {
      if (typeof query.paused !== 'boolean') throw new Error('invalid-resource');
      plan.paused = query.paused;
    } else if (query.action === 'mark') {
      const today = localDate(this.now());
      if (query.script !== plan.script || query.layout !== plan.layout || typeof query.read !== 'boolean' || !Array.isArray(query.pages) || !query.pages.length || query.pages.length > 604 || query.pages.some(page => !Number.isInteger(page) || page < 1 || page > 604) || (query.read && (plan.paused || today < plan.startDate))) throw new Error('invalid-resource');
      const pages = new Set(query.pages);
      if (query.read) {
        for (const page of pages) if (!plan.reads.some(read => read.page === page)) plan.reads.push({ page, date: today });
      } else plan.reads = plan.reads.filter(read => !pages.has(read.page));
    } else throw new Error('invalid-resource');
    return this.save(plans);
  }

  remind(show: (plan: KhatmahPlan) => boolean): void {
    const now = this.now();
    const today = localDate(now);
    const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const plans = this.list();
    let changed = false;
    for (const plan of plans) {
      if (!plan.reminder.enabled || plan.paused || plan.startDate > today || plan.remindedOn === today || clock < plan.reminder.time || !khatmahStats(plan, today).todayPages.length) continue;
      if (show(plan)) { plan.remindedOn = today; changed = true; }
    }
    if (changed) this.save(plans);
  }

  acknowledgeReminder(id: string, date: string): void {
    if (date !== localDate(this.now())) return;
    const plans = this.list();
    const plan = plans.find(candidate => candidate.id === id);
    if (!plan || !plan.reminder.enabled || plan.paused) return;
    plan.remindedOn = date;
    this.save(plans);
  }
}
