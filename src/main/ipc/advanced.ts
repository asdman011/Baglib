import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import { getDatabase } from '../database/connection';
import { readCatalog, databaseHealth, rebuildCatalogSearch } from '../services/catalog-maintenance';
import { catalogToCsv, type RebuildProgress } from '../../shared/catalog-export';
import { translations } from '../../renderer/translations';

function authorize(event: IpcMainInvokeEvent): void {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.protocol === 'file:' && !url.hostname || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
}

export function setupAdvancedIPC(): void {
  let rebuilding: Promise<RebuildProgress> | null = null;
  ipcMain.handle('advanced:export', async (event, format: unknown, language: unknown) => {
    authorize(event);
    if ((format !== 'json' && format !== 'csv') || (language !== 'ar' && language !== 'en')) throw new Error('invalid-request');
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) throw new Error('invalid-request');
    const choice = await dialog.showSaveDialog(owner, {
      title: translations[language].advancedExport,
      defaultPath: 'baglib-catalog.' + format,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (choice.canceled || !choice.filePath) return null;
    const catalog = readCatalog(getDatabase());
    const temporary = choice.filePath + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(temporary, format === 'json' ? JSON.stringify(catalog, null, 2) : catalogToCsv(catalog), { encoding: 'utf8', flag: 'wx' });
      await rename(temporary, choice.filePath);
    } finally { await rm(temporary, { force: true }); }
    return { path: choice.filePath };
  });
  ipcMain.handle('advanced:health', event => { authorize(event); return databaseHealth(getDatabase()); });
  ipcMain.handle('advanced:rebuild', event => {
    authorize(event);
    if (rebuilding) return rebuilding;
    rebuilding = rebuildCatalogSearch(getDatabase(), progress => {
      for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('advanced:rebuild-progress', progress);
    }).finally(() => { rebuilding = null; });
    return rebuilding;
  });
}
