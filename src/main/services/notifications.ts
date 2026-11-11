import { randomUUID } from 'node:crypto';
import type { ISettingsRepository } from '../database/repositories/settings.repository';
import { NOTIFICATION_HISTORY_KEY, type NotificationRecord } from '../../shared/notifications';

export interface NotificationSink {
  deliver: (record: NotificationRecord) => void;
  open: (record: NotificationRecord) => void;
}
export class NotificationService {
  private focused = false;
  constructor(private repo: ISettingsRepository, private sink: NotificationSink, private suppressed: () => boolean, private now = () => new Date()) {}

  setFocused(focused: boolean): void { this.focused = focused; }
  history(): NotificationRecord[] { return this.repo.get<NotificationRecord[]>(NOTIFICATION_HISTORY_KEY, []) ?? []; }
  isSuppressed(): boolean { return this.focused || this.suppressed(); }
  publish(input: Pick<NotificationRecord, 'key' | 'kind' | 'title' | 'body' | 'target'>): NotificationRecord {
    const history = this.history();
    const existing = history.find(record => record.key === input.key);
    if (existing) return existing;
    const record: NotificationRecord = { ...input, id: randomUUID(), createdAt: this.now().toISOString(), status: this.isSuppressed() ? 'suppressed' : 'new' };
    this.save([record, ...history]);
    if (record.status === 'new') this.sink.deliver(record);
    return record;
  }
  action(id: string, action: 'snooze' | 'done' | 'open'): NotificationRecord[] {
    if (!['snooze', 'done', 'open'].includes(action)) throw new Error('invalid-action');
    const history = this.history();
    const record = history.find(item => item.id === id);
    if (!record) throw new Error('missing-notification');
    if (action === 'open') this.sink.open(record);
    else {
      record.status = action === 'done' ? 'done' : 'snoozed';
      record.snoozedUntil = action === 'snooze' ? new Date(this.now().getTime() + 10 * 60_000).toISOString() : undefined;
      this.save(history);
    }
    return history;
  }
  checkSnoozes(): void {
    if (this.isSuppressed()) return;
    const history = this.history();
    const due = history.filter(record => record.status === 'snoozed' && Date.parse(record.snoozedUntil ?? '') <= this.now().getTime());
    if (!due.length) return;
    for (const record of due) { record.status = 'new'; delete record.snoozedUntil; }
    this.save(history);
    for (const record of due) this.sink.deliver(record);
  }
  private save(history: NotificationRecord[]): void { this.repo.set(NOTIFICATION_HISTORY_KEY, history.slice(0, 500)); }
}
