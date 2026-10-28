import type { PdfSession } from './pdf-editor';

export type PdfCloudProvider = 'google' | 'microsoft';
export type PdfCloudError = 'invalid-request' | 'not-configured' | 'not-connected' | 'secure-storage-unavailable' | 'login-failed' | 'login-cancelled' | 'login-timeout' | 'network' | 'permission-denied' | 'conflict' | 'too-large' | 'invalid-pdf' | 'source-changed' | 'storage';
export type PdfCloudResult<T> = { ok: true; data: T } | { ok: false; error: PdfCloudError };
export interface PdfCloudConfig { clientId: string; tenant?: string }
export interface PdfCloudStatus { provider: PdfCloudProvider; clientId: string; tenant: string; connected: boolean; secureStorage: boolean; signingIn: boolean }
export interface PdfCloudFile { id: string; name: string; folder: boolean; bytes: number; modified: string; revision?: string }
export interface PdfCloudPage { files: PdfCloudFile[]; next?: string }
export interface PdfCloudLink { id: string; provider: PdfCloudProvider; sourceId: string; workId: string; remoteId: string; name: string; enabled: boolean; state: 'idle' | 'syncing' | 'conflict' | 'error'; error?: PdfCloudError; lastSync?: string }
export interface PdfCloudAPI {
  status(provider: PdfCloudProvider): Promise<PdfCloudResult<PdfCloudStatus>>;
  configure(provider: PdfCloudProvider, config: PdfCloudConfig): Promise<PdfCloudResult<PdfCloudStatus>>;
  connect(provider: PdfCloudProvider, language: 'ar' | 'en'): Promise<PdfCloudResult<PdfCloudStatus>>;
  cancelLogin(provider: PdfCloudProvider): Promise<PdfCloudResult<null>>;
  disconnect(provider: PdfCloudProvider): Promise<PdfCloudResult<null>>;
  list(provider: PdfCloudProvider, folderId?: string, next?: string): Promise<PdfCloudResult<PdfCloudPage>>;
  import(provider: PdfCloudProvider, remoteId: string, workId?: string): Promise<PdfCloudResult<{ workId: string; session: PdfSession }>>;
  export(provider: PdfCloudProvider, sessionId: string, folderId: string, name: string): Promise<PdfCloudResult<PdfCloudFile>>;
  exportOutput(provider: PdfCloudProvider, jobId: string, outputIndex: number, folderId: string, name: string): Promise<PdfCloudResult<PdfCloudFile>>;
  links(): Promise<PdfCloudResult<PdfCloudLink[]>>;
  link(provider: PdfCloudProvider, sessionId: string, remoteId: string): Promise<PdfCloudResult<PdfCloudLink>>;
  setSync(id: string, enabled: boolean): Promise<PdfCloudResult<null>>;
  unlink(id: string): Promise<PdfCloudResult<null>>;
  sync(id: string): Promise<PdfCloudResult<PdfCloudLink>>;
}

export function cloudProvider(value: unknown): PdfCloudProvider {
  if (value !== 'google' && value !== 'microsoft') throw new Error('invalid-request');
  return value;
}
export function cloudId(value: unknown, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_!.-]{1,250}$/u.test(value) || value === '.' || value === '..') throw new Error('invalid-request');
  return value;
}
