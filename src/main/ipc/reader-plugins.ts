/**
 * Baglib — Reader Plugins IPC Handlers (KEY-149)
 */

import { ipcMain } from 'electron';
import { readerPluginManager } from '../services/plugins/plugin-manager.service';

export function registerReaderPluginsIpc(): void {
  ipcMain.handle('plugins:list', () => {
    return readerPluginManager.listPlugins();
  });

  ipcMain.handle('plugins:enable', (_event, id: string, enabled: boolean) => {
    return readerPluginManager.enablePlugin(id, enabled);
  });

  ipcMain.handle('plugins:get-styles', () => {
    return readerPluginManager.getAggregatedCss();
  });

  ipcMain.handle('plugins:lookup-word', async (_event, word: string, lang?: string) => {
    return readerPluginManager.lookupWord(word, lang);
  });

  ipcMain.handle('plugins:get-tts-voices', async () => {
    return readerPluginManager.getTtsVoices();
  });
}
