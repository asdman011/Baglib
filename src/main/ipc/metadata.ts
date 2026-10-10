/**
 * Baglib — Metadata & Online Provider IPC Handlers
 */

import { ipcMain, app, shell } from 'electron';
import path from 'path';
import { libgenProvider } from '../services/metadata/libgen.provider';
import { annasProvider } from '../services/metadata/annas.provider';
import { ContentShieldService } from '../services/shield/content-shield.service';

export function setupMetadataIPC() {
  /**
   * Search Library Genesis for books and academic papers
   */
  ipcMain.handle('library:search-libgen', async (_, query: string, maxResults?: number) => {
    try {
      if (!query || typeof query !== 'string') return [];
      return await libgenProvider.search(query, maxResults || 25);
    } catch (err) {
      console.error('[baglib/metadata-ipc] Failed to search LibGen:', err);
      return [];
    }
  });

  /**
   * Search Anna's Archive for books and papers
   */
  ipcMain.handle('library:search-annas', async (_, query: string, maxResults?: number) => {
    try {
      if (!query || typeof query !== 'string') return [];
      return await annasProvider.search(query, maxResults || 25);
    } catch (err) {
      console.error('[baglib/metadata-ipc] Failed to search Anna\'s Archive:', err);
      return [];
    }
  });

  /**
   * Safe download through content shield
   */
  ipcMain.handle('library:safe-download', async (_, url: string, filename: string) => {
    try {
      if (!url) throw new Error('Missing download URL');
      const downloadsPath = app.getPath('downloads');
      const shield = ContentShieldService.getInstance();
      const savedPath = await shield.downloadFileDirectly(url, downloadsPath, filename);
      return { success: true, path: savedPath, filename };
    } catch (err: any) {
      console.error('[baglib/metadata-ipc] Safe download failed:', err);
      return { success: false, error: err?.message || 'Download failed' };
    }
  });

  /**
   * Reveal downloaded file in OS file explorer / finder
   */
  ipcMain.handle('library:show-item-in-folder', async (_, filePath: string) => {
    try {
      if (!filePath) return false;
      shell.showItemInFolder(filePath);
      return true;
    } catch (err) {
      console.error('[baglib/metadata-ipc] showItemInFolder error:', err);
      return false;
    }
  });

  /**
   * Open file with default OS application
   */
  ipcMain.handle('library:open-file', async (_, filePath: string) => {
    try {
      if (!filePath) return false;
      await shell.openPath(filePath);
      return true;
    } catch (err) {
      console.error('[baglib/metadata-ipc] openFile error:', err);
      return false;
    }
  });
}
