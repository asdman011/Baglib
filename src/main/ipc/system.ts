import * as ipcModule0 from 'electron';
import * as ipcModule1 from '../services/shield/content-shield.service';
import { errorMessage } from '../../shared/errors';
import { ipcMain, app, dialog, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { translations } from '../../renderer/translations';

/** Native dialogs follow the interface language the page reports; anything else falls back to English. */
export const dialogWords = (language: unknown) => translations[language === 'ar' ? 'ar' : 'en'];
export const bookFileFilters = (words: ReturnType<typeof dialogWords>) => [
  { name: words.dialogFilterAllBooks, extensions: ['pdf', 'epub', 'mobi', 'azw3', 'txt', 'html', 'djvu', 'docx'] },
  { name: words.dialogFilterPdf, extensions: ['pdf'] },
  { name: words.dialogFilterEbooks, extensions: ['epub', 'mobi', 'azw3'] },
  { name: words.dialogFilterText, extensions: ['txt', 'html', 'docx'] },
  { name: words.dialogFilterAll, extensions: ['*'] },
];

import { Worker } from 'node:worker_threads';

function extractPdfTextInWorker(filename: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'pdf-text-worker.js'), { workerData: { filename } });
    worker.once('message', (message: { result?: unknown; error?: string }) => {
      void worker.terminate();
      if (message.error) reject(new Error(message.error));
      else resolve(message.result ?? null);
    });
    worker.once('error', reject);
    worker.once('exit', code => reject(new Error(`pdf text worker exited with code ${code}`)));
  });
}

export function setupSystemIPC() {
  ipcMain.handle('system:get-info', () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: app.getVersion(),
      dataLocation: app.getPath('userData'),
      logsLocation: app.getPath('logs'),
    };
  });

  ipcMain.handle('system:open-logs', async () => {
    const folder = app.getPath('logs');
    await fs.promises.mkdir(folder, { recursive: true });
    return shell.openPath(folder);
  });

  // Native Electron OS File Picker Dialog
  ipcMain.handle('system:open-file-dialog', async (_event, language?: unknown) => {
    try {
      const words = dialogWords(language);
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        title: words.dialogPickBook,
        filters: bookFileFilters(words)
      });

      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
      return null;
    } catch (err) {
      console.error('Error in open-file-dialog:', err);
      return null;
    }
  });

  // Native Electron OS Multi-File Picker Dialog
  ipcMain.handle('system:open-files-dialog', async (_event, language?: unknown) => {
    try {
      const words = dialogWords(language);
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        title: words.dialogPickBooks,
        filters: bookFileFilters(words)
      });

      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths;
      }
      return [];
    } catch (err) {
      console.error('Error in open-files-dialog:', err);
      return [];
    }
  });

  // Native Electron OS Directory Picker Dialog
  ipcMain.handle('system:open-directory-dialog', async (_event, language?: unknown) => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: dialogWords(language).dialogPickScanFolder,
      });

      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
      return null;
    } catch (err) {
      console.error('Error in open-directory-dialog:', err);
      return null;
    }
  });

  // Save dropped in-memory file buffer to persistent local imports folder
  ipcMain.handle('system:save-file-buffer', async (_, { name, buffer }: { name: string; buffer: Uint8Array | number[] }) => {
    try {
      const importDir = path.join(app.getPath('userData'), 'imports');
      await fs.promises.mkdir(importDir, { recursive: true });
      const safeName = path.basename(name).replace(/[^a-zA-Z0-9.\-_ \u0600-\u06FF]/g, '_');
      const targetPath = path.join(importDir, `${Date.now()}-${safeName}`);
      await fs.promises.writeFile(targetPath, Buffer.from(buffer));
      return targetPath;
    } catch (err) {
      console.error('[baglib/system-ipc] save-file-buffer error:', err);
      return null;
    }
  });

  // Safe PDF Base64 Streamer
  ipcMain.handle('system:read-pdf-base64', async (_, filePath: string) => {
    try {
      let resolvedPath = filePath;

      if (!fs.existsSync(resolvedPath)) {
        const candidate1 = path.resolve(process.cwd(), '..', filePath);
        const candidate2 = path.resolve(process.cwd(), filePath);
        const candidate3 = path.join(app.getPath('userData'), 'imports', path.basename(filePath));
        if (fs.existsSync(candidate1)) resolvedPath = candidate1;
        else if (fs.existsSync(candidate2)) resolvedPath = candidate2;
        else if (fs.existsSync(candidate3)) resolvedPath = candidate3;
      }

      if (resolvedPath && fs.existsSync(resolvedPath)) {
        const buffer = fs.readFileSync(resolvedPath);
        return buffer.toString('base64');
      }
      return null;
    } catch (err) {
      console.error('Error reading file in IPC:', err);
      return null;
    }
  });

  // Smart PDF Text Extractor with Scanned / Watermark Detection
  ipcMain.handle('system:extract-pdf-text', async (_, filePath: string) => {
    try {
      let resolvedPath = filePath;

      if (!fs.existsSync(resolvedPath)) {
        const candidate1 = path.resolve(process.cwd(), '..', filePath);
        const candidate2 = path.resolve(process.cwd(), filePath);
        const candidate3 = path.join(app.getPath('userData'), 'imports', path.basename(filePath));
        if (fs.existsSync(candidate1)) resolvedPath = candidate1;
        else if (fs.existsSync(candidate2)) resolvedPath = candidate2;
        else if (fs.existsSync(candidate3)) resolvedPath = candidate3;
      }

      if (resolvedPath && fs.existsSync(resolvedPath)) return await extractPdfTextInWorker(resolvedPath);
      return null;
    } catch (err: unknown) {
      console.warn('[baglib:pdf-text] Could not extract text from PDF:', errorMessage(err) || err);
      return null;
    }
  });

  /**
   * Safely opens an external URL in the OS default web browser
   */
  ipcMain.handle('system:open-external', async (_, url: string) => {
    try {
      if (!url || typeof url !== 'string') return false;
      const { shell } = ipcModule0;
      await shell.openExternal(url);
      return true;
    } catch (err) {
      console.error('[baglib:system] open-external error:', err);
      return false;
    }
  });

  /**
   * Returns active status of uBlock-inspired content shield
   */
  ipcMain.handle('system:get-shield-status', async () => {
    try {
      const { ContentShieldService } = ipcModule1;
      return ContentShieldService.getInstance().getActiveShieldStatus();
    } catch (err) {
      console.error('[baglib:system] get-shield-status error:', err);
      return null;
    }
  });
}

