export class PdfTaskGate {
  private state: 'idle' | 'open' | 'closing' | 'closed' = 'idle';
  private readonly pending = new Set<Promise<unknown>>();
  private closing: Promise<void> | null = null;

  open(): void {
    if (this.state === 'open') return;
    if (this.state !== 'idle') throw new Error('busy');
    this.state = 'open';
  }

  run<T>(action: () => T | Promise<T>): Promise<T> {
    if (this.state !== 'open') return Promise.reject(new Error('busy'));
    const task = Promise.resolve().then(action);
    this.pending.add(task);
    void task.then(() => this.pending.delete(task), () => this.pending.delete(task));
    return task;
  }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.state = 'closing';
    this.closing = Promise.allSettled([...this.pending]).then(() => { this.state = 'closed'; });
    return this.closing;
  }
}
