import { errorMessage } from '../../shared/errors';
/**
 * Baglib — AI Research Assistant & Translation IPC Handlers (KEY-143)
 */

import { ipcMain } from 'electron';
import { getDatabase } from '../database/connection';
import { AIResearchService } from '../services/ai/ai-research.service';
import { TranslationService, TranslateOptions } from '../services/ai/translation.service';
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

export function registerAIIpc(): void {
  // Retrieve AI & BYOK settings
  ipcMain.handle('ai:get-settings', async () => {
    try {
      const service = getAIService();
      return service.getSettings();
    } catch (err) {
      console.warn('[IPC:ai:get-settings] Error:', err);
      return null;
    }
  });

  // Save AI settings
  ipcMain.handle('ai:save-settings', async (_, newSettings: Partial<AISettings>) => {
    try {
      const service = getAIService();
      return service.saveSettings(newSettings);
    } catch (err) {
      console.warn('[IPC:ai:save-settings] Error:', err);
      throw err;
    }
  });

  // KEY-385: the chat models an OpenAI-compatible service offers, for the settings model list.
  ipcMain.handle('ai:list-models', async (_, draft?: AISettings) => {
    const settings = { ...getAIService().getSettings(), ...(draft && typeof draft === 'object' ? draft : {}) } as AISettings;
    return AIProviderService.getInstance().listModels(settings);
  });

  // Test provider connection
  ipcMain.handle('ai:test-connection', async (_, customSettings?: AISettings) => {
    try {
      const service = getAIService();
      return await service.testConnection(customSettings);
    } catch (err: unknown) {
      console.warn('[IPC:ai:test-connection] Error:', err);
      return {
        success: false,
        message: errorMessage(err) || 'Connection test failed',
      };
    }
  });

  // Execute academic research tool / anti-spoiler inquiry
  ipcMain.handle('ai:execute-tool', async (_, payload: AIResearchQueryPayload) => {
    try {
      const service = getAIService();
      return await service.executeTool(payload);
    } catch (err: unknown) {
      console.warn('[IPC:ai:execute-tool] Error:', err);
      return {
        content: `Error executing AI research tool: ${errorMessage(err)}`,
        tool: payload.tool,
        spoilerPrevented: false,
        providerUsed: 'error',
        durationMs: 0,
      };
    }
  });

  // KEY-373 (RE-12): grounded research AI for the manuscript editor (chapter + cited sources only).
  ipcMain.handle('ai:research-editor', async (_, request: unknown) => {
    const provider = AIProviderService.getInstance();
    return runResearchEditorAi(request, {
      db: getDatabase(),
      settings: getAIService().getSettings(),
      complete: (prompt, settings) => provider.generateChatCompletion(prompt, settings),
    });
  });

  // Dedicated or LLM translation
  ipcMain.handle('ai:translate', async (_, options: TranslateOptions) => {
    try {
      const service = getAIService();
      const settings = service.getSettings();
      const transService = getTranslationService();
      return await transService.translate(options, settings);
    } catch (err: unknown) {
      console.warn('[IPC:ai:translate] Error:', err);
      return {
        translatedText: `Translation error: ${errorMessage(err)}`,
        targetLang: options.targetLang || 'ar',
        providerUsed: 'error',
      };
    }
  });
}
