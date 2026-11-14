import { Worker } from 'node:worker_threads';
import path from 'node:path';
import type { SunnahResearchQuery, SunnahSearchHit } from '../../../shared/types/sunnah';
export class SunnahSearchProcess {
  private worker?: Worker;
  private sequence = 0;
  private timeout?: ReturnType<typeof setTimeout>;
  private idle?: ReturnType<typeof setTimeout>;
  private pending = new Map<number, { resolve: (hits: SunnahSearchHit[]) => void; reject: (error: Error) => void }>();
  constructor(private filename: string) {}
  search(query: SunnahResearchQuery): Promise<SunnahSearchHit[]> {
    if (this.pending.size) return Promise.reject(new Error('busy'));
    clearTimeout(this.idle);
    if (!this.worker) {
      const worker = new Worker(path.join(__dirname, 'sunnah-search-worker.js'), { workerData: { filename: this.filename } });
      this.worker = worker;
      worker.on('message', message => {
        const job = this.pending.get(message.id); if (!job) return;
        this.pending.delete(message.id); clearTimeout(this.timeout);
        this.idle = setTimeout(() => this.close(), 60000);
        if (message.ok) job.resolve(message.data); else job.reject(new Error('read-failed'));
      });
      const fail = () => { if (this.worker === worker) this.close(); };
      worker.once('error', fail); worker.once('exit', fail);
    }
    return new Promise((resolve, reject) => {
      this.timeout = setTimeout(() => this.close(), 30000);
      const id = ++this.sequence; this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ id, query });
    });
  }
  close(): void {
    clearTimeout(this.timeout); clearTimeout(this.idle);
    const worker = this.worker; this.worker = undefined;
    for (const job of this.pending.values()) job.reject(new Error('cancelled'));
    this.pending.clear(); if (worker) void worker.terminate();
  }
}
