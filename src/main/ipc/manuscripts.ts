import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { getDatabase } from '../database/connection';
import { ManuscriptRepository } from '../database/repositories/manuscript.repository';
import { registerManuscriptExportIpc } from './manuscript-export';

function repository(event: IpcMainInvokeEvent): ManuscriptRepository {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.protocol === 'file:' && !url.hostname || url.origin === 'http://localhost:3000' || url.origin === 'http://127.0.0.1:3000')) throw new Error('invalid-request');
  return new ManuscriptRepository(getDatabase());
}
export function registerManuscriptIpc(): void {
  ipcMain.handle('manuscripts:updateSettings', (event, id, settings) => repository(event).updateSettings(id, settings));
  ipcMain.handle('manuscripts:list', (event, trashed) => repository(event).list(trashed === true));
  ipcMain.handle('manuscripts:create', (event, title, kind) => repository(event).create(title, kind));
  ipcMain.handle('manuscripts:rename', (event, id, title) => repository(event).rename(id, title));
  ipcMain.handle('manuscripts:trash', (event, id) => repository(event).trash(id));
  ipcMain.handle('manuscripts:restore', (event, id) => repository(event).restore(id));
  ipcMain.handle('manuscripts:documents', (event, id, trashed) => repository(event).documents(id, trashed === true));
  ipcMain.handle('manuscripts:document', (event, id) => repository(event).document(id));
  ipcMain.handle('manuscripts:createDocument', (event, id, title, parentId) => repository(event).createDocument(id, title, parentId));
  ipcMain.handle('manuscripts:renameDocument', (event, id, title) => repository(event).renameDocument(id, title));
  ipcMain.handle('manuscripts:moveDocument', (event, id, parentId, position) => repository(event).moveDocument(id, parentId, position));
  ipcMain.handle('manuscripts:trashDocument', (event, id) => repository(event).trashDocument(id));
  ipcMain.handle('manuscripts:restoreDocument', (event, id) => repository(event).restoreDocument(id));
  ipcMain.handle('manuscripts:save', (event, input) => repository(event).save(input));
  ipcMain.handle('manuscripts:checkpoint', (event, id) => repository(event).checkpoint(id));
  ipcMain.handle('manuscripts:history', (event, id) => repository(event).history(id));
  ipcMain.handle('manuscripts:restoreVersion', (event, id, revision) => repository(event).restoreVersion(id, revision));
  ipcMain.handle('manuscripts:search', (event, query, id) => repository(event).search(query, id));
  ipcMain.handle('manuscripts:backlinks', (event, target) => repository(event).backlinks(target));
  ipcMain.handle('manuscripts:links', (event, id) => repository(event).links(id));
  registerManuscriptExportIpc();
}
