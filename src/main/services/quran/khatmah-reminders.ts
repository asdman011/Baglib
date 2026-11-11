import { powerMonitor } from 'electron';
import { notificationService } from '../../ipc/notifications';
import { settingsRepository } from '../../database/repositories/settings.repository';
import { confirmedQuitCleanup } from '../quit-cleanup';
import { translations } from '../../../renderer/translations';
import { KhatmahService } from './khatmah';
import { localDate } from '../../../shared/khatmah';

export const khatmahService = new KhatmahService(settingsRepository);
export function startKhatmahReminders(): void {
  const check = () => {
    try {
      khatmahService.remind(plan => {
        const text = translations[plan.reminder.language];
        notificationService.publish({ key: `${localDate()}:khatmah:${plan.id}`, kind: 'khatmah', title: text.khatmahReminderTitle, body: text.khatmahReminderBody.replace('{title}', plan.title), target: 'quran' });
        return true;
      });
    } catch (error) { console.error('[baglib:khatmah] Reminder check failed', error); }
  };
  const timer = setInterval(check, 30_000);
  timer.unref();
  const initial = setTimeout(check, 10_000);
  powerMonitor.on('resume', check);
  confirmedQuitCleanup.register(() => { clearInterval(timer); clearTimeout(initial); powerMonitor.removeListener('resume', check); });
}
