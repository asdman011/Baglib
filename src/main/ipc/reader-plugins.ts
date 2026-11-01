/**
 * Baglib — Reader Plugins IPC Handlers (KEY-149)
 */

import { ipcMain } from 'electron';
import { getReaderPluginManager } from '../services/plugins/plugin-manager.service';

export function registerReaderPluginsIpc(): void {
  ipcMain.handle('plugins:list', () => {
    return getReaderPluginManager().listPlugins();
  });

  ipcMain.handle('plugins:enable', (_event, id: string, enabled: boolean) => {
    return getReaderPluginManager().enablePlugin(id, enabled);
  });

  ipcMain.handle('plugins:get-styles', () => {
    return getReaderPluginManager().getAggregatedCss();
  });

  ipcMain.handle('plugins:lookup-word', async (_event, word: string, lang?: string) => {
    return getReaderPluginManager().lookupWord(word, lang);
  });

  ipcMain.handle('plugins:get-tts-voices', async () => {
    return getReaderPluginManager().getTtsVoices();
  });
}
