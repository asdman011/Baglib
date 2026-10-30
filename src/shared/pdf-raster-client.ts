type Port = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'>;
interface Pending { finish: (bitmap: ImageBitmap | null) => void }

export class PdfRasterClient {
  private pending = new Map<number, Pending>();
  private sequence = 0;
  private available = false;
  private closed = false;
  private initializationTimer: ReturnType<typeof setTimeout>;

  constructor(private port: Port, url: string, assets: string, private timeoutMs = 15000) {
    this.initializationTimer = setTimeout(() => this.dispose(), timeoutMs);
    port.onmessage = event => {
      const message = event.data;
      if (message.type === 'ready' && !this.closed) { clearTimeout(this.initializationTimer); this.available = true; }
      else if (message.type === 'bitmap') {
        const pending = this.pending.get(message.id);
        if (pending && !this.closed) pending.finish(message.bitmap);
        else message.bitmap?.close();
      } else if (message.type === 'error') {
        if (message.id === undefined) this.dispose();
        else this.pending.get(message.id)?.finish(null);
      }
    };
    port.onerror = port.onmessageerror = () => this.dispose();
    try { port.postMessage({ type: 'init', url, assets }); }
    catch { this.dispose(); }
  }

  get ready(): boolean { return this.available && !this.closed; }

  render(page: number, scale: number, dpr: number, signal: AbortSignal): Promise<ImageBitmap | null> {
    if (!this.ready || signal.aborted || this.pending.size >= 8) return Promise.resolve(null);
    return new Promise(resolve => {
      const id = ++this.sequence;
      const finish = (bitmap: ImageBitmap | null) => {
        if (!this.pending.delete(id)) { bitmap?.close(); return; }
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        resolve(bitmap);
      };
      const cancel = () => { try { this.port.postMessage({ type: 'cancel', id }); } catch { } };
      const abort = () => { cancel(); finish(null); };
      const timer = setTimeout(() => { cancel(); this.dispose(); }, Math.min(this.timeoutMs, 1500));
      this.pending.set(id, { finish });
      signal.addEventListener('abort', abort, { once: true });
      try { this.port.postMessage({ type: 'render', id, page, scale, dpr }); }
      catch { finish(null); }
    });
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.available = false;
    clearTimeout(this.initializationTimer);
    for (const pending of [...this.pending.values()]) pending.finish(null);
    try { this.port.postMessage({ type: 'dispose' }); } catch { }
    this.port.terminate();
  }
}
