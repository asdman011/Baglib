import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { getDatabase } from '../database/connection';
import { StudyPlannerRepository } from '../database/repositories/study-planner.repository';
import { validateTask } from '../../shared/study-planner';
import { StudyInsightsService } from '../services/statistics/study-insights.service';
import { StudyProgressService } from '../services/statistics/study-progress.service';
import { readingTrackerService } from '../services/statistics/reading-tracker.service';
import { SqliteSettingsRepository } from '../database/repositories/settings.repository';
import { QuranWirdService } from '../services/quran-wird.service';

function repository(event: IpcMainInvokeEvent): StudyPlannerRepository {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.protocol === 'file:' && !url.hostname || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
  return new StudyPlannerRepository(getDatabase());
}

export function registerStudyPlannerIpc(): void {
  const insights = (event: IpcMainInvokeEvent) => { repository(event); return new StudyInsightsService(getDatabase()); };
  ipcMain.handle('study-planner:list', event => repository(event).list());
  ipcMain.handle('study-planner:save', (event, input: unknown) => repository(event).save(validateTask(input)));
  ipcMain.handle('study-planner:remove', (event, id: string, expected: string) => repository(event).remove(id, expected));
  ipcMain.handle('study-planner:summary', event => insights(event).summary());
  ipcMain.handle('study-planner:preferences', event => insights(event).preferences());
  ipcMain.handle('study-planner:save-preferences', (event, input: unknown) => insights(event).savePreferences(input));
  ipcMain.handle('study-planner:words', (event, bookId?: string) => insights(event).words(bookId));
  ipcMain.handle('study-planner:rhythm-activity', (event, days?: unknown) => {
    return insights(event).rhythmDailyActivity(typeof days === 'number' && days > 0 && days <= 60 ? days : 14);
  });
  ipcMain.handle('study-planner:pause', (event, paused: unknown) => {
    repository(event);
    if (typeof paused !== 'boolean') throw new Error('invalid-request');
    readingTrackerService.setPaused(paused);
  });
  const progressService = (event: IpcMainInvokeEvent) => {
    repository(event);
    return new StudyProgressService(getDatabase());
  };
  ipcMain.handle('study-planner:progress-targets', event => progressService(event).listTargets());
  ipcMain.handle('study-planner:progress-summary', (event, targetKind: unknown, targetId: unknown) => {
    if (targetKind !== 'pathway' && targetKind !== 'book') throw new Error('invalid-request');
    if (typeof targetId !== 'string' || !targetId) throw new Error('invalid-request');
    return progressService(event).getProgress(targetKind, targetId);
  });
  const wirdService = (event: IpcMainInvokeEvent) => {
    repository(event);
    const db = getDatabase();
    let quranDir = path.join(app.getPath('userData'), 'quran');
    try {
      const locFile = path.join(app.getPath('userData'), 'quran-location.json');
      if (fs.existsSync(locFile)) {
        const config = JSON.parse(fs.readFileSync(locFile, 'utf8'));
        if (typeof config.directory === 'string' && path.isAbsolute(config.directory)) {
          quranDir = config.directory;
        }
      }
    } catch {}
    return new QuranWirdService({
      settingsRepo: new SqliteSettingsRepository(db),
      plannerRepo: new StudyPlannerRepository(db),
      quranDirectory: quranDir,
    });
  };
  ipcMain.handle('study-planner:wird-get-config', event => wirdService(event).getConfig());
  ipcMain.handle('study-planner:wird-save-config', (event, input: unknown) => wirdService(event).saveConfig(input));
  ipcMain.handle('study-planner:wird-sync-today', (event, todayStr: unknown) => {
    if (typeof todayStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(todayStr)) throw new Error('invalid-request');
    return wirdService(event).syncTodayWird(todayStr);
  });
  ipcMain.handle('study-planner:wird-complete', (event, todayStr: unknown, taskId?: unknown) => {
    if (typeof todayStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(todayStr)) throw new Error('invalid-request');
    return wirdService(event).completeWird(todayStr, typeof taskId === 'string' ? taskId : undefined);
  });
  ipcMain.handle('study-planner:wird-has-layout', (event, profile: unknown) => {
    if (profile !== 'hafs' && profile !== 'warsh') throw new Error('invalid-request');
    return wirdService(event).hasLayout(profile);
  });
}
