type Cleanup = () => unknown | Promise<unknown>;

export class QuitCleanup {
  private callbacks = new Set<Cleanup>();
  private drains = new Set<Cleanup>();
  private closing: Promise<void> | undefined;

  register(callback: Cleanup): () => void {
    this.callbacks.add(callback);
    return () => { this.callbacks.delete(callback); };
  }

  registerDrain(callback: Cleanup): () => void {
    this.drains.add(callback);
    return () => { this.drains.delete(callback); };
  }

  run(): Promise<void> {
    this.closing ??= this.drain();
    return this.closing;
  }

  private async drain(): Promise<void> {
    while (this.drains.size) {
      const drains = [...this.drains];
      this.drains.clear();
      const results = await Promise.allSettled(drains.map(callback => Promise.resolve().then(callback)));
      for (const result of results) if (result.status === 'rejected') console.warn('[baglib:shutdown] Drain failed:', result.reason);
    }
    while (this.callbacks.size) {
      const callbacks = [...this.callbacks];
      this.callbacks.clear();
      const results = await Promise.allSettled(callbacks.map(callback => Promise.resolve().then(callback)));
      for (const result of results) if (result.status === 'rejected') console.warn('[baglib:shutdown] Cleanup failed:', result.reason);
    }
  }
}

export const confirmedQuitCleanup = new QuitCleanup();
