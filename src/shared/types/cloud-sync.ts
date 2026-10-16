/**
 * Baglib — Cloud Backup, KOReader Progress Sync, and Snapshot Types
 *
 * Defines unified multi-cloud storage configurations, KOReader protocol types,
 * remote file representations, and library snapshot metadata.
 */

export type CloudProviderType =
  | 'webdav'
  | 'nextcloud'
  | 's3'
  | 'dropbox'
  | 'gdrive'
  | 'onedrive'
  | 'box'
  | 'smb'
  | 'sftp'
  | 'local';

export interface WebDavConfig {
  url: string;
  username?: string;
  password?: string;
  basePath?: string;
}

export interface S3Config {
  endpoint: string;
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  pathStyle?: boolean;
}

export interface GenericCloudTokenConfig {
  token?: string;
  folderPath?: string;
}

export interface SmbConfig {
  host: string;
  share: string;
  username?: string;
  password?: string;
  domain?: string;
  path?: string;
}

export interface SftpConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  remotePath?: string;
}

export interface CloudConfig {
  provider: CloudProviderType;
  enabled: boolean;
  autoBackupOnClose?: boolean;
  webdav?: WebDavConfig;
  nextcloud?: WebDavConfig;
  s3?: S3Config;
  dropbox?: GenericCloudTokenConfig;
  gdrive?: GenericCloudTokenConfig;
  onedrive?: GenericCloudTokenConfig;
  box?: GenericCloudTokenConfig;
  smb?: SmbConfig;
  sftp?: SftpConfig;
  remoteBackupFolder?: string;
}

export interface RemoteFileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  lastModified?: string;
  etag?: string;
  mimeType?: string;
}

export interface KOSyncConfig {
  serverUrl: string; // e.g. 'https://sync.koreader.rocks'
  username: string;
  userkey?: string; // md5(password)
  password?: string;
  deviceName?: string;
  deviceId?: string;
  autoSyncOnOpenClose?: boolean;
  sendMetadata?: boolean;
}

export interface KOSyncProgress {
  document: string; // MD5 digest of the book file
  progress: string; // CFI string or page locator
  percentage: number; // 0.0 - 1.0 or 0 - 100
  device?: string;
  device_id?: string;
  timestamp?: number;
}

export interface LibrarySnapshotStats {
  booksCount: number;
  annotationsCount: number;
  settingsCount: number;
  databaseSizeBytes: number;
}

export interface LibrarySnapshotMetadata {
  id: string;
  fileName: string;
  timestamp: number;
  formattedDate: string;
  sizeBytes: number;
  description?: string;
  stats: LibrarySnapshotStats;
  appVersion: string;
  baglibVersion: string;
  checksum?: string;
}

export interface SyncOperationResult<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}
