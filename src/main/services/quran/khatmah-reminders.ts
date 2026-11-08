import { app, BrowserWindow, Notification, powerMonitor } from 'electron';
import { settingsRepository } from '../../database/repositories/settings.repository';
import { confirmedQuitCleanup } from '../quit-cleanup';
import { translations } from '../../../renderer/translations';
import { KhatmahService } from './khatmah';
import { localDate } from '../../../shared/khatmah';

export const khatmahService = new KhatmahService(settingsRepository);

export function startKhatmahReminders(): void {
  if (process.platform === 'win32') app.setAppUserModelId('com.Baglib.app');
  const active = new Set<Notification>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const check = () => {
    if (!Notification.isSupported()) return;
    try {
      khatmahService.remind(plan => {
        if (pending.has(plan.id)) return false;
        try {
          const text = translations[plan.reminder.language];
          const notification = new Notification({ title: text.khatmahReminderTitle, body: text.khatmahReminderBody.replace('{title}', plan.title) });
          active.add(notification);
          const date = localDate();
          const clearPending = () => { clearTimeout(pending.get(plan.id)); pending.delete(plan.id); };
          pending.set(plan.id, setTimeout(clearPending, 15_000));
          notification.once('show', () => {
            clearPending();
            try { khatmahService.acknowledgeReminder(plan.id, date); } catch (cause) { console.error('[baglib:khatmah] Reminder acknowledgement failed', cause); }
          });
          notification.once('close', () => active.delete(notification));
          notification.once('failed', () => { active.delete(notification); clearPending(); });
          notification.once('click', () => {
            const window = BrowserWindow.getAllWindows().find(candidate => !candidate.isDestroyed());
            if (window?.isMinimized()) window.restore();
            window?.show(); window?.focus();
          });
          notification.show();
          return false;
        } catch { clearTimeout(pending.get(plan.id)); pending.delete(plan.id); return false; }
      });
    } catch (cause) { console.error('[baglib:khatmah] Reminder check failed', cause); }
  };
  const timer = setInterval(check, 30_000);
  timer.unref();
  const initial = setTimeout(check, 10_000);
  powerMonitor.on('resume', check);
  confirmedQuitCleanup.register(() => {
    clearInterval(timer); clearTimeout(initial);
    powerMonitor.removeListener('resume', check);
    for (const notification of active) notification.close();
    active.clear();
    for (const timer of pending.values()) clearTimeout(timer);
    pending.clear();
  });
}
