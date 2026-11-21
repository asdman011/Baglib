import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { getDatabasePath } from '../database/connection';
import { fetchResearchLinkPreview } from '../services/link-preview.service';
import { researchEditorAssets } from '../services/research-editor-assets';
import { researchEditorAvailable, researchEditorDirectory } from '../services/research-editor-serving';

export function editorDirectory(): string { return researchEditorDirectory(app.isPackaged, process.resourcesPath, app.getAppPath()); }
function authorize(event: IpcMainInvokeEvent): void {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.origin === 'http://localhost:3000' || url.origin === 'http://127.0.0.1:3000')) throw new Error('invalid-request');
}
export function registerResearchEditorIpc(): void {
  ipcMain.handle('researchEditor.available', event => { authorize(event); return researchEditorAvailable(editorDirectory()); });
  ipcMain.handle('researchEditor.blob.get', (event, id) => { authorize(event); return researchEditorAssets(getDatabasePath()).get(id); });
  ipcMain.handle('researchEditor.blob.set', (event, id, value) => { authorize(event); return researchEditorAssets(getDatabasePath()).set(id, value); });
  ipcMain.handle('researchEditor.blob.delete', (event, id) => { authorize(event); return researchEditorAssets(getDatabasePath()).delete(id); });
  ipcMain.handle('researchEditor.blob.list', event => { authorize(event); return researchEditorAssets(getDatabasePath()).list(); });
  ipcMain.handle('researchEditor.linkPreview', (event, url: unknown) => { authorize(event); return fetchResearchLinkPreview(url); });
}
