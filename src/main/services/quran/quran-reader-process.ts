import { utilityProcess } from 'electron';
import path from 'node:path';
import type { QuranPack, QuranReadQuery, QuranResult } from '../../../shared/types/quran';

type Action =
  | { action: 'catalog' }
  | { action: 'inspect-ayah'; query: { script: string; layout?: string; surah: number; ayah: number } }
  | { action: 'read'; query: QuranReadQuery }
  | { action: 'search'; query: { script: string; text: string } }
  | { action: 'commentary'; query: { script: string; pack: string; surah: number; ayah: number } }
  | { action: 'mushaf-page'; pack: string; page: number }
  | { action: 'mushaf-page-for-ayah'; pack: string; surah: number; ayah: number }
  | { action: 'recitation-audio'; pack: string; surah: number; ayah: number }
  | { action: 'recitation-surah'; pack: string; surah: number }
  | { action: 'surah-intro'; pack?: string; surah: number }
  | { action: 'ayah-themes'; pack?: string; surah: number; ayah?: number }
  | { action: 'ayah-topics'; pack?: string; surah: number; ayah: number }
  | { action: 'search-topics'; pack?: string; text: string };
export type QuranReaderRequest = Action & { id: number; root: string; packs: QuranPack[] };

export class QuranReaderProcess {
  private child?: Electron.UtilityProcess;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private sequence = 0;
  private idle?: ReturnType<typeof setTimeout>;
  request<Value>(root: string, packs: QuranPack[], action: Action): Promise<Value> {
    if (this.pending.size >= 6) return Promise.reject(new Error('busy'));
    clearTimeout(this.idle);
    if (!this.child) {
      const child = utilityProcess.fork(path.join(__dirname, 'quran-reader-worker.js'), [], { serviceName: 'Baglib Quran reader', stdio: 'ignore', execArgv: ['--max-old-space-size=512'] });
      this.child = child;
      child.on('message', (message: QuranResult<unknown> & { id: number }) => {
        const request = this.pending.get(message.id);
        if (!request) return;
        clearTimeout(request.timer);
        this.pending.delete(message.id);
        if (message.ok) request.resolve(message.data); else request.reject(new Error(message.error));
        if (!this.pending.size) this.idle = setTimeout(() => this.close(), 60000);
      });
      child.once('exit', () => { if (this.child === child) this.close(); });
    }
    const child = this.child;
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => this.close(), 60000);
      this.pending.set(id, { resolve: value => resolve(value as Value), reject, timer });
      const send = () => { if (this.pending.has(id)) child.postMessage({ ...action, id, root, packs } satisfies QuranReaderRequest); };
      if (child.pid) send(); else child.once('spawn', send);
    });
  }
  close(): void {
    clearTimeout(this.idle);
    const child = this.child;
    this.child = undefined;
    child?.kill();
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('interrupted')); }
    this.pending.clear();
  }
}
