import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import type { SunnahCollectionId, SunnahResult } from '../../shared/types/sunnah';
import { SunnahService } from '../services/sunnah/sunnah.service';
import { shareHadith } from '../services/sunnah/native-share';

export function registerSunnahIpc(): void {
  let service: SunnahService | undefined;
  const getService = () => service ??= new SunnahService(path.join(app.getPath('userData'), 'sunnah'), app.isPackaged ? [] : [
    path.join(app.getAppPath(), 'repos', 'Hadith', 'LK-Hadith-Corpus-master.zip'),
    path.join(app.getAppPath(), 'repos', 'LK-Hadith-Corpus-master.zip'),
  ]);
  const result = async <Value>(action: () => Promise<Value>, error: 'invalid-corpus' | 'read-failed'): Promise<SunnahResult<Value>> => {
    try { return { ok: true, data: await action() }; } catch (cause) {
      console.error('[baglib:sunnah]', cause);
      return { ok: false, error };
    }
  };
  ipcMain.handle('sunnah:catalog', () => result(() => getService().catalog(), 'read-failed'));
  ipcMain.handle('sunnah:share', (event, text: string) => result(async () => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || event.senderFrame !== event.sender.mainFrame) throw new Error('Invalid share sender');
    await shareHadith(window, text);
    return null;
  }, 'read-failed'));
  ipcMain.handle('sunnah:chapter', (_event, collection: SunnahCollectionId, number: number) =>
    result(() => getService().chapter(collection, number), 'read-failed'));
  ipcMain.handle('sunnah:import', () => result(async () => {
    const selection = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'ZIP', extensions: ['zip'] }] });
    if (selection.canceled || !selection.filePaths[0]) return null;
    return getService().importArchive(selection.filePaths[0]);
  }, 'invalid-corpus'));
}
