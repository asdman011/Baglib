import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { existsSync } from 'node:fs';
import { access, copyFile, mkdir, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { getDatabase } from '../database/connection';
import { settingsRepository } from '../database/repositories/settings.repository';
import { MaterialSaveService } from '../services/material-save';
import { pdfEngineTools } from '../services/pdf-editor/tools';
import { validateExportOptions, validateSavePolicy, type SavePolicy } from '../../shared/material-save';
import { MarkHistoryService } from '../services/mark-history';
import { translations } from '../../renderer/translations';
import { PdfTaskGate } from '../services/pdf-editor/task-gate';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const KNOWN = ['unsupported', 'engine-missing', 'busy', 'incident', 'no-backup', 'source-changed', 'invalid-request', 'nothing-to-undo', 'nothing-to-redo', 'history-unappliable', 'not-writable'];
const POLICY_KEY = 'save.policy.v1', FOLDER_KEY = 'save.backupFolder.v1';

const authorize = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.protocol === 'file:' && !url.hostname || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
};
const defaultFolder = () => path.join(app.getPath('userData'), 'emergency-copies');
export const backupFolder = () => settingsRepository.get<string>(FOLDER_KEY) || defaultFolder();
export const savePolicy = (): SavePolicy => validateSavePolicy(settingsRepository.get(POLICY_KEY));

let service: MaterialSaveService | null = null;
const taskGate = new PdfTaskGate();
let initialized = false;
let shutdownRequested = false;
let maintenanceTimer: ReturnType<typeof setInterval> | null = null;
export const runMaterialSaveTask = <T>(action: () => T | Promise<T>): Promise<T> => taskGate.run(action);
/** The one save service of the app (ADR-012). */
export function materialSave(): MaterialSaveService {
  if (!initialized) throw new Error('busy');
  service ??= new MaterialSaveService({
    db: getDatabase(),
    python: () => { const tools = pdfEngineTools(); return tools.python && existsSync(tools.python) ? tools.python : null; },
    helper: path.join(path.dirname(pdfEngineTools().script), 'baglib_marks.py'),
    staging: path.join(app.getPath('userData'), 'save-staging'),
    backupFolder,
  });
  return service;
}
let history: MarkHistoryService | null = null;
const markHistory = () => history ??= new MarkHistoryService(getDatabase(), materialSave());

export async function initializeMaterialSave(): Promise<void> {
  if (shutdownRequested) throw new Error('busy');
  if (initialized) return;
  taskGate.open();
  initialized = true;
  try {
    await runMaterialSaveTask(async () => {
      await materialSave().clearStaging();
      await materialSave().recoverInterrupted();
      await materialSave().cleanupExpired();
    });
  } catch (error) { console.error('[baglib:save] startup check', error); }
  if (shutdownRequested) return;
  maintenanceTimer = setInterval(() => {
    void runMaterialSaveTask(() => materialSave().cleanupExpired()).catch(error => console.error('[baglib:save] cleanup', error));
  }, 60 * 60 * 1000);
  maintenanceTimer.unref?.();
}

export async function shutdownMaterialSave(): Promise<void> {
  shutdownRequested = true;
  if (maintenanceTimer) clearInterval(maintenanceTimer);
  maintenanceTimer = null;
  await taskGate.close();
  initialized = false;
  service = null;
  history = null;
}

export function registerMaterialSaveIpc(): void {
  const handle = <T>(channel: string, action: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> | T) =>
    ipcMain.handle(channel, async (event, ...args): Promise<Result<T>> => {
      try { authorize(event); return { ok: true, data: await runMaterialSaveTask(() => action(event, ...args)) }; } catch (error) {
        const code = (error as Error).message;
        if (!KNOWN.includes(code)) console.error('[baglib:save]', error);
        return { ok: false, error: KNOWN.includes(code) ? code : 'save-failed' };
      }
    });
  const workId = (value: unknown) => { if (typeof value !== 'string' || !/^[\w-]{1,180}$/u.test(value)) throw new Error('invalid-request'); return value; };

  handle('material-save:policy', () => ({ policy: savePolicy(), backupFolder: backupFolder(), defaultFolder: defaultFolder() }));
  handle('material-save:set-policy', (_event, input) => { const policy = validateSavePolicy(input); settingsRepository.set(POLICY_KEY, policy); return policy; });
  handle('material-save:choose-folder', async (event, language) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = { title: translations[language === 'ar' ? 'ar' : 'en'].saveBackupFolder, defaultPath: backupFolder(), properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[] };
    const selection = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (selection.canceled || !selection.filePaths[0]) return null;
    const folder = selection.filePaths[0];
    await mkdir(folder, { recursive: true });
    await access(folder, constants.W_OK).catch(() => { throw new Error('not-writable'); });
    // Current copies move with the setting, so a file never has two emergency copies.
    const db = getDatabase();
    for (const row of db.prepare('SELECT source_id, backup_path FROM material_save_state WHERE backup_path IS NOT NULL').all() as { source_id: string; backup_path: string }[]) {
      const moved = path.join(folder, path.basename(row.backup_path));
      if (path.resolve(moved) === path.resolve(row.backup_path) || !existsSync(row.backup_path)) continue;
      await copyFile(row.backup_path, moved);
      db.prepare('UPDATE material_save_state SET backup_path = ? WHERE source_id = ?').run(moved, row.source_id);
      await rm(row.backup_path, { force: true });
    }
    settingsRepository.set(FOLDER_KEY, folder);
    return folder;
  });
  handle('material-save:status', (_event, id) => materialSave().status(workId(id)));
  handle('material-save:save', (_event, id) => materialSave().save(workId(id)));
  handle('material-save:export', async (event, id, input, language) => {
    const options = validateExportOptions(input);
    const file = materialSave().file(workId(id));
    if (!file) throw new Error('unsupported');
    const window = BrowserWindow.fromWebContents(event.sender);
    const words = translations[language === 'ar' ? 'ar' : 'en'];
    const dialogOptions = { title: words.exportPdfTitle, defaultPath: path.join(app.getPath('documents'), `${path.basename(file.path, path.extname(file.path))} (${words.exportPdfSuffix}).pdf`), filters: [{ name: 'PDF', extensions: ['pdf'] }] };
    const selection = window ? await dialog.showSaveDialog(window, dialogOptions) : await dialog.showSaveDialog(dialogOptions);
    if (selection.canceled || !selection.filePath) return null;
    const target = path.extname(selection.filePath).toLowerCase() === '.pdf' ? selection.filePath : `${selection.filePath}.pdf`;
    if (path.resolve(target).toLowerCase() === path.resolve(file.path).toLowerCase()) throw new Error('invalid-request');
    return { path: target, ...await materialSave().exportCopy(id as string, options, target) };
  });
  handle('material-save:restore-emergency', (_event, id) => materialSave().restoreEmergency(workId(id)));
  handle('material-save:resolve', (_event, id) => materialSave().resolveIncident(workId(id)));
  handle('material-save:undo', (_event, id) => markHistory().undo(workId(id)));
  handle('material-save:redo', (_event, id) => markHistory().redo(workId(id)));

}
