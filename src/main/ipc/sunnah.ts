import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import type { SunnahCollectionId, SunnahResearchQuery, SunnahResult } from '../../shared/types/sunnah';
import { SunnahService } from '../services/sunnah/sunnah.service';
import { shareHadith } from '../services/sunnah/native-share';
import { translations } from '../../renderer/translations';

export function registerSunnahIpc(): void {
  let service: SunnahService | undefined;
  const getService = () => service ??= new SunnahService(path.join(app.getPath('userData'), 'sunnah'), app.isPackaged ? [] : [
    path.join(app.getAppPath(), 'repos', 'Hadith', 'LK-Hadith-Corpus-master.zip'),
    path.join(app.getAppPath(), 'repos', 'LK-Hadith-Corpus-master.zip'),
  ], [path.join(app.getPath('userData'), 'sunnah', 'sunnah_kutub_tisah_itqan.sqlite'),
    ...(!app.isPackaged ? [path.join(app.getAppPath(), 'tools', 'hadith-alignment', 'data', 'output', 'sunnah_kutub_tisah_itqan.sqlite')] : [])]);
  app.once('before-quit', () => service?.close());
  const result = async <Value>(action: () => Promise<Value>, error: 'invalid-corpus' | 'read-failed'): Promise<SunnahResult<Value>> => {
    try { return { ok: true, data: await action() }; } catch (cause) {
      console.error('[baglib:sunnah]', cause);
      return { ok: false, error };
    }
  };
  ipcMain.handle('sunnah:catalog', () => result(() => getService().catalog(), 'read-failed'));
  ipcMain.handle('sunnah:research', (_event, id: number) => result(() => getService().research(id), 'read-failed'));
  ipcMain.handle('sunnah:source', (_event, id: number) => result(async () => {
    const { sourceUrl } = await getService().research(id);
    if (!/^https:\/\/shamela\.ws\/book\/\d+$/.test(sourceUrl)) throw new Error('Invalid Shamela source');
    await shell.openExternal(sourceUrl);
    return null;
  }, 'read-failed'));
  ipcMain.handle('sunnah:search', (_event, query: SunnahResearchQuery) => result(() => getService().search(query), 'read-failed'));
  ipcMain.handle('sunnah:share', (event, text: string) => result(async () => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || event.senderFrame !== event.sender.mainFrame) throw new Error('Invalid share sender');
    await shareHadith(window, text);
    return null;
  }, 'read-failed'));
  ipcMain.handle('sunnah:chapter', (_event, collection: SunnahCollectionId, number: number) =>
    result(() => getService().chapter(collection, number), 'read-failed'));
  ipcMain.handle('sunnah:import', (_event, language?: string) => result(async () => {
    const selection = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: translations[language === 'ar' ? 'ar' : 'en'].sunnahSourceFiles, extensions: ['zip', 'sqlite', 'db'] }] });
    if (selection.canceled || !selection.filePaths[0]) return null;
    return /\.(sqlite|db)$/i.test(selection.filePaths[0]) ? getService().attachResearch(selection.filePaths[0]) : getService().importArchive(selection.filePaths[0]);
  }, 'invalid-corpus'));
}
