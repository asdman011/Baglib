/**
 * Baglib — Reading Statistics IPC Handlers (KEY-149)
 */

import { ipcMain } from 'electron';
import { getDatabase } from '../database/connection';
import { workspaceStatistics } from '../services/statistics/workspace-statistics.service';
import { readingTrackerService } from '../services/statistics/reading-tracker.service';
import type { RecordReadingProgressPayload } from '../../shared/types/reading-statistics';

export function registerReadingStatisticsIpc(): void {
  ipcMain.handle('statistics:workspace', () => workspaceStatistics(getDatabase()));

  ipcMain.handle('statistics:start-session', (_event, payload) => {
    readingTrackerService.startSession(payload);
    return true;
  });

  ipcMain.handle('statistics:heartbeat', () => {
    readingTrackerService.heartbeat();
    return true;
  });

  ipcMain.handle('statistics:turn-page', (_event, page: number, totalPages?: number) => {
    readingTrackerService.turnPage(page, totalPages);
    return true;
  });

  ipcMain.handle('statistics:end-session', () => {
    readingTrackerService.endSession();
    return true;
  });

  ipcMain.handle('statistics:record-progress', (_event, payload: RecordReadingProgressPayload) => {
    readingTrackerService.recordReadingProgress(payload);
    return true;
  });

  ipcMain.handle('statistics:get-book-stats', (_event, bookId: string) => {
    return readingTrackerService.getBookStats(bookId);
  });

  ipcMain.handle('statistics:get-all-book-stats', () => {
    return readingTrackerService.getAllBookStats();
  });

  ipcMain.handle('statistics:get-daily-heatmap', (_event, days?: number) => {
    return readingTrackerService.getDailyHeatmap(days);
  });

  ipcMain.handle('statistics:get-streak-stats', () => {
    return readingTrackerService.getReadingStreakStats();
  });

  ipcMain.handle('statistics:get-median-page-duration', (_event, bookId: string) => {
    return readingTrackerService.getMedianPageDuration(bookId);
  });
}
