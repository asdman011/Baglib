import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { getDatabasePath } from '../database/connection';
import { BoardStore } from '../services/boards';

const authorize = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.protocol === 'file:' && !url.hostname || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
};
// `<user data>/data/baglib.db` → `<user data>/boards`.
const store = (event: IpcMainInvokeEvent) => { authorize(event); return new BoardStore(path.join(path.dirname(path.dirname(getDatabasePath())), 'boards')); };
const boardId = (id: unknown) => (typeof id === 'string' ? id : '');

export function registerBoardsIpc(): void {
  const changed = (sender: Electron.WebContents) => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed() && window.webContents !== sender) window.webContents.send('boards:changed');
  };
  ipcMain.handle('boards:list', event => store(event).list());
  ipcMain.handle('boards:get', (event, id: unknown) => store(event).get(boardId(id)));
  ipcMain.handle('boards:save', (event, input: unknown) => { const board = store(event).save(input); changed(event.sender); return board; });
  ipcMain.handle('boards:remove', (event, id: unknown) => { store(event).remove(boardId(id)); changed(event.sender); });
}
