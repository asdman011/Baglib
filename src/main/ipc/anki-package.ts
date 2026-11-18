/**
 * Baglib — IPC for lossless Anki package import and export (KEY-392).
 *
 * Files are chosen in main-process dialogs. A path from the renderer is accepted only for the live
 * harness, and only as a plain .apkg/.colpkg path (import) or .apkg path (export).
 */

import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { getDatabase } from '../database/connection';
import { AnkiImportService, type ReimportPolicy } from '../services/anki/apkg-import';
import { AnkiExportService } from '../services/anki/apkg-export';
import { translations } from '../../renderer/translations';

const KNOWN = ['invalid-request', 'anki-invalid-package', 'anki-package-too-new', 'anki-package-too-large', 'anki-invalid-collection'];
const POLICIES: ReimportPolicy[] = ['if-newer', 'always', 'never'];
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

const authorize = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !((url.protocol === 'app:' && url.hostname === '-') || (url.protocol === 'file:' && !url.hostname) || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
};

const failure = (error: unknown) => {
  const message = (error as Error)?.message ?? '';
  if (!KNOWN.includes(message)) console.warn('[IPC:anki-package]', error);
  return { ok: false as const, error: KNOWN.includes(message) ? message : 'failed' };
};

const plainPath = (value: unknown, pattern: RegExp): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096 || value.includes('\0') || !pattern.test(value)) throw new Error('invalid-request');
  return value;
};

const lang = (value: unknown): 'ar' | 'en' => (value === 'en' ? 'en' : 'ar');

export function registerAnkiPackageIpc(): void {
  ipcMain.handle('anki-package:import', async (event, input: unknown) => {
    try {
      authorize(event);
      const v = (input ?? {}) as Record<string, unknown>;
      if (Object.keys(v).some(k => !['filePath', 'policy', 'mergeNoteTypes', 'language'].includes(k))) throw new Error('invalid-request');
      const policy = POLICIES.includes(v.policy as ReimportPolicy) ? (v.policy as ReimportPolicy) : 'if-newer';
      let filePath = plainPath(v.filePath, /\.(?:apkg|colpkg)$/iu);
      if (!filePath) {
        const t = translations[lang(v.language)];
        const owner = BrowserWindow.fromWebContents(event.sender);
        const opts = { properties: ['openFile' as const], filters: [{ name: t.ankiPkgFileFilter, extensions: ['apkg', 'colpkg'] }] };
        const choice = await (owner ? dialog.showOpenDialog(owner, opts) : dialog.showOpenDialog(opts));
        if (choice.canceled || !choice.filePaths[0]) return { ok: true as const, data: null };
        filePath = choice.filePaths[0];
      }
      const report = new AnkiImportService(getDatabase()).importFile(filePath, { policy, mergeNoteTypes: v.mergeNoteTypes === true });
      return { ok: true as const, data: report };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('anki-package:export', async (event, input: unknown) => {
    try {
      authorize(event);
      const v = (input ?? {}) as Record<string, unknown>;
      if (Object.keys(v).some(k => !['filePath', 'deckIds', 'includeScheduling', 'includeMedia', 'defaultName', 'language'].includes(k))) throw new Error('invalid-request');
      const deckIds = Array.isArray(v.deckIds) ? v.deckIds.filter((d): d is string => typeof d === 'string' && SAFE_ID.test(d)).slice(0, 500) : undefined;
      let filePath = plainPath(v.filePath, /\.apkg$/iu);
      if (!filePath) {
        const t = translations[lang(v.language)];
        const base = typeof v.defaultName === 'string' ? v.defaultName.replace(/[\\/:*?"<>|\0]/gu, ' ').trim().slice(0, 120) : '';
        const owner = BrowserWindow.fromWebContents(event.sender);
        const opts = { defaultPath: `${base || 'BagLib'}.apkg`, filters: [{ name: t.ankiPkgFileFilter, extensions: ['apkg'] }] };
        const choice = await (owner ? dialog.showSaveDialog(owner, opts) : dialog.showSaveDialog(opts));
        if (choice.canceled || !choice.filePath) return { ok: true as const, data: null };
        filePath = choice.filePath;
      }
      const report = new AnkiExportService(getDatabase()).exportToFile(filePath, {
        deckIds,
        includeScheduling: v.includeScheduling !== false,
        includeMedia: v.includeMedia !== false,
      });
      return { ok: true as const, data: report };
    } catch (error) {
      return failure(error);
    }
  });
}
