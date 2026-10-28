/**
 * Baglib — Unified Multi-Cloud Storage Provider Interface
 *
 * Defines the unified contract for cloud backup, restore, and document import
 * across WebDAV, Nextcloud, S3, Dropbox, Google Drive, OneDrive, Box, SMB, and SFTP.
 */

import type { CloudProviderType, RemoteFileInfo, SyncOperationResult } from '../../../shared/types/cloud-sync';

export interface IStorageProvider {
  readonly providerType: CloudProviderType;

  /**
   * Tests connectivity, credentials, and directory/bucket access.
   */
  testConnection(): Promise<SyncOperationResult<{ reachable: boolean; details?: unknown }>>;

  /**
   * Lists files and folders at the specified remote path.
   */
  listFiles(remotePath?: string): Promise<RemoteFileInfo[]>;

  /**
   * Uploads a file from a local path or Buffer to the remote destination.
   */
  uploadFile(remotePath: string, localFilePathOrBuffer: string | Buffer): Promise<boolean>;

  /**
   * Downloads a remote file to a local destination file path.
   */
  downloadFile(remotePath: string, localDestinationPath: string): Promise<boolean>;

  /**
   * Reads a remote file into a Buffer in memory.
   */
  readFile(remotePath: string): Promise<Buffer | null>;

  /**
   * Deletes a file or directory at the remote path.
   */
  deleteFile(remotePath: string): Promise<boolean>;

  /**
   * Creates a remote folder/collection if it does not already exist.
   */
  createFolder?(remotePath: string): Promise<boolean>;
}
