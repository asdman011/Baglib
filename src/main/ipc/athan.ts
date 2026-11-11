import { notificationLanguage, notificationService, registerNotificationIpc } from './notifications';
import { DEFAULT_DHIKR_REMINDERS, dhikrSchedule } from '../../shared/notifications';
import { dhikrTitle, notificationMinutes } from '../../shared/notification-text';
import { translations } from '../../renderer/translations';
import { buildPrayerStatusSnapshot, prayerClock, PRAYER_LABELS } from '../../shared/athan-calculator';
import { DEFAULT_STUDY_RHYTHM, RHYTHM_SETTINGS_KEY, WEEKLY_RHYTHM_SETTINGS_KEY, type StudyRhythm, type WeeklyRhythmConfig } from '../../shared/study-rhythm';
/**
 * Baglib — Athan & Prayer Times IPC Registration & Companion Mini-Window
 */

import { app, BrowserWindow, dialog, ipcMain, powerMonitor } from 'electron';
import { confirmedQuitCleanup } from '../services/quit-cleanup';
import path from 'node:path';
import { settingsRepository } from '../database/repositories/settings.repository';
import {
  AthanService,
  type NotificationDispatcher,
  ensureLocalAthanAudioFile,
} from '../services/athan';
import type { AthanSettings, PrayerName } from '../../shared/types/athan';

let athanServiceInstance: AthanService | null = null;
let miniWidgetWindow: BrowserWindow | null = null;


function createElectronDispatcher(): NotificationDispatcher {
  return {
    showNotification: () => {},
    broadcastAlert: (alert) => {
      const lang = notificationLanguage();
      const text = translations[lang];
      const prayer = PRAYER_LABELS[alert.prayer][lang];
      const title = alert.type === 'athan' ? text.notificationPrayer.replace('{prayer}', prayer)
        : text.notificationPrePrayer.replace('{prayer}', prayer).replace('{minutes}', notificationMinutes(alert.minutesRemaining ?? 0, lang));
      if (getAthanService().getSettings().notifications.enabled) notificationService.publish({ key: alert.scheduleKey ?? alert.id, kind: 'prayer', title, body: alert.scheduledTime, target: 'dashboard' });
      if (notificationService.isSuppressed()) return;

      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('athan:alert', alert);
        }
      }
    },
    broadcastState: (state) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('athan:state-changed', state);
        }
      }
    },
  };
}

export function getAthanService(): AthanService {
  if (!athanServiceInstance) {
    athanServiceInstance = new AthanService(
      settingsRepository,
      () => new Date(),
      undefined,
      createElectronDispatcher()
    );
  }
  return athanServiceInstance;
}

export function startAthanScheduler(): void {
  ensureLocalAthanAudioFile();
  const service = getAthanService();
  service.startScheduler(15_000);
  const checkOtherReminders = () => {
    try {
      notificationService.checkSnoozes();
      const state = service.getState();
      const now = new Date();
      const clock = prayerClock(now, state.coordinates.timezone);
      const minute = clock.hour * 60 + clock.minute;
      const lang = notificationLanguage();
      for (const delta of [-1, 0, 1]) {
        const snapshot = delta === 0 ? state : buildPrayerStatusSnapshot(state.settings, new Date(now.getTime() + delta * 86_400_000));
        for (const entry of dhikrSchedule(snapshot.times, state.settings.dhikrReminders ?? DEFAULT_DHIKR_REMINDERS)) {
          if (entry.dayOffset !== -delta || entry.minute !== minute || !entry.reminder) continue;
          notificationService.publish({ key: entry.key, kind: 'dhikr', title: dhikrTitle(entry.reminder, lang), body: entry.reminder.prayer ? PRAYER_LABELS[entry.reminder.prayer][lang] : entry.reminder.time, target: 'dashboard' });
        }
      }
      const rhythm = settingsRepository.get<StudyRhythm>(RHYTHM_SETTINGS_KEY, DEFAULT_STUDY_RHYTHM);
      const time = `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`;
      if (rhythm?.enabled) {
        for (const kind of ['zikr', 'wird'] as const) {
          if (rhythm[kind] !== time) continue;
          notificationService.publish({ key: `${state.times.date}:rhythm:${kind}`, kind: kind === 'zikr' ? 'dhikr' : 'wird', title: kind === 'zikr' ? translations[lang].rhythmZikr : translations[lang].rhythmWird, body: time, target: kind === 'wird' ? 'quran' : 'dashboard' });
        }
      }
      const weekly = settingsRepository.get<WeeklyRhythmConfig>(WEEKLY_RHYTHM_SETTINGS_KEY);
      if (weekly?.dailyReminderTime === time) notificationService.publish({ key: `${state.times.date}:study`, kind: 'study', title: translations[lang].todayDailyReminder, body: time, target: 'planner' });
    } catch (error) { console.warn('[baglib:notifications] Schedule check failed', error); }
  };
  const otherTimer = setInterval(checkOtherReminders, 1000);
  otherTimer.unref();
  powerMonitor.on('resume', checkOtherReminders);
  confirmedQuitCleanup.register(() => { clearInterval(otherTimer); powerMonitor.removeListener('resume', checkOtherReminders); });

  const onResume = () => {
    try {
      service.checkReminders();
    } catch {}
  };
  powerMonitor.on('resume', onResume);

  confirmedQuitCleanup.register(() => {
    service.stopScheduler();
    powerMonitor.removeListener('resume', onResume);

  });
}

export function registerAthanIpc(): void {
  registerNotificationIpc();
  ipcMain.handle('athan:choose-recording', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    const service = getAthanService();
    return service.updateSettings({ audio: { ...service.getSettings().audio, enabled: true, muted: false, soundPreset: 'custom', customAudioPath: `baglib-asset://${encodeURI(result.filePaths[0].replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F')}` } });
  });
  ipcMain.handle('athan:get-state', () => {
    return getAthanService().getState();
  });

  ipcMain.handle('athan:update-settings', (_event, partial: Partial<AthanSettings>) => {
    return getAthanService().updateSettings(partial || {});
  });

  ipcMain.handle('athan:detect-auto-location', async () => {
    return getAthanService().detectAutoLocation();
  });

  ipcMain.handle('athan:sync-mawaqit', async (_event, mosqueIdOrSlug?: string) => {
    return getAthanService().syncMawaqit(mosqueIdOrSlug);
  });

  ipcMain.handle(
    'athan:trigger-test-alert',
    (_event, prayer?: PrayerName, type?: 'athan' | 'pre-reminder') => {
      return getAthanService().triggerTestAlert(prayer, type);
    }
  );

  ipcMain.handle('athan:toggle-mini-widget', async () => {
    if (miniWidgetWindow && !miniWidgetWindow.isDestroyed()) {
      miniWidgetWindow.close();
      miniWidgetWindow = null;
      return { open: false };
    }

    miniWidgetWindow = new BrowserWindow({
      width: 340,
      height: 220,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: false,
      transparent: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    miniWidgetWindow.on('closed', () => {
      miniWidgetWindow = null;
    });

    const isDev = !app.isPackaged;
    const url = isDev ? 'http://localhost:3000/?widget=companion' : 'app://-/?widget=companion';
    try {
      await miniWidgetWindow.loadURL(url);
    } catch (err) {
      console.warn('[baglib:athan-ipc] Mini-widget loadURL warning:', err);
    }

    return { open: true };
  });
}
