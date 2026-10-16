/**
 * Baglib — Dictionary and Encyclopedia IPC Handlers (KEY-142)
 */

import { ipcMain } from 'electron';
import { getDatabase } from '../database/connection';
import { DictionaryService } from '../services/dictionary/dictionary.service';
import { WikipediaService } from '../services/dictionary/wikipedia.service';
import type { ImportDictionaryOptions } from '../../shared/types/dictionary';

let dictionaryServiceInstance: DictionaryService | null = null;
let wikipediaServiceInstance: WikipediaService | null = null;

function getDictService(): DictionaryService {
  if (!dictionaryServiceInstance) {
    dictionaryServiceInstance = new DictionaryService(getDatabase());
  }
  return dictionaryServiceInstance;
}

function getWikiService(): WikipediaService {
  if (!wikipediaServiceInstance) {
    wikipediaServiceInstance = new WikipediaService();
  }
  return wikipediaServiceInstance;
}

export function registerDictionaryIpc(): void {
  // Aggregate Lookup across enabled local dictionaries and Wikipedia
  ipcMain.handle(
    'dictionary:lookup',
    async (_, word: string, options?: { lang?: string; includeWikipedia?: boolean }) => {
      try {
        const service = getDictService();
        return await service.lookup(word, options);
      } catch (err) {
        console.warn('[IPC:dictionary:lookup] Error:', err);
        return {
          query: word,
          candidates: [],
          entries: [],
          wikipedia: null,
          durationMs: 0,
        };
      }
    }
  );

  // Wikipedia Summary Card direct fetch
  ipcMain.handle('dictionary:wikipedia', async (_, word: string, lang?: string) => {
    try {
      const wiki = getWikiService();
      return await wiki.fetchSummary(word, lang);
    } catch (err) {
      console.warn('[IPC:dictionary:wikipedia] Error:', err);
      return null;
    }
  });

  // List registered dictionaries
  ipcMain.handle('dictionary:list', async () => {
    try {
      const service = getDictService();
      return service.listDictionaries();
    } catch (err) {
      console.warn('[IPC:dictionary:list] Error:', err);
      return [];
    }
  });

  // Import and index local dictionary
  ipcMain.handle('dictionary:import', async (_, options: ImportDictionaryOptions) => {
    const service = getDictService();
    return await service.importDictionary(options);
  });

  // Toggle dictionary enablement
  ipcMain.handle('dictionary:toggle', async (_, id: string, isEnabled: boolean) => {
    const service = getDictService();
    return service.toggleDictionary(id, isEnabled);
  });

  // Delete dictionary
  ipcMain.handle('dictionary:delete', async (_, id: string) => {
    const service = getDictService();
    return service.deleteDictionary(id);
  });
}
