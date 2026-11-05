import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import { sourceUrls } from '../services/source-urls';

const authorize = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.protocol === 'file:' && !url.hostname || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
};

export function registerSourceUrlIpc(): void {
  ipcMain.handle('sources:get', event => { authorize(event); return sourceUrls.state(); });
  ipcMain.handle('sources:import-file', async event => {
    authorize(event);
    const options = { properties: ['openFile'] as 'openFile'[], filters: [{ name: 'JSON', extensions: ['json'] }] };
    const owner = BrowserWindow.fromWebContents(event.sender);
    const choice = await (owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options));
    if (choice.canceled || !choice.filePaths[0]) return null;
    if ((await stat(choice.filePaths[0])).size > 64 * 1024) throw new Error('invalid-source-file');
    return sourceUrls.apply(await readFile(choice.filePaths[0], 'utf8'));
  });
  ipcMain.handle('sources:update', (event, address: unknown) => { authorize(event); return sourceUrls.update(typeof address === 'string' ? address.trim() : ''); });
  ipcMain.handle('sources:reset', event => { authorize(event); return sourceUrls.reset(); });
}
