import { Worker } from 'node:worker_threads';
export class PoetryQueryProcess {
  private worker: Worker | null = null;
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor(private entry: string, private filename: string) {}
  query(operation: 'search' | 'detail' | 'facets' | 'variants' | 'poets', input?: unknown): Promise<unknown> {
    if (this.pending.size >= 32) return Promise.reject(new Error('poetry-busy'));
    if (!this.worker) {
      const worker = new Worker(this.entry, { workerData: { filename: this.filename } });
      this.worker = worker;
      worker.on('message', result => {
        const request = this.pending.get(result.id);
        if (!request) return;
        this.pending.delete(result.id); clearTimeout(request.timer);
        if (result.ok) request.resolve(result.data); else request.reject(new Error('poetry-query-failed'));
      });
      const fail = () => { if (this.worker === worker) this.close(); };
      worker.once('error', fail); worker.once('exit', fail);
    }
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => this.close(), 30_000);
      this.pending.set(id, { resolve, reject, timer });
      this.worker!.postMessage({ id, operation, input });
    });
  }
  close(): void {
    const worker = this.worker; this.worker = null;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('poetry-unavailable')); }
    this.pending.clear();
    if (worker) void worker.terminate();
  }
}
