type Port = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'>;
interface Pending { finish: (bitmap: ImageBitmap | null) => void }
interface PendingCall { resolve: (value: unknown) => void; reject: (error: Error) => void }

export interface PdfPageInfo {
  width: number;
  height: number;
  rotation: number;
  rawDims: { pageWidth: number; pageHeight: number; pageX: number; pageY: number };
}
export interface PdfRasterReady { pages: number; firstPage: PdfPageInfo }

export interface PdfRasterOptions {
  timeoutMs?: number;
  renderTimeoutMs?: number;
  onSourceFailed?: () => void;
}

const MAX_PENDING_RENDERS = 24;

export class PdfRasterClient {
  private pending = new Map<number, Pending>();
  private calls = new Map<number, PendingCall>();
  private sequence = 0;
  private available = false;
  private closed = false;
  private initializationTimer: ReturnType<typeof setTimeout>;
  private settleReady!: (value: PdfRasterReady | null) => void;
  private timeoutMs: number;
  private renderTimeoutMs: number;
  /** Resolves once the worker has parsed the document, or with null when it cannot serve this book. */
  readonly whenReady = new Promise<PdfRasterReady | null>(resolve => { this.settleReady = resolve; });

  constructor(private port: Port, url: string, assets: string, options: number | PdfRasterOptions = {}) {
    const settings = typeof options === 'number' ? { timeoutMs: options } : options;
    this.timeoutMs = settings.timeoutMs ?? 15000;
    this.renderTimeoutMs = settings.renderTimeoutMs ?? Math.min(this.timeoutMs, 1500);
    this.initializationTimer = setTimeout(() => this.dispose(), this.timeoutMs);
    port.onmessage = event => {
      const message = event.data;
      if (message.type === 'ready' && !this.closed) {
        clearTimeout(this.initializationTimer);
        this.available = true;
        this.settleReady({ pages: message.pages, firstPage: message.firstPage });
      } else if (message.type === 'bitmap') {
        const pending = this.pending.get(message.id);
        if (pending && !this.closed) pending.finish(message.bitmap);
        else message.bitmap?.close();
      } else if (message.type === 'error') {
        if (message.id === undefined) this.dispose();
        else this.pending.get(message.id)?.finish(null);
      } else if (message.type === 'result') {
        this.settleCall(message.id, call => call.resolve(message.value));
      } else if (message.type === 'call-error') {
        this.settleCall(message.id, call => call.reject(new Error('engine-failed')));
      } else if (message.type === 'source-failed') {
        settings.onSourceFailed?.();
        this.dispose();
      }
    };
    port.onerror = port.onmessageerror = () => this.dispose();
    try { port.postMessage({ type: 'init', url, assets }); }
    catch { this.dispose(); }
  }

  private settleCall(id: number, settle: (call: PendingCall) => void): void {
    const call = this.calls.get(id);
    if (!call) return;
    this.calls.delete(id);
    settle(call);
  }

  get ready(): boolean { return this.available && !this.closed; }

  render(page: number, scale: number, dpr: number, signal: AbortSignal): Promise<ImageBitmap | null> {
    if (!this.ready || signal.aborted || this.pending.size >= MAX_PENDING_RENDERS) return Promise.resolve(null);
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
      const timer = setTimeout(() => { cancel(); this.dispose(); }, this.renderTimeoutMs);
      this.pending.set(id, { finish });
      signal.addEventListener('abort', abort, { once: true });
      try { this.port.postMessage({ type: 'render', id, page, scale, dpr }); }
      catch { finish(null); }
    });
  }

  call<Result>(method: 'page-info' | 'text' | 'outline', page = 1): Promise<Result> {
    if (!this.ready) return Promise.reject(new Error('engine-failed'));
    return new Promise<Result>((resolve, reject) => {
      const id = ++this.sequence;
      this.calls.set(id, { resolve: resolve as (value: unknown) => void, reject });
      try { this.port.postMessage({ type: 'call', id, method, page }); }
      catch { this.settleCall(id, call => call.reject(new Error('engine-failed'))); }
    });
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.available = false;
    clearTimeout(this.initializationTimer);
    this.settleReady(null);
    for (const pending of [...this.pending.values()]) pending.finish(null);
    for (const call of this.calls.values()) call.reject(new Error('engine-failed'));
    this.calls.clear();
    try { this.port.postMessage({ type: 'dispose' }); } catch { }
    this.port.terminate();
  }
}
