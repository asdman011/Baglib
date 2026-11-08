import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { confirmedQuitCleanup } from '../services/quit-cleanup';
import { PoetryQueryProcess } from '../services/poetry/process';
import { PoetryProvisioner } from '../services/poetry/provision';
import { getDatabase as getMainDatabase } from '../database/connection';
import { PoetryKnowledgeService, validatePoetrySave } from '../services/poetry/knowledge';
import type { PoetryDetail } from '../../shared/types/poetry';
import { poetryOriginAllowed } from '../services/poetry/access';
import { PoetryNarrationService } from '../services/poetry/narration';
import { POETRY_NARRATION_AUDIO_EXTENSIONS } from '../../shared/poetry-narration';

export function registerPoetryIpc(): void {
  let provisioner: PoetryProvisioner | undefined;
  const provisioning = () => provisioner ??= new PoetryProvisioner(app.getAppPath(), app.getPath('userData'), app.isPackaged ? path.join(process.resourcesPath, 'poetry/parquet_rows.py') : path.join(app.getAppPath(), 'assets/poetry/parquet_rows.py'));
  let database: PoetryQueryProcess | undefined;
  const getDatabase = () => {
    if (!database) {
      database = new PoetryQueryProcess(path.join(__dirname, 'poetry-worker.js'), path.join(app.getPath('userData'), 'partitions', 'bayan_poetry.sqlite'));
    }
    return database;
  };
  const register = (channel: string, action: (input: unknown, event: Electron.IpcMainInvokeEvent) => unknown) => ipcMain.handle(channel, async (event, input: unknown) => {
    if (!poetryOriginAllowed(event.sender.getURL(), event.senderFrame === event.sender.mainFrame)) return { ok: false, error: 'permission-denied' };
    try { return { ok: true, data: await action(input, event) }; }
    catch (error) {
      const code = error instanceof Error ? error.message : '';
      return { ok: false, error: code === 'unsupported-poetry-narration' || code === 'invalid-poetry-narration' ? code : 'poetry-unavailable' };
    }
  });
  register('poetry:search', input => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid-poetry-query');
    return getDatabase().query('search', input);
  });
  register('poetry:detail', input => getDatabase().query('detail', input));
  register('poetry:facets', () => getDatabase().query('facets'));
  register('poetry:variants', () => getDatabase().query('variants'));
  register('poetry:poets', input => getDatabase().query('poets', input));
  register('poetry:provision', () => provisioning().start());
  register('poetry:status', () => provisioning().getStatus());
  register('poetry:save-knowledge', async input => {
    validatePoetrySave(input);
    const poem = await getDatabase().query('detail', input.poemId) as PoetryDetail | null;
    if (!poem) throw new Error('poetry-not-found');
    return new PoetryKnowledgeService(getMainDatabase()).save(input, poem);
  });
  register('poetry:saved', input => new PoetryKnowledgeService(getMainDatabase()).list(input === undefined ? 0 : input as number));
  const narrations = () => new PoetryNarrationService(getMainDatabase(), path.join(app.getPath('userData'), 'poetry-narrations'));
  register('poetry:narrations', input => narrations().list(input));
  register('poetry:narration-import-file', async (input, event) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid-poetry-narration');
    const value = input as { poemId: unknown; label?: unknown };
    const options: Electron.OpenDialogOptions = { properties: ['openFile'], filters: [{ name: 'Audio', extensions: POETRY_NARRATION_AUDIO_EXTENSIONS.map(extension => extension.slice(1)) }] };
    const owner = BrowserWindow.fromWebContents(event.sender);
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return null;
    return narrations().addFile(value.poemId, result.filePaths[0], value.label);
  });
  register('poetry:narration-save-recording', input => narrations().addRecording(input));
  register('poetry:narration-add-link', input => narrations().addLink(input));
  register('poetry:narration-delete', input => narrations().delete(input));
  confirmedQuitCleanup.register(() => provisioner?.close());
  app.once('will-quit', () => { database?.close(); database = undefined; });
}
