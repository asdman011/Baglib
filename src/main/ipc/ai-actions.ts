/**
 * KEY-439 (AI Task 5, Phase 1): IPC handlers for AI Actions (plan, confirm, undo).
 */
import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { getDatabase } from '../database/connection';
import { SqliteSettingsRepository } from '../database/repositories/settings.repository';
import { AIResearchService } from '../services/ai/ai-research.service';
import { AiActionsService } from '../services/ai/actions/tool-executor';
import { DigitalImportPipelineService } from '../services/digital/digital-import-pipeline.service';
import { resolveHadithByNumber } from './sunnah';
import type {
  AiActionConfirmRequest,
  AiActionOutputRequest,
  AiActionPlanRequest,
  AiActionUndoRequest,
} from '../../shared/ai-actions';

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
      resolveSunnahHadith: resolveHadithByNumber,
      openPath: filePath => shell.openPath(filePath),
      showItemInFolder: filePath => shell.showItemInFolder(filePath),
      importPdfToLibrary: async ({ filePath, title, author }) => {
        const pipeline = new DigitalImportPipelineService();
        const res = await pipeline.importFile({
          filePath,
          targetFormat: 'PDF',
          customTitle: title,
          customAuthor: author,
          tags: ['ai-generated'],
        });
        return res.success && res.workId
          ? { ok: true, workId: res.workId }
          : { ok: false, error: res.error || res.errorCode || 'import-failed' };
      },
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
    const selections = request?.selections && typeof request.selections === 'object' ? request.selections : undefined;
    return getService().confirmPlan(planId, language, selections);
  });

  ipcMain.handle('ai-actions:undo', (event, request: AiActionUndoRequest) => {
    authorize(event);
    const executionId = typeof request?.executionId === 'string' ? request.executionId : '';
    if (!executionId) return { ok: false as const, error: 'undo-not-found' as const };
    return getService().undoExecution(executionId);
  });

  ipcMain.handle('ai-actions:open-output', (event, request: AiActionOutputRequest) => {
    authorize(event);
    const executionId = typeof request?.executionId === 'string' ? request.executionId : '';
    const outputPath = typeof request?.outputPath === 'string' ? request.outputPath : '';
    return getService().openOutput(executionId, outputPath);
  });

  ipcMain.handle('ai-actions:show-in-folder', (event, request: AiActionOutputRequest) => {
    authorize(event);
    const executionId = typeof request?.executionId === 'string' ? request.executionId : '';
    const outputPath = typeof request?.outputPath === 'string' ? request.outputPath : '';
    return getService().showOutputInFolder(executionId, outputPath);
  });

  ipcMain.handle('ai-actions:add-to-library', (event, request: AiActionOutputRequest) => {
    authorize(event);
    const executionId = typeof request?.executionId === 'string' ? request.executionId : '';
    const outputPath = typeof request?.outputPath === 'string' ? request.outputPath : '';
    return getService().addOutputToLibrary(executionId, outputPath);
  });

  ipcMain.handle('ai-actions:choose-output-folder', async event => {
    authorize(event);
    const owner = BrowserWindow.fromWebContents(event.sender);
    const opts: Electron.OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] };
    const result = owner ? await dialog.showOpenDialog(owner, opts) : await dialog.showOpenDialog(opts);
    return result.canceled || !result.filePaths[0]
      ? { canceled: true }
      : { canceled: false, folderPath: result.filePaths[0] };
  });
}
