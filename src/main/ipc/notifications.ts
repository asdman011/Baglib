import { BrowserWindow, ipcMain, Notification } from 'electron';
import { settingsRepository } from '../database/repositories/settings.repository';
import { NotificationService } from '../services/notifications';
import { inQuietWindow, type NotificationRecord } from '../../shared/notifications';
import { prayerClock } from '../../shared/athan-calculator';
import type { AthanSettings } from '../../shared/types/athan';
import { translations } from '../../renderer/translations';
import { confirmedQuitCleanup } from '../services/quit-cleanup';

let language: 'ar' | 'en' = 'ar';
const active = new Set<Notification>();
function broadcast(channel: string, record: NotificationRecord): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, record);
  }
}
export function notificationLanguage(): 'ar' | 'en' { return language; }
export const notificationService = new NotificationService(settingsRepository, {
  deliver(record) {
    broadcast('notifications:received', record);
    if (!Notification.isSupported()) return;
    try {
      const text = translations[language];
      const notification = new Notification({ title: record.title, body: record.body, silent: true,
        actions: [{ type: 'button', text: text.notificationSnooze }, { type: 'button', text: text.notificationDone }],
      });
      active.add(notification);
      notification.once('close', () => active.delete(notification));
      notification.once('failed', () => active.delete(notification));
      notification.on('action', (_event, index) => notificationService.action(record.id, index === 0 ? 'snooze' : 'done'));
      notification.once('click', () => notificationService.action(record.id, 'open'));
      notification.show();
    } catch (error) { console.warn('[baglib:notifications] OS delivery failed', error); }
  },
  open(record) {
    const win = BrowserWindow.getAllWindows().find(candidate => !candidate.isDestroyed());
    if (win?.isMinimized()) win.restore();
    win?.show(); win?.focus();
    broadcast('notifications:open', record);
  },
}, () => {
  const settings = settingsRepository.get<AthanSettings>('athan.settings.v1');
  if (!settings) return false;
  const clock = prayerClock(new Date(), (settings.locationMode === 'auto' ? settings.autoLocationCache?.timezone : undefined) ?? settings.manualLocation.timezone);
  return inQuietWindow(`${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`, settings.notifications.quietWindow);
});

export function registerNotificationIpc(): void {
  ipcMain.handle('notifications:history', () => notificationService.history());
  ipcMain.handle('notifications:action', (_event, id: string, action: 'snooze' | 'done' | 'open') => notificationService.action(id, action));
  ipcMain.handle('notifications:context', (_event, context: { focused: boolean; language: 'ar' | 'en' }) => {
    if (typeof context?.focused !== 'boolean' || !['ar', 'en'].includes(context.language)) throw new Error('invalid-context');
    language = context.language;
    notificationService.setFocused(context.focused);
  });
  confirmedQuitCleanup.register(() => { for (const notification of active) notification.close(); active.clear(); });
}
