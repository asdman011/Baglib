import { app } from 'electron';
import { errorMessage } from '../../../shared/errors';
/**
 * Baglib — Cloud Storage Manager Service
 *
 * Coordinates multi-cloud storage connections, cloud backup uploads,
 * remote backup restoration, and cloud book imports.
 */

import fs from 'fs';
import path from 'path';
import { settingsRepository } from '../../database/repositories/settings.repository';
import { librarySnapshotService } from './library-snapshot.service';
import { WebDavStorageProvider } from './providers/webdav-storage.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { GenericCloudProvider } from './providers/generic-cloud.provider';
import type { IStorageProvider } from './storage-provider.interface';
import type {
  CloudConfig,
  RemoteFileInfo,
  SyncOperationResult,
} from '../../../shared/types/cloud-sync';

const CLOUD_CONFIG_KEY = 'cloud_storage_config';

const DEFAULT_CLOUD_CONFIG: CloudConfig = {
  provider: 'webdav',
  enabled: false,
  autoBackupOnClose: false,
  remoteBackupFolder: 'Baglib/Backups',
  webdav: {
    url: '',
    username: '',
    password: '',
  },
  s3: {
    endpoint: '',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    region: 'us-east-1',
  },
};

export class StorageManagerService {
  public getConfig(): CloudConfig {
    const saved = settingsRepository.get<CloudConfig>(CLOUD_CONFIG_KEY);
    return { ...DEFAULT_CLOUD_CONFIG, ...saved };
  }

  public saveConfig(config: Partial<CloudConfig>): CloudConfig {
    const current = this.getConfig();
    const updated: CloudConfig = { ...current, ...config };
    settingsRepository.set(CLOUD_CONFIG_KEY, updated);
    return updated;
  }

  public getProvider(customConfig?: CloudConfig): IStorageProvider {
    const config = customConfig || this.getConfig();

    switch (config.provider) {
      case 'webdav':
        return new WebDavStorageProvider(config.webdav || { url: '' }, 'webdav');
      case 'nextcloud':
        return new WebDavStorageProvider(config.nextcloud || { url: '' }, 'nextcloud');
      case 's3':
        return new S3StorageProvider(
          config.s3 || { endpoint: '', bucket: '', accessKeyId: '', secretAccessKey: '' },
        );
      case 'dropbox':
      case 'gdrive':
      case 'onedrive':
      case 'box':
      case 'smb':
      case 'sftp':
        return new GenericCloudProvider(config.provider, config);
      default:
        return new WebDavStorageProvider(config.webdav || { url: '' }, 'webdav');
    }
  }

  public async testConnection(customConfig?: CloudConfig): Promise<SyncOperationResult<{ reachable: boolean; details?: unknown }>> {
    const provider = this.getProvider(customConfig);
    return await provider.testConnection();
  }

  public async listFiles(remotePath?: string, customConfig?: CloudConfig): Promise<RemoteFileInfo[]> {
    const provider = this.getProvider(customConfig);
    const targetPath = remotePath ?? (this.getConfig().remoteBackupFolder || '');
    return await provider.listFiles(targetPath);
  }

  /**
   * Creates a snapshot of the local database and uploads it to cloud storage.
   */
  public async backupToCloud(targetFileName?: string): Promise<SyncOperationResult<{ fileName: string; remotePath: string }>> {
    const config = this.getConfig();
    const provider = this.getProvider(config);

    // 1. Create a fresh snapshot
    const snapResult = await librarySnapshotService.createSnapshot('Cloud Backup');
    if (!snapResult.success || !snapResult.data) {
      return { success: false, message: `Snapshot creation failed: ${snapResult.message}` };
    }

    const snapshot = snapResult.data;
    const localSnapshotPath = path.join(librarySnapshotService.getSnapshotsDirectory(), snapshot.fileName);

    // 2. Determine remote destination path
    const remoteFolder = (config.remoteBackupFolder || 'Baglib/Backups').replace(/^\/+|\/+$/g, '');
    const remoteName = targetFileName || snapshot.fileName;
    const remotePath = `${remoteFolder}/${remoteName}`;

    // 3. Upload to cloud provider
    try {
      const uploaded = await provider.uploadFile(remotePath, localSnapshotPath);
      if (uploaded) {
        return {
          success: true,
          message: `Backup uploaded to cloud successfully: ${remotePath}`,
          data: { fileName: remoteName, remotePath },
        };
      }
      return { success: false, message: `Cloud upload failed for destination: ${remotePath}` };
    } catch (e: unknown) {
      return { success: false, message: `Cloud upload error: ${errorMessage(e)}` };
    }
  }

  /**
   * Downloads a backup from the cloud and executes the atomic safe restore pipeline.
   */
  public async restoreFromCloud(remoteFileNameOrPath: string): Promise<SyncOperationResult<{ restored: boolean }>> {
    const config = this.getConfig();
    const provider = this.getProvider(config);

    let remotePath = remoteFileNameOrPath;
    if (!remotePath.includes('/')) {
      const folder = (config.remoteBackupFolder || 'Baglib/Backups').replace(/^\/+|\/+$/g, '');
      remotePath = `${folder}/${remoteFileNameOrPath}`;
    }

    const localFileName = path.basename(remotePath);
    const localDestination = path.join(librarySnapshotService.getSnapshotsDirectory(), localFileName);

    try {
      // 1. Download file
      const downloaded = await provider.downloadFile(remotePath, localDestination);
      if (!downloaded || !fs.existsSync(localDestination)) {
        return { success: false, message: `Failed to download remote backup from: ${remotePath}` };
      }

      // 2. Perform atomic restore with rollback protection
      const restoreResult = await librarySnapshotService.restoreSnapshot(localDestination);
      return restoreResult;
    } catch (e: unknown) {
      return { success: false, message: `Failed restoring from cloud: ${errorMessage(e)}` };
    }
  }

  /**
   * Downloads a book file from the cloud into the local downloads/managed directory for library import.
   */
  public async importBookFromCloud(remotePath: string): Promise<SyncOperationResult<{ localFilePath: string }>> {
    const provider = this.getProvider();
    const fileName = path.basename(remotePath);

    let tempDir = '';
    try {


      if (app && typeof app.getPath === 'function') {
        tempDir = path.join(app.getPath('userData'), 'cloud-imports');
      }
    } catch {
      tempDir = path.join(process.cwd(), '.baglib-cloud-imports');
    }

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const localFilePath = path.join(tempDir, fileName);

    try {
      const downloaded = await provider.downloadFile(remotePath, localFilePath);
      if (downloaded && fs.existsSync(localFilePath)) {
        return {
          success: true,
          message: `Book downloaded from cloud: ${fileName}`,
          data: { localFilePath },
        };
      }
      return { success: false, message: `Failed downloading ${remotePath}` };
    } catch (e: unknown) {
      return { success: false, message: `Error importing book from cloud: ${errorMessage(e)}` };
    }
  }
}

export const storageManagerService = new StorageManagerService();
