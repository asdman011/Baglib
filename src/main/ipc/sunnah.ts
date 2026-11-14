import { existsSync } from 'node:fs';
import { slashLane } from '../services/slash-search-jobs';
import { SunnahSearchProcess } from '../services/sunnah/search-process';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { confirmedQuitCleanup } from '../services/quit-cleanup';
import type { SunnahCollectionId, SunnahResearchQuery, SunnahResult } from '../../shared/types/sunnah';
import { SunnahService } from '../services/sunnah/sunnah.service';
import { shareHadith } from '../services/sunnah/native-share';
import { translations } from '../../renderer/translations';
import { sunnahResearchPaths } from '../services/sunnah/research-paths';

let hadithReader: ((collection: string, chapter: number, id: string) => Promise<{ text: string; number: string } | null>) | null = null;
/** One hadith's full Arabic text from the installed corpus, for other main-process features (the study assistant). */
export const readHadithText = (collection: string, chapter: number, id: string) => hadithReader ? hadithReader(collection, chapter, id) : Promise.resolve(null);
let chapterReader: ((collection: string, chapter: number) => Promise<{ id: string; number: string; text: string }[]>) | null = null;
/** KEY-319: every hadith of one chapter with its exact Arabic matn (or full text), for memorization decks. */
export const readChapterHadiths = (collection: string, chapter: number) => chapterReader ? chapterReader(collection, chapter) : Promise.resolve([]);

export function registerSunnahIpc(): void {
  let service: SunnahService | undefined;
  let slashSearch: SunnahSearchProcess | undefined;
  confirmedQuitCleanup.register(() => slashSearch?.close());
  const slashSunnah = slashLane();
  hadithReader = async (collection, chapter, id) => {
    const found = (await getService().chapter(collection as SunnahCollectionId, chapter)).hadiths.find(hadith => hadith.id === id);
    return found ? { text: found.text.ar.full || found.text.ar.matn, number: String(found.number) } : null;
  };
  chapterReader = async (collection, chapter) => (await getService().chapter(collection as SunnahCollectionId, chapter)).hadiths
    .map(hadith => ({ id: hadith.id, number: String(hadith.number), text: hadith.text.ar.matn || hadith.text.ar.full }));
  const getService = () => service ??= new SunnahService(path.join(app.getPath('userData'), 'sunnah'), app.isPackaged ? [] : [
    path.join(app.getAppPath(), 'repos', 'Hadith', 'LK-Hadith-Corpus-master.zip'),
    path.join(app.getAppPath(), 'repos', 'LK-Hadith-Corpus-master.zip'),
  ], sunnahResearchPaths({ packaged: app.isPackaged, userData: app.getPath('userData'), appPath: app.getAppPath(), resourcesPath: process.resourcesPath }));
  confirmedQuitCleanup.register(() => service?.close());
  const result = async <Value>(action: () => Promise<Value>, error: 'invalid-corpus' | 'read-failed'): Promise<SunnahResult<Value>> => {
    try { return { ok: true, data: await action() }; } catch (cause) {
      if (!(cause instanceof Error) || cause.message !== 'cancelled') console.error('[baglib:sunnah]', cause);
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
  ipcMain.handle('sunnah:search', (_event, query: SunnahResearchQuery) => result(async () => {
    if (!query?.requestId) return getService().search(query);
    if (!slashSearch) {
      let selected: string | undefined;
      try { selected = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(app.getPath('userData'), 'sunnah', 'research-source.json'), 'utf8')).filename; } catch { /* default attached corpus */ }
      const filename = [selected, ...sunnahResearchPaths({ packaged: app.isPackaged, userData: app.getPath('userData'), appPath: app.getAppPath(), resourcesPath: process.resourcesPath })].find(file => file && existsSync(file));
      if (!filename) throw new Error('read-failed');
      slashSearch = new SunnahSearchProcess(filename);
    }
    const searchWorker = slashSearch;
    return slashSunnah(query.requestId, () => searchWorker.search(query));
  }, 'read-failed'));
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
