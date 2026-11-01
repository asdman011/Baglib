import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { getDatabase } from '../database/connection';
import { StudyPlannerRepository } from '../database/repositories/study-planner.repository';
import { validateTask } from '../../shared/study-planner';
import { StudyInsightsService } from '../services/statistics/study-insights.service';
import { readingTrackerService } from '../services/statistics/reading-tracker.service';

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
  ipcMain.handle('study-planner:pause', (event, paused: unknown) => {
    repository(event);
    if (typeof paused !== 'boolean') throw new Error('invalid-request');
    readingTrackerService.setPaused(paused);
  });
}
