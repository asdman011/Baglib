import type { StudyTask } from '../../shared/study-planner';
import { parseLocalDateTime } from '../../shared/study-planner';
import type { NotificationService } from './notifications';
import type { ISettingsRepository } from '../database/repositories/settings.repository';

const DELIVERY_KEY = 'planner.reminder-delivery.v1';

/** Durable delivery markers survive history trimming and app restarts. */
export class PlannerReminderScheduler {
  constructor(
    private readonly tasks: { list(): StudyTask[] },
    private readonly notifications: Pick<NotificationService, 'publish'>,
    private readonly settings: ISettingsRepository,
    private readonly title: () => string,
    private readonly now = () => new Date(),
  ) {}

  check(): void {
    const rows = this.tasks.list();
    const delivered = this.settings.get<Record<string, string>>(DELIVERY_KEY, {}) ?? {};
    const retained: Record<string, string> = {};
    for (const task of rows) {
      if (delivered[task.id]) retained[task.id] = delivered[task.id];
      if (task.status !== 'open' || !task.reminderAt || delivered[task.id] === task.reminderAt) continue;
      if (parseLocalDateTime(task.reminderAt).getTime() > this.now().getTime()) continue;
      this.notifications.publish({
        key: `planner:${task.id}:${task.reminderAt}`,
        kind: 'study', title: this.title(), body: task.title,
        target: 'planner', taskId: task.id,
      });
      retained[task.id] = task.reminderAt;
    }
    this.settings.set(DELIVERY_KEY, retained);
  }
}
