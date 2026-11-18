/**
 * Baglib — Dictionary and Encyclopedia IPC Handlers (KEY-142)
 */

import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { getDatabase } from '../database/connection';
import { DictionaryService } from '../services/dictionary/dictionary.service';
import { WikipediaService } from '../services/dictionary/wikipedia.service';
import { DictionaryPrefsService } from '../services/dictionary/dictionary-prefs';
import { confirmedQuitCleanup } from '../services/quit-cleanup';
import type { ImportDictionaryOptions } from '../../shared/types/dictionary';
import { translations } from '../../renderer/translations';

let dictionaryServiceInstance: DictionaryService | null = null;
let wikipediaServiceInstance: WikipediaService | null = null;

function getDictService(): DictionaryService {
  if (!dictionaryServiceInstance) {
    const userDataDir = app?.getPath?.('userData') || path.resolve(process.env.BAGLIB_USER_DATA || '.baglib-data');
    const packRootDir = path.join(userDataDir, 'dictionaries', 'arabic-lexicons');
    dictionaryServiceInstance = new DictionaryService(getDatabase(), packRootDir);
    confirmedQuitCleanup.register(() => dictionaryServiceInstance?.close());
  }
  return dictionaryServiceInstance;
}
export { getDictService as getDictionaryService };

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
    async (_, word: string, options?: { lang?: string; includeWikipedia?: boolean; science?: string; workId?: string }) => {
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
  ipcMain.handle('dictionary:list', async (_, lang?: 'ar' | 'en') => {
    try {
      const service = getDictService();
      return service.listDictionaries(lang === 'en' ? 'en' : 'ar');
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

  // The user picks a dictionary file they hold; nothing is fetched
  ipcMain.handle('dictionary:choose-import', async (event, science: unknown) => {
    const options = { properties: ['openFile' as const], filters: [{ name: 'Dictionary', extensions: ['ifo', 'mdx', 'bgl', 'slob'] }] };
    const owner = BrowserWindow.fromWebContents(event.sender);
    const choice = await (owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options));
    if (choice.canceled || !choice.filePaths[0]) return null;
    const service = getDictService();
    const item = await service.importDictionary({ sourcePath: choice.filePaths[0] });
    if (typeof science === 'string' && science) service.setScience(item.id, science);
    return service.listDictionaries().find(dictionary => dictionary.id === item.id) ?? item;
  });

  // KEY-413: Import the 11-dictionary Arabic Lexicons pack from a user-selected file (repo zip or db.sqlite)
  ipcMain.handle(
    'dictionary:import-arabic-lexicons',
    async (event, options?: { sourcePath?: string; arEnDir?: string | null; lang?: 'ar' | 'en' }) => {
      const service = getDictService();
      const lang: 'ar' | 'en' = options?.lang === 'en' ? 'en' : 'ar';
      const t = translations[lang];
      // A path from the renderer (live harnesses) must be a plain string to a .zip/.sqlite/.db file;
      // the ar_en folder only ever has its known AraMorph files copied out of it.
      const validPath = (value: unknown, pattern?: RegExp) =>
        typeof value === 'string' && value.length > 0 && value.length < 4096 && !value.includes('\0') && (!pattern || pattern.test(value));
      if (options?.sourcePath !== undefined && !validPath(options.sourcePath, /\.(?:zip|sqlite|db)$/iu)) throw new Error('invalid-pack');
      if (options?.arEnDir !== undefined && options.arEnDir !== null && !validPath(options.arEnDir)) throw new Error('invalid-pack');
      let sourcePath = options?.sourcePath;
      let arEnDir = options?.arEnDir ?? null;
      const owner = BrowserWindow.fromWebContents(event.sender);

      if (!sourcePath) {
        const dialogOpts = {
          properties: ['openFile' as const],
          filters: [
            { name: t.arlexPackFileFilter, extensions: ['zip', 'sqlite', 'db'] },
          ],
        };
        const choice = await (owner ? dialog.showOpenDialog(owner, dialogOpts) : dialog.showOpenDialog(dialogOpts));
        if (choice.canceled || !choice.filePaths[0]) return null;
        sourcePath = choice.filePaths[0];

        // If user picked a raw .sqlite/.db file directly, also offer picking the ar_en folder
        if (/\.(?:sqlite|db)$/iu.test(sourcePath) && !arEnDir) {
          const folderOpts = {
            title: t.arlexPickArEnFolder,
            properties: ['openDirectory' as const],
          };
          const folderChoice = await (owner ? dialog.showOpenDialog(owner, folderOpts) : dialog.showOpenDialog(folderOpts));
          if (!folderChoice.canceled && folderChoice.filePaths[0]) {
            arEnDir = folderChoice.filePaths[0];
          }
        }
      }

      return await service.importArabicLexiconsPack({
        sourcePath,
        arEnDir,
        lang,
        onProgress: (progress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('dictionary:arabic-lexicons-progress', progress);
          }
        },
      });
    }
  );

  // KEY-413: Remove the Arabic Lexicons pack (rows + folder)
  ipcMain.handle('dictionary:remove-arabic-lexicons', async () => {
    const service = getDictService();
    return service.removeArabicLexiconsPack();
  });

  // KEY-413: Get root family for an entry in Hans Wehr, Lane, or al-Ghani
  ipcMain.handle('dictionary:root-family', async (_, dictId: string, entryId: number) => {
    try {
      const service = getDictService();
      return service.rootFamily(dictId, entryId);
    } catch (err) {
      console.warn('[IPC:dictionary:root-family] Error:', err);
      return null;
    }
  });

  // KEY-414: suggestions, dictionary order, lookup history and the Reading pad. Inputs are validated
  // in the services; a bad request returns { ok: false, error: 'invalid-request' }.
  const handled = <T>(name: string, run: () => T) => {
    try {
      return { ok: true as const, data: run() };
    } catch (err) {
      const message = (err as Error)?.message === 'invalid-request' ? 'invalid-request' : 'failed';
      if (message === 'failed') console.warn(`[IPC:dictionary:${name}] Error:`, err);
      return { ok: false as const, error: message };
    }
  };
  const prefs = () => new DictionaryPrefsService(getDatabase());
  ipcMain.handle('dictionary:suggest', (_, query: unknown) => handled('suggest', () => getDictService().suggest(query)));
  ipcMain.handle('dictionary:set-order', (_, ids: unknown) => handled('set-order', () => getDictService().setDictionaryOrder(ids)));
  ipcMain.handle('dictionary:history', () => handled('history', () => prefs().history()));
  ipcMain.handle('dictionary:history-add', (_, entry: unknown) => handled('history-add', () => prefs().addHistory(entry)));
  ipcMain.handle('dictionary:history-remove', (_, word: unknown) => handled('history-remove', () => prefs().removeHistory(word)));
  ipcMain.handle('dictionary:history-clear', () => handled('history-clear', () => prefs().clearHistory()));
  ipcMain.handle('dictionary:pad', () => handled('pad', () => prefs().pad()));
  ipcMain.handle('dictionary:pad-save', (_, state: unknown) => handled('pad-save', () => prefs().savePad(state)));

  ipcMain.handle('dictionary:set-science', async (_, id: string, science: string | null) => getDictService().setScience(id, science));

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
