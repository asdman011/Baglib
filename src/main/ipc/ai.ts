/**
 * Baglib — AI Research Assistant & Translation IPC Handlers (KEY-143)
 */

import { ipcMain } from 'electron';
import { getDatabase } from '../database/connection';
import { AIResearchService } from '../services/ai/ai-research.service';
import { TranslationService, TranslateOptions } from '../services/ai/translation.service';
import type { AISettings, AIResearchQueryPayload } from '../../shared/types/ai';

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

  // Test provider connection
  ipcMain.handle('ai:test-connection', async (_, customSettings?: AISettings) => {
    try {
      const service = getAIService();
      return await service.testConnection(customSettings);
    } catch (err: any) {
      console.warn('[IPC:ai:test-connection] Error:', err);
      return {
        success: false,
        message: err.message || 'Connection test failed',
      };
    }
  });

  // Execute academic research tool / anti-spoiler inquiry
  ipcMain.handle('ai:execute-tool', async (_, payload: AIResearchQueryPayload) => {
    try {
      const service = getAIService();
      return await service.executeTool(payload);
    } catch (err: any) {
      console.warn('[IPC:ai:execute-tool] Error:', err);
      return {
        content: `Error executing AI research tool: ${err.message}`,
        tool: payload.tool,
        spoilerPrevented: false,
        providerUsed: 'error',
        durationMs: 0,
      };
    }
  });

  // Dedicated or LLM translation
  ipcMain.handle('ai:translate', async (_, options: TranslateOptions) => {
    try {
      const service = getAIService();
      const settings = service.getSettings();
      const transService = getTranslationService();
      return await transService.translate(options, settings);
    } catch (err: any) {
      console.warn('[IPC:ai:translate] Error:', err);
      return {
        translatedText: `Translation error: ${err.message}`,
        targetLang: options.targetLang || 'ar',
        providerUsed: 'error',
      };
    }
  });
}
