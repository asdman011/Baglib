/**
 * Baglib — Cloud Backup, KOReader Progress Sync & Snapshots IPC Handlers
 *
 * Registers IPC handlers connecting Electron renderer to:
 *   - KOReader sync protocol client & progress synchronization
 *   - Unified Multi-Cloud Storage (WebDAV, Nextcloud, S3, Dropbox, etc.)
 *   - Version snapshot engine with atomic rollback guarantee
 */

import { ipcMain } from 'electron';
import { koSyncService } from '../services/sync/ko-sync.service';
import { storageManagerService } from '../services/sync/storage-manager.service';
import { librarySnapshotService } from '../services/sync/library-snapshot.service';
import type { CloudConfig, KOSyncConfig } from '../../shared/types/cloud-sync';

export function registerCloudSyncIpc(): void {
  // --- KOReader Progress Sync ---
  ipcMain.handle('sync:koreader-get-config', async () => {
    return koSyncService.getConfig();
  });

  ipcMain.handle('sync:koreader-save-config', async (_, config: Partial<KOSyncConfig>) => {
    return koSyncService.saveConfig(config);
  });

  ipcMain.handle('sync:koreader-test', async (_, customConfig?: KOSyncConfig) => {
    return await koSyncService.testConnection(customConfig);
  });

  ipcMain.handle('sync:koreader-pull', async (_, bookId: string, customDigest?: string) => {
    return await koSyncService.pullProgress(bookId, customDigest);
  });

  ipcMain.handle(
    'sync:koreader-push',
    async (_, bookId: string, progress: string, percentage: number, customDigest?: string) => {
      return await koSyncService.pushProgress(bookId, progress, percentage, customDigest);
    },
  );

  // --- Multi-Cloud Storage & Backup ---
  ipcMain.handle('sync:cloud-get-config', async () => {
    return storageManagerService.getConfig();
  });

  ipcMain.handle('sync:cloud-save-config', async (_, config: Partial<CloudConfig>) => {
    return storageManagerService.saveConfig(config);
  });

  ipcMain.handle('sync:cloud-test', async (_, customConfig?: CloudConfig) => {
    return await storageManagerService.testConnection(customConfig);
  });

  ipcMain.handle('sync:cloud-list-files', async (_, remotePath?: string) => {
    return await storageManagerService.listFiles(remotePath);
  });

  ipcMain.handle('sync:cloud-backup', async (_, targetFileName?: string) => {
    return await storageManagerService.backupToCloud(targetFileName);
  });

  ipcMain.handle('sync:cloud-restore', async (_, remoteFileName: string) => {
    return await storageManagerService.restoreFromCloud(remoteFileName);
  });

  ipcMain.handle('sync:cloud-import-book', async (_, remotePath: string) => {
    return await storageManagerService.importBookFromCloud(remotePath);
  });

  // --- Snapshots & Rollback Guarantee ---
  ipcMain.handle('sync:snapshot-create', async (_, description?: string) => {
    return await librarySnapshotService.createSnapshot(description);
  });

  ipcMain.handle('sync:snapshot-list', async () => {
    return librarySnapshotService.listSnapshots();
  });

  ipcMain.handle('sync:snapshot-restore', async (_, snapshotFileName: string) => {
    return await librarySnapshotService.restoreSnapshot(snapshotFileName);
  });

  ipcMain.handle('sync:snapshot-delete', async (_, snapshotFileName: string) => {
    return librarySnapshotService.deleteSnapshot(snapshotFileName);
  });

  ipcMain.handle('sync:snapshot-export', async (_, snapshotFileName: string, destinationDir: string) => {
    return librarySnapshotService.exportSnapshot(snapshotFileName, destinationDir);
  });

  console.log('[baglib/ipc] Registered Cloud Sync, KOReader, and Snapshot IPC handlers.');
}
