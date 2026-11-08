export class ImportQueue {
  private pending: Promise<unknown> = Promise.resolve();
  private closing: Promise<void> | undefined;
  private accepting = true;

  constructor(private readonly dispose: () => void | Promise<void>) {}

  enqueue<Value>(action: () => Promise<Value>): Promise<Value> {
    if (!this.accepting) return Promise.reject(new Error('busy'));
    const job = this.pending.then(action);
    this.pending = job.catch(() => {});
    return job;
  }

  close(): Promise<void> {
    this.accepting = false;
    this.closing ??= this.pending.then(() => this.dispose());
    return this.closing;
  }
}
