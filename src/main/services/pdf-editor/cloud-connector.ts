import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PdfCloudConfig, PdfCloudError, PdfCloudLink, PdfCloudProvider, PdfCloudStatus } from '../../../shared/types/pdf-cloud';
import { cloudId } from '../../../shared/types/pdf-cloud';
import type { PdfSource } from './source';
import { fileSha256 } from './source';
import { CloudDrive } from './cloud-drive';
import { CloudVault, type CloudStore } from './cloud-vault';
import { nativeCloudLogin } from './cloud-oauth';

interface LinkRecord extends PdfCloudLink { localHash: string; remoteRevision: string; remoteModified: string }
const linksKey = 'private.pdf-cloud.links.v1';
export interface CloudLocal {
  source(sourceId: string, workId: string): Promise<PdfSource>;
  import(bytes: Buffer, name: string, workId?: string): Promise<PdfSource>;
}
export class PdfCloudConnector {
  private logins = new Map<PdfCloudProvider, AbortController>();
  private locks = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;
  constructor(private vault: CloudVault, readonly drive: CloudDrive, private store: CloudStore, private local: CloudLocal, private openBrowser: (url: string) => Promise<void>) {}
  status(provider: PdfCloudProvider): PdfCloudStatus {
    const account = this.vault.read(provider);
    return { provider, clientId: account.config.clientId, tenant: account.config.tenant || 'common', connected: !!account.tokens, secureStorage: this.vault.available(), signingIn: this.logins.has(provider) };
  }
  configure(provider: PdfCloudProvider, value: PdfCloudConfig): PdfCloudStatus {
    if (!value || typeof value.clientId !== 'string' || value.clientId.length > 256 || value.clientId && !/^[A-Za-z0-9._-]+$/u.test(value.clientId) || value.tenant !== undefined && !/^(common|organizations|consumers|[a-fA-F0-9-]{36})$/u.test(value.tenant)) throw new Error('invalid-request');
    this.cancel(provider);
    const previous = this.vault.read(provider);
    const config = { clientId: value.clientId.trim(), tenant: value.tenant || 'common' };
    const same = previous.config.clientId === config.clientId && (previous.config.tenant || 'common') === config.tenant;
    this.vault.write(provider, { config, ...(same ? { tokens: previous.tokens } : {}) });
    if (!same) for (const link of this.records().filter(item => item.provider === provider)) this.update(link.id, { enabled: false });
    return this.status(provider);
  }
  async connect(provider: PdfCloudProvider, language: 'ar' | 'en'): Promise<PdfCloudStatus> {
    if (language !== 'ar' && language !== 'en') throw new Error('invalid-request');
    if (!this.vault.available()) throw new Error('secure-storage-unavailable');
    const account = this.vault.read(provider);
    if (!account.config.clientId) throw new Error('not-configured');
    if (this.logins.has(provider)) throw new Error('login-failed');
    // A fresh sign-in may select a different account; existing mappings require explicit re-enabling.
    for (const link of this.records().filter(item => item.provider === provider)) this.update(link.id, { enabled: false });
    const controller = new AbortController(); this.logins.set(provider, controller);
    try {
      const code = await nativeCloudLogin(provider, account.config.clientId, account.config.tenant || 'common', language, this.openBrowser, controller.signal);
      await this.drive.exchange(provider, code, controller.signal);
      this.store.set(linksKey, this.records().filter(item => item.provider !== provider));
      return this.status(provider);
    } finally { if (this.logins.get(provider) === controller) this.logins.delete(provider); }
  }
  cancel(provider: PdfCloudProvider): void { this.logins.get(provider)?.abort(); }
  disconnect(provider: PdfCloudProvider): void {
    this.cancel(provider); this.vault.clearTokens(provider);
    for (const link of this.records().filter(item => item.provider === provider)) this.update(link.id, { enabled: false });
  }
  private records(): LinkRecord[] { return this.store.get<LinkRecord[]>(linksKey) || []; }
  private update(id: string, fields: Partial<LinkRecord>): LinkRecord {
    const records = this.records(), index = records.findIndex(record => record.id === id);
    if (index < 0) throw new Error('invalid-request');
    records[index] = { ...records[index], ...fields }; this.store.set(linksKey, records); return records[index];
  }
  links(): PdfCloudLink[] { return this.records().map(link => ({ id: link.id, provider: link.provider, sourceId: link.sourceId, workId: link.workId, remoteId: link.remoteId, name: link.name, enabled: link.enabled, state: link.state, error: link.error, lastSync: link.lastSync })); }
  async import(provider: PdfCloudProvider, remoteId: string, workId?: string): Promise<PdfSource> {
    cloudId(remoteId); if (workId !== undefined) cloudId(workId);
    const download = await this.drive.download(provider, remoteId);
    return this.local.import(download.bytes, download.file.name, workId);
  }
  async export(provider: PdfCloudProvider, source: PdfSource, folder: string, name: string) {
    const bytes = await readFile(source.path);
    if (bytes.length > 256 * 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error('source-changed');
    return this.drive.upload(provider, bytes, cloudId(folder), name);
  }
  async link(provider: PdfCloudProvider, source: PdfSource, remoteId: string): Promise<PdfCloudLink> {
    if (!source.sourceId || !source.workId) throw new Error('invalid-request');
    cloudId(remoteId);
    const remote = await this.drive.download(provider, remoteId);
    const localHash = await fileSha256(source.path);
    if (source.sha256 !== localHash || createHash('sha256').update(remote.bytes).digest('hex') !== localHash) throw new Error('conflict');
    if (!remote.file.revision) throw new Error('conflict');
    const records = this.records();
    if (records.length >= 100 || records.some(item => item.sourceId === source.sourceId || item.provider === provider && item.remoteId === remoteId)) throw new Error('invalid-request');
    const link: LinkRecord = { id: randomUUID(), provider, sourceId: source.sourceId, workId: source.workId, remoteId, name: remote.file.name, enabled: false, state: 'idle', localHash, remoteRevision: remote.file.revision, remoteModified: remote.file.modified };
    this.store.set(linksKey, [...records, link]); return this.links().find(item => item.id === link.id)!;
  }
  setSync(id: string, enabled: boolean): void {
    cloudId(id); if (typeof enabled !== 'boolean') throw new Error('invalid-request');
    const record = this.records().find(item => item.id === id); if (!record) throw new Error('invalid-request');
    if (enabled && !this.status(record.provider).connected) throw new Error('not-connected');
    this.update(id, { enabled });
  }
  unlink(id: string): void {
    cloudId(id); if (this.locks.has(id)) throw new Error('invalid-request');
    this.store.set(linksKey, this.records().filter(item => item.id !== id));
  }
  async sync(id: string): Promise<PdfCloudLink> {
    cloudId(id);
    const record = this.records().find(item => item.id === id);
    if (!record || !record.enabled || this.locks.has(id)) throw new Error('invalid-request');
    this.locks.add(id); this.update(id, { state: 'syncing', error: undefined });
    try {
      const source = await this.local.source(record.sourceId, record.workId);
      const remote = await this.drive.metadata(record.provider, record.remoteId);
      if (!remote.revision) throw new Error('conflict');
      const localChanged = source.sha256 !== record.localHash, remoteChanged = remote.revision !== record.remoteRevision;
      if (localChanged && remoteChanged) throw new Error('conflict');
      if (localChanged) {
        const bytes = await readFile(source.path);
        if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error('source-changed');
        const uploaded = await this.drive.upload(record.provider, bytes, 'root', remote.name, { id: remote.id, revision: record.remoteRevision });
        this.update(id, { localHash: source.sha256, remoteRevision: uploaded.revision!, remoteModified: uploaded.modified });
      } else if (remoteChanged) {
        const download = await this.drive.download(record.provider, record.remoteId);
        if (await fileSha256(source.path) !== source.sha256) throw new Error('conflict');
        // Pulls create an Edition/Source; they never replace the local original or its annotations.
        const imported = await this.local.import(download.bytes, download.file.name, source.workId!);
        this.update(id, { sourceId: imported.sourceId!, localHash: imported.sha256, remoteRevision: download.file.revision!, remoteModified: download.file.modified });
      }
      this.update(id, { state: 'idle', error: undefined, lastSync: new Date().toISOString() });
    } catch (error) {
      const code = (error as Error).message;
      const safe = ['not-connected', 'permission-denied', 'source-changed', 'conflict', 'too-large', 'invalid-pdf', 'secure-storage-unavailable'].includes(code) ? code as PdfCloudError : 'network';
      this.update(id, { state: safe === 'conflict' || safe === 'source-changed' ? 'conflict' : 'error', error: safe, ...(['conflict', 'source-changed', 'not-connected'].includes(safe) ? { enabled: false } : {}) });
    } finally { this.locks.delete(id); }
    return this.links().find(item => item.id === id)!;
  }
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void (async () => { for (const link of this.records()) if (link.enabled && !this.locks.has(link.id)) await this.sync(link.id).catch(() => {}); })(); }, 60_000);
    this.timer.unref();
  }
  stop(): void { clearInterval(this.timer); this.timer = undefined; for (const controller of this.logins.values()) controller.abort(); }
}
