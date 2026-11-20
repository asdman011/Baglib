import { translationErrorCode } from '../../shared/translation-privacy';
import { AiOperationError, aiOperationErrorCode } from '../../shared/ai-errors';
/**
 * Baglib — AI Research Assistant & Translation IPC Handlers (KEY-143)
 */

import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { getDatabase } from '../database/connection';
import { AIResearchService } from '../services/ai/ai-research.service';
import { TranslationService } from '../services/ai/translation.service';
import type { AISettings, AIResearchQueryPayload } from '../../shared/types/ai';
import { AIProviderService } from '../services/ai/ai-provider.service';
import { runResearchEditorAi } from '../services/ai/research-editor-ai';

let aiServiceInstance: AIResearchService | null = null;
let translationServiceInstance: TranslationService | null = null;

function getAIService(): AIResearchService {
  if (!aiServiceInstance) {
    aiServiceInstance = new AIResearchService(getDatabase());
  }
  return aiServiceInstance;
}

function getTranslationService(): TranslationService {
  if (!translationServiceInstance) {
    translationServiceInstance = new TranslationService();
  }
  return translationServiceInstance;
}

export function authorizeAiSender(event: IpcMainInvokeEvent): void {
 const frame=event.senderFrame;
 if (!frame || frame!==event.sender.mainFrame) throw new AiOperationError('invalid-request');
 const url=new URL(frame.url);
 if (url.username || url.password || !(url.protocol==='app:' && url.hostname==='-' || url.protocol==='file:' && !url.hostname || url.origin==='http://localhost:3000')) throw new AiOperationError('invalid-request');
}
export function registerAIIpc(): void {
  // Retrieve AI & BYOK settings
  ipcMain.handle('ai:get-settings', async (event) => {
    try {
      authorizeAiSender(event);
      const service = getAIService();
      return service.getSettings();
    } catch (err) {
      console.warn('[IPC:ai:get-settings] Error:', err);
      return null;
    }
  });

  // Save AI settings
  ipcMain.handle('ai:save-settings', async (event, newSettings: Partial<AISettings>) => {
    try {
      authorizeAiSender(event);
      const service = getAIService();
      return service.saveSettings(newSettings);
    } catch (err) {
      console.warn('[IPC:ai:save-settings] Error:', err);
      throw err;
    }
  });

  // KEY-385: the chat models an OpenAI-compatible service offers, for the settings model list.
  ipcMain.handle('ai:list-models', async (event, draft?: AISettings) => {
    authorizeAiSender(event);
    const settings = { ...getAIService().getSettings(), ...(draft && typeof draft === 'object' ? draft : {}) } as AISettings;
    return AIProviderService.getInstance().listModels(settings);
  });

  // Test provider connection
  ipcMain.handle('ai:test-connection', async (event, customSettings?: AISettings) => {
    try {
      authorizeAiSender(event);
      const service = getAIService();
      const result = await service.testConnection(customSettings);
      return result.success ? { success: true } : { success: false, error: aiOperationErrorCode(new Error(result.message)) };
    } catch (err: unknown) {

      return {
        success: false,
        error: aiOperationErrorCode(err),
      };
    }
  });

  // Execute academic research tool / anti-spoiler inquiry
  ipcMain.handle('ai:execute-tool', async (event, payload: AIResearchQueryPayload) => {
    try {
      authorizeAiSender(event);
      const service = getAIService();
      return await service.executeTool(payload);
    } catch (err: unknown) {

      return {
        content: '',
        error: translationErrorCode(err),
        tool: 'chat' as const,
        spoilerPrevented: false,
        providerUsed: 'error',
        durationMs: 0,
      };
    }
  });

  // KEY-373 (RE-12): grounded research AI for the manuscript editor (chapter + cited sources only).
  ipcMain.handle('ai:research-editor', async (event, request: unknown) => {
    try { authorizeAiSender(event); } catch { return { ok: false, error: 'invalid-request' }; }
    const provider = AIProviderService.getInstance();
    return runResearchEditorAi(request, {
      db: getDatabase(),
      settings: getAIService().getSettings(),
      complete: (prompt, settings) => provider.generateChatCompletion(prompt, settings),
    });
  });

  // Dedicated or LLM translation
  ipcMain.handle('ai:translate', async (event, options: unknown) => {
    try {
      authorizeAiSender(event);
      const service = getAIService();
      const settings = service.getSettings();
      const transService = getTranslationService();
      return await transService.translate(options as import('../../shared/translation-privacy').TranslationInput, settings);
    } catch (err: unknown) {

      return {
        translatedText: '',
        error: translationErrorCode(err),
        targetLang: 'ar',
        providerUsed: 'error',
      };
    }
  });
}
