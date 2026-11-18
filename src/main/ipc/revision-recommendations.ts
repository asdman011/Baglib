/**
 * Baglib — IPC for the "Revise next" recommendations (KEY-412).
 */

import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { getDatabase } from '../database/connection';
import { RevisionRecommendationService } from '../services/revision-recommendations';

const authorize = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !((url.protocol === 'app:' && url.hostname === '-') || (url.protocol === 'file:' && !url.hostname) || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
};

const failure = (error: unknown) => ({ ok: false as const, error: (error as Error)?.message === 'invalid-request' ? 'invalid-request' : 'failed' });

export function registerRevisionRecommendationIpc(): void {
  ipcMain.handle('revision-recommendations:list', event => {
    try {
      authorize(event);
      return { ok: true, data: new RevisionRecommendationService(getDatabase()).list() };
    } catch (error) {
      return failure(error);
    }
  });
  ipcMain.handle('revision-recommendations:dismiss', (event, id: unknown) => {
    try {
      authorize(event);
      new RevisionRecommendationService(getDatabase()).dismiss(id);
      return { ok: true, data: null };
    } catch (error) {
      return failure(error);
    }
  });
}
