/**
 * Baglib — IPC for book revision (KEY-398): book and category decks, AI questions from highlights
 * and comments (accepted by the user before anything is saved), and the "time to revise" prompt.
 */

import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { getDatabase } from '../database/connection';
import { settingsRepository } from '../database/repositories/settings.repository';
import { createDeckSyncService } from '../services/deck-sync-readers';
import { BookRevisionService, FINISHED_PROMPT_SETTING, finishesBook } from '../services/book-revision';
import { AIResearchService } from '../services/ai/ai-research.service';
import { AIProviderService } from '../services/ai/ai-provider.service';
import { isLocalAi } from '../../shared/ai-consent';
import { providerErrorCode, providerErrorDetail } from '../../shared/ai-errors';
import { validateAcceptQuestions, validateGenerateQuestions } from '../../shared/book-questions';

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const KNOWN = ['invalid-request', 'permission-denied', 'invalid-output', 'busy', 'ai-disabled', 'no-annotations', 'no-books', 'source-not-found'];

const authorize = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !((url.protocol === 'app:' && url.hostname === '-') || (url.protocol === 'file:' && !url.hostname) || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
};

const failure = (error: unknown) => {
  const message = (error as Error)?.message ?? String(error);
  if (KNOWN.includes(message)) return { ok: false as const, error: message };
  if (/Gemini|OpenAI|Claude|Ollama|HTTP \d{3}|fetch failed|aborted|no answer within|API key/iu.test(message)) return { ok: false as const, error: providerErrorCode(message), detail: providerErrorDetail(message) };
  return { ok: false as const, error: 'engine-failed', detail: providerErrorDetail(message) };
};

const service = () => new BookRevisionService(getDatabase(), createDeckSyncService(getDatabase()));
const id = (value: unknown) => {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new Error('invalid-request');
  return value;
};

export function finishedPromptEnabled(): boolean {
  return settingsRepository.get<boolean>(FINISHED_PROMPT_SETTING, true) !== false;
}

/**
 * Called after a reading-status change: when it finishes the book, the renderer offers to make a
 * revision deck ("Time to revise!"), unless the user turned the prompt off.
 */
export function notifyIfBookFinished(workId: string, before: string | null | undefined, after: string | null | undefined): void {
  if (!finishesBook(before, after) || !finishedPromptEnabled()) return;
  const row = getDatabase().prepare(`SELECT title FROM work WHERE id = ?`).get(workId) as { title: string } | undefined;
  if (!row) return;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('book-revision:finished', { workId, title: row.title });
  }
}

export function registerBookRevisionIpc(): void {
  let running = false;
  ipcMain.handle('book-revision:book-deck', async (event, workId: unknown) => {
    try {
      authorize(event);
      return { ok: true, data: await service().bookDeck(id(workId)) };
    } catch (error) {
      return failure(error);
    }
  });
  ipcMain.handle('book-revision:category-deck', async (event, categoryId: unknown, language: unknown) => {
    try {
      authorize(event);
      return { ok: true, data: await service().categoryDeck(id(categoryId), language === 'ar' ? 'ar' : 'en') };
    } catch (error) {
      return failure(error);
    }
  });
  ipcMain.handle('book-revision:sources', (event, workId: unknown) => {
    try {
      authorize(event);
      return { ok: true, data: { count: service().questionSources(id(workId)).length } };
    } catch (error) {
      return failure(error);
    }
  });
  ipcMain.handle('book-revision:generate', async (event, input: unknown) => {
    let owned = false;
    try {
      authorize(event);
      const request = validateGenerateQuestions(input);
      const settings = AIResearchService.getInstance().getSettings();
      if (!settings.enabled) throw new Error('ai-disabled');
      if (!isLocalAi(settings) && !request.allowRemote) throw new Error('permission-denied');
      if (running) throw new Error('busy');
      running = true;
      owned = true;
      const data = await service().generate(request.workId, request.language, request.kinds, (systemPrompt, userPrompt) =>
        AIProviderService.getInstance().generateChatCompletion({ temperature: 0.2, json: true, preventRedirect: !request.allowRemote, systemPrompt, userPrompt }, settings)
      );
      return { ok: true, data };
    } catch (error) {
      return failure(error);
    } finally {
      if (owned) running = false;
    }
  });
  ipcMain.handle('book-revision:accept', async (event, input: unknown) => {
    try {
      authorize(event);
      const request = validateAcceptQuestions(input);
      return { ok: true, data: await service().accept(request.workId, request.language, request.questions, request.deckId) };
    } catch (error) {
      return failure(error);
    }
  });
  ipcMain.handle('book-revision:finished-prompt', (event, value: unknown) => {
    authorize(event);
    if (typeof value === 'boolean') settingsRepository.set(FINISHED_PROMPT_SETTING, value);
    return finishedPromptEnabled();
  });
}
