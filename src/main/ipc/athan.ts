/**
 * Baglib — Athan & Prayer Times IPC Registration & Companion Mini-Window
 */

import { app, BrowserWindow, dialog, ipcMain, Notification, nativeImage, powerMonitor } from 'electron';
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
const activeNotifications = new Set<Notification>();

function createElectronDispatcher(): NotificationDispatcher {
  return {
    showNotification: ({ title, body, iconDataUrl }) => {
      try {
        if (!Notification.isSupported()) return;
        let icon: Electron.NativeImage | undefined;
        try {
          icon = nativeImage.createFromDataURL(iconDataUrl);
        } catch {
          icon = undefined;
        }
        const notification = new Notification({
          title,
          body,
          icon,
          silent: true, // Audio playback is handled by Baglib's dedicated Athan audio engine
        });
        activeNotifications.add(notification);
        notification.once('close', () => activeNotifications.delete(notification));
        notification.once('failed', () => activeNotifications.delete(notification));
        notification.once('click', () => {
          const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w !== miniWidgetWindow);
          if (win?.isMinimized()) win.restore();
          win?.show();
          win?.focus();
        });
        notification.show();
      } catch (err) {
        console.warn('[baglib:athan-ipc] Native notification error:', err);
      }
    },
    broadcastAlert: (alert) => {
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

  const onResume = () => {
    try {
      service.checkReminders();
    } catch {}
  };
  powerMonitor.on('resume', onResume);

  confirmedQuitCleanup.register(() => {
    service.stopScheduler();
    powerMonitor.removeListener('resume', onResume);
    for (const n of activeNotifications) {
      n.close();
    }
    activeNotifications.clear();
  });
}

export function registerAthanIpc(): void {
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
