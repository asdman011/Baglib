import type { PdfCloudConfig, PdfCloudProvider } from '../../../shared/types/pdf-cloud';

export interface CloudTokens { access: string; refresh?: string; expires: number }
export interface CloudAccount { config: PdfCloudConfig; tokens?: CloudTokens }
export interface CloudStore { get<T>(key: string): T | undefined; set(key: string, value: unknown): void; delete(key: string): unknown }
export interface CloudCipher { isEncryptionAvailable(): boolean; encryptString(value: string): Buffer; decryptString(value: Buffer): string; getSelectedStorageBackend?(): string }
const prefix = 'private.pdf-cloud.v1:';
export class CloudVault {
  constructor(private store: CloudStore, private cipher: CloudCipher) {}
  available(): boolean { return this.cipher.isEncryptionAvailable() && this.cipher.getSelectedStorageBackend?.() !== 'basic_text'; }
  read(provider: PdfCloudProvider): CloudAccount {
    const value = this.store.get<string>(prefix + provider);
    if (!value) return { config: { clientId: '', tenant: 'common' } };
    if (!this.available()) throw new Error('secure-storage-unavailable');
    try { return JSON.parse(this.cipher.decryptString(Buffer.from(value, 'base64'))) as CloudAccount; }
    catch { throw new Error('secure-storage-unavailable'); }
  }
  write(provider: PdfCloudProvider, account: CloudAccount): void {
    if (!this.available()) throw new Error('secure-storage-unavailable');
    this.store.set(prefix + provider, this.cipher.encryptString(JSON.stringify(account)).toString('base64'));
  }
  clearTokens(provider: PdfCloudProvider): void { this.write(provider, { config: this.read(provider).config }); }
}
