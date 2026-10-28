import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { CloudCipher, CloudStore } from './cloud-vault';

export interface PdfAuditEntry { id: string; at: string; operation: string; sourceHash: string; outputHash: string; certificateFingerprint?: string; signer?: string; status: string; previous: string; mac: string }
const keyName = 'private.pdf-audit.key.v1', recordsName = 'private.pdf-audit.records.v1', headName = 'private.pdf-audit.head.v1';
/** Local tamper evidence. OS-account compromise or deletion of the entire database is outside this boundary. */
export class PdfAudit {
  constructor(private store: CloudStore, private cipher: CloudCipher) {}
  private key(): Buffer {
    if (!this.cipher.isEncryptionAvailable() || this.cipher.getSelectedStorageBackend?.() === 'basic_text') throw new Error('secure-storage-unavailable');
    const saved = this.store.get<string>(keyName);
    if (saved) return Buffer.from(this.cipher.decryptString(Buffer.from(saved, 'base64')), 'base64');
    if (this.store.get<PdfAuditEntry[]>(recordsName)?.length) throw new Error('invalid-output');
    const key = randomBytes(32); this.store.set(keyName, this.cipher.encryptString(key.toString('base64')).toString('base64')); return key;
  }
  private mac(entry: Omit<PdfAuditEntry, 'mac'>, key: Buffer): string { return createHmac('sha256', key).update(JSON.stringify(entry)).digest('hex'); }
  verify(): { valid: boolean; records: PdfAuditEntry[] } {
    const records = this.store.get<PdfAuditEntry[]>(recordsName) || [], key = this.key();
    let previous = '';
    for (const record of records) {
      const { mac, ...value } = record;
      const expected = this.mac(value, key);
      if (record.previous !== previous || !/^[a-f0-9]{64}$/u.test(mac) || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return { valid: false, records: [] };
      previous = mac;
    }
    const savedHead = this.store.get<string>(headName);
    if (records.length && (!savedHead || this.cipher.decryptString(Buffer.from(savedHead, 'base64')) !== previous)) return { valid: false, records: [] };
    if (!records.length && savedHead && this.cipher.decryptString(Buffer.from(savedHead, 'base64')) !== '') return { valid: false, records: [] };
    return { valid: true, records };
  }
  append(input: Pick<PdfAuditEntry, 'operation' | 'sourceHash' | 'outputHash' | 'status' | 'certificateFingerprint' | 'signer'>): void {
    const verified = this.verify(); if (!verified.valid) throw new Error('invalid-output');
    const entry = { id: randomUUID(), at: new Date().toISOString(), ...input, previous: verified.records.at(-1)?.mac || '' };
    const record = { ...entry, mac: this.mac(entry, this.key()) };
    this.store.set(recordsName, [...verified.records, record]);
    this.store.set(headName, this.cipher.encryptString(record.mac).toString('base64'));
  }
}
