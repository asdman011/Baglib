import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { confirmedQuitCleanup } from '../services/quit-cleanup';
import type { SunnahCollectionId, SunnahResearchQuery, SunnahResult } from '../../shared/types/sunnah';
import { SunnahService } from '../services/sunnah/sunnah.service';
import { shareHadith } from '../services/sunnah/native-share';
import { translations } from '../../renderer/translations';

let hadithReader: ((collection: string, chapter: number, id: string) => Promise<{ text: string; number: string } | null>) | null = null;
/** One hadith's full Arabic text from the installed corpus, for other main-process features (the study assistant). */
export const readHadithText = (collection: string, chapter: number, id: string) => hadithReader ? hadithReader(collection, chapter, id) : Promise.resolve(null);

export function registerSunnahIpc(): void {
  let service: SunnahService | undefined;
  hadithReader = async (collection, chapter, id) => {
    const found = (await getService().chapter(collection as SunnahCollectionId, chapter)).hadiths.find(hadith => hadith.id === id);
    return found ? { text: found.text.ar.full || found.text.ar.matn, number: String(found.number) } : null;
  };
  const getService = () => service ??= new SunnahService(path.join(app.getPath('userData'), 'sunnah'), app.isPackaged ? [] : [
    path.join(app.getAppPath(), 'repos', 'Hadith', 'LK-Hadith-Corpus-master.zip'),
    path.join(app.getAppPath(), 'repos', 'LK-Hadith-Corpus-master.zip'),
  ], ['sunnah_merged_quranlab_v1.sqlite', 'sunnah_kutub_tisah_itqan.sqlite'].flatMap(name => [path.join(app.getPath('userData'), 'sunnah', name),
    ...(!app.isPackaged ? [path.join(app.getAppPath(), 'tools', 'hadith-alignment', 'data', 'output', name)] : [])]));
  confirmedQuitCleanup.register(() => service?.close());
  const result = async <Value>(action: () => Promise<Value>, error: 'invalid-corpus' | 'read-failed'): Promise<SunnahResult<Value>> => {
    try { return { ok: true, data: await action() }; } catch (cause) {
      console.error('[baglib:sunnah]', cause);
      return { ok: false, error };
    }
  };
  ipcMain.handle('sunnah:catalog', () => result(() => getService().catalog(), 'read-failed'));
  ipcMain.handle('sunnah:research', (_event, id: number) => result(() => getService().research(id), 'read-failed'));
  ipcMain.handle('sunnah:narrator', (_event, id: string) => result(() => getService().narrator(id), 'read-failed'));
  ipcMain.handle('sunnah:source', (_event, id: number, kind?: 'commentary' | 'matn') => result(async () => {
    const research = await getService().research(id);
    const url = kind === 'matn' ? research.matnUrl : research.sourceUrl;
    if (!/^https:\/\/shamela\.ws\/book\/\d+$/.test(url)) throw new Error('Invalid Shamela source');
    await shell.openExternal(url);
    return null;
  }, 'read-failed'));
  ipcMain.handle('sunnah:search', (_event, query: SunnahResearchQuery) => result(() => getService().search(query), 'read-failed'));
  ipcMain.handle('sunnah:statistics', () => result(() => getService().statistics(), 'read-failed'));
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
