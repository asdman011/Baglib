/**
 * KEY-439 (AI Task 5, Phase 1): IPC handlers for AI Actions (plan, confirm, undo).
 */
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { getDatabase } from '../database/connection';
import { SqliteSettingsRepository } from '../database/repositories/settings.repository';
import { AIResearchService } from '../services/ai/ai-research.service';
import { AiActionsService } from '../services/ai/actions/tool-executor';
import type { AiActionConfirmRequest, AiActionPlanRequest, AiActionUndoRequest } from '../../shared/ai-actions';

const authorize = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (
    url.username ||
    url.password ||
    !(
      (url.protocol === 'app:' && url.hostname === '-') ||
      (url.protocol === 'file:' && !url.hostname) ||
      url.origin === 'http://localhost:3000'
    )
  ) {
    throw new Error('invalid-request');
  }
};

let cachedService: AiActionsService | null = null;
let cachedDb: ReturnType<typeof getDatabase> | null = null;

function getService(): AiActionsService {
  const db = getDatabase();
  if (!cachedService || cachedDb !== db) {
    cachedDb = db;
    cachedService = new AiActionsService({
      db,
      settingsRepo: new SqliteSettingsRepository(db),
      getAiSettings: () => AIResearchService.getInstance().getSettings(),
    });
  }
  return cachedService;
}

export function registerAiActionsIpc(): void {
  ipcMain.handle('ai-actions:plan', (event, request: AiActionPlanRequest) => {
    authorize(event);
    return getService().planFromInstruction(request);
  });

  ipcMain.handle('ai-actions:confirm', (event, request: AiActionConfirmRequest) => {
    authorize(event);
    const planId = typeof request?.planId === 'string' ? request.planId : '';
    const language = request?.language === 'ar' ? 'ar' : 'en';
    if (!planId) return { ok: false as const, error: 'plan-not-found' as const };
    return getService().confirmPlan(planId, language);
  });

  ipcMain.handle('ai-actions:undo', (event, request: AiActionUndoRequest) => {
    authorize(event);
    const executionId = typeof request?.executionId === 'string' ? request.executionId : '';
    if (!executionId) return { ok: false as const, error: 'undo-not-found' as const };
    return getService().undoExecution(executionId);
  });
}
