import * as pdfjsLib from 'pdfjs-dist';
import { openPdfByteSource, type PdfByteSource } from '../../../shared/pdf-byte-source';
import { PdfRasterClient, type PdfPageInfo } from '../../../shared/pdf-raster-client';

export interface PdfOutlineEntry { title: string; page: number; items: PdfOutlineEntry[] }
type TextContent = Awaited<ReturnType<pdfjsLib.PDFPageProxy['getTextContent']>>;

let pdfWorkerInstance: Worker | null = null;
let pdfWorkerInitPromise: Promise<Worker | null> | null = null;
let spareHost: Worker | null = null;

const assetsUrl = () => new URL('./vendor/pdfjs/', window.location.href);
const rasterSupported = () => typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
const localScheme = (url: string) => /^(baglib-asset|local-pdf):/iu.test(url);

function createHost(): Worker {
  const assets = assetsUrl();
  const host = new Worker(new URL('pdf.raster.worker.mjs', assets), { type: 'module' });
  host.postMessage({ type: 'warm', assets: assets.href });
  return host;
}

/** Keeps one started host ready, so opening a book costs a message rather than worker and parser startup. */
export function warmPdfRasterHost(): void {
  if (typeof window === 'undefined' || spareHost || !rasterSupported()) return;
  try { spareHost = createHost(); } catch { spareHost = null; }
}

function takeHost(): Worker {
  const host = spareHost ?? createHost();
  spareHost = null;
  const replace = () => warmPdfRasterHost();
  if (typeof requestIdleCallback === 'function') requestIdleCallback(replace, { timeout: 2000 });
  else setTimeout(replace, 1000);
  return host;
}

/**
 * Instantiates a Blob-backed PDF.js core worker for documents that cannot use the raster host.
 * This eliminates dynamic import() CORS and origin failures in both dev and packaged Electron.
 */
export async function ensurePdfWorker(): Promise<Worker | null> {
  if (typeof window === 'undefined') return null;
  if (pdfjsLib.GlobalWorkerOptions.workerPort) return pdfjsLib.GlobalWorkerOptions.workerPort as Worker;
  if (pdfWorkerInstance) {
    pdfjsLib.GlobalWorkerOptions.workerPort = pdfWorkerInstance;
    return pdfWorkerInstance;
  }
  if (pdfWorkerInitPromise) return pdfWorkerInitPromise;
  pdfWorkerInitPromise = (async () => {
    try {
      const bundleUrl = '/vendor/pdfjs/pdf.worker.bundle.js';
      const mjsUrl = '/vendor/pdfjs/pdf.worker.min.mjs';
      // First preference: classic IIFE bundle which never fails with module syntax errors
      const testBundle = await fetch(bundleUrl, { method: 'HEAD' }).catch(() => null);
      const chosenUrl = testBundle?.ok ? bundleUrl : mjsUrl;
      const response = await fetch(chosenUrl);
      if (!response.ok) throw new Error(`Failed to fetch PDF worker from ${chosenUrl}: ${response.status} ${response.statusText}`);
      const blob = new Blob([await response.text()], { type: 'text/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      const worker = chosenUrl.endsWith('.mjs') ? new Worker(blobUrl, { type: 'module' }) : new Worker(blobUrl);
      pdfjsLib.GlobalWorkerOptions.workerPort = worker;
      pdfWorkerInstance = worker;
      return worker;
    } catch (err) {
      console.warn('[PdfViewDocument] Blob worker initialization fallback:', err);
      // Classic IIFE workerSrc executes safely in a classic worker context without import/export errors
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.bundle.js';
      return null;
    }
  })();
  return pdfWorkerInitPromise;
}

class LocalPdfRangeTransport extends pdfjsLib.PDFDataRangeTransport {
  constructor(private source: PdfByteSource, private signal: AbortSignal, private cancel: () => void, private fail: (error: unknown) => void) {
    super(source.length, source.initialData, false);
  }
  requestDataRange(begin: number, end: number): void {
    void this.source.read(begin, end).then(data => {
      if (!this.signal.aborted) this.onDataRange(begin, data);
    }).catch(error => { if (!this.signal.aborted) this.fail(error); });
  }
  abort(): void { this.cancel(); }
}

async function openRendererDocument(url: string, signal: AbortController, onSourceFailed: () => void): Promise<{ task: ReturnType<typeof pdfjsLib.getDocument>; document: pdfjsLib.PDFDocumentProxy }> {
  const [, byteSource] = await Promise.all([ensurePdfWorker(), localScheme(url) ? openPdfByteSource(url, signal.signal) : Promise.resolve(undefined)]);
  let rejectRange: ((error: unknown) => void) | undefined;
  let opened = false;
  const rangeFailure = new Promise<never>((_, reject) => { rejectRange = reject; });
  void rangeFailure.catch(() => undefined);
  const range = byteSource ? new LocalPdfRangeTransport(byteSource, signal.signal, () => signal.abort(), error => {
    rejectRange?.(error);
    if (opened) onSourceFailed();
  }) : undefined;
  const task = pdfjsLib.getDocument({
    url,
    ...(range ? { range, length: byteSource!.length } : {}),
    rangeChunkSize: 65536,
    disableAutoFetch: true,
    disableStream: true,
    cMapUrl: '/vendor/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
  });
  try {
    const document = await Promise.race([task.promise, rangeFailure]);
    opened = true;
    return { task, document };
  } catch (error) {
    await task.destroy().catch(() => undefined);
    throw error;
  }
}

function plainPageInfo(page: pdfjsLib.PDFPageProxy): PdfPageInfo {
  const viewport = page.getViewport({ scale: 1 });
  return { width: viewport.width, height: viewport.height, rotation: viewport.rotation, rawDims: viewport.rawDims as PdfPageInfo['rawDims'] };
}

/**
 * The one parser pipeline behind an open book. It normally lives in the raster host, where parsing and
 * painting never touch the renderer thread. A renderer-side PDF.js document opens only when the host is
 * unavailable, or lazily for a page whose content the host cannot draw, and it dies with this object.
 */
export class PdfViewDocument {
  private fallback?: ReturnType<typeof openRendererDocument>;
  private controller = new AbortController();
  private pages = new Map<number, Promise<PdfPageInfo>>();
  private destroyed = false;

  private constructor(private url: string, readonly numPages: number, private client: PdfRasterClient | null, private onSourceFailed: () => void, firstPage?: PdfPageInfo) {
    if (firstPage) this.pages.set(1, Promise.resolve(firstPage));
  }

  get usesRasterHost(): boolean { return Boolean(this.client?.ready); }

  static async open(url: string, signal: AbortSignal, onSourceFailed: () => void): Promise<PdfViewDocument> {
    if (rasterSupported() && localScheme(url)) {
      const assets = assetsUrl();
      const client = new PdfRasterClient(takeHost(), url, assets.href, { timeoutMs: 20000, renderTimeoutMs: 60000, onSourceFailed });
      const abort = () => client.dispose();
      signal.addEventListener('abort', abort, { once: true });
      const ready = await client.whenReady;
      signal.removeEventListener('abort', abort);
      if (signal.aborted) throw new Error('cancelled');
      if (ready) return new PdfViewDocument(url, ready.pages, client, onSourceFailed, ready.firstPage);
    }
    const created = new PdfViewDocument(url, 0, null, onSourceFailed);
    const { document } = await created.rendererDocument();
    if (signal.aborted) { await created.destroy(); throw new Error('cancelled'); }
    return Object.assign(created, { numPages: document.numPages });
  }

  private rendererDocument(): ReturnType<typeof openRendererDocument> {
    this.fallback ||= openRendererDocument(this.url, this.controller, this.onSourceFailed);
    return this.fallback;
  }

  pageInfo(page: number): Promise<PdfPageInfo> {
    let info = this.pages.get(page);
    if (!info) {
      info = this.client?.ready ? this.client.call<PdfPageInfo>('page-info', page) : this.rendererDocument().then(async ({ document }) => plainPageInfo(await document.getPage(page)));
      info.catch(() => this.pages.delete(page));
      this.pages.set(page, info);
    }
    return info;
  }

  async render(page: number, scale: number, dpr: number, signal: AbortSignal): Promise<ImageBitmap | null> {
    const bitmap = this.client?.ready ? await this.client.render(page, scale, dpr, signal) : null;
    if (bitmap || signal.aborted || this.destroyed) return bitmap;
    const { document } = await this.rendererDocument();
    if (signal.aborted) return null;
    const viewport = (await document.getPage(page)).getViewport({ scale });
    const canvas = new OffscreenCanvas(Math.max(1, Math.floor(viewport.width * dpr)), Math.max(1, Math.floor(viewport.height * dpr)));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('engine-failed');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const task = (await document.getPage(page)).render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport });
    const cancel = () => task.cancel();
    signal.addEventListener('abort', cancel, { once: true });
    try {
      await task.promise;
      return signal.aborted ? null : canvas.transferToImageBitmap();
    } catch (error) {
      if ((error as Error).name === 'RenderingCancelledException') return null;
      throw error;
    } finally { signal.removeEventListener('abort', cancel); }
  }

  async textContent(page: number): Promise<TextContent> {
    if (this.client?.ready) return this.client.call<TextContent>('text', page);
    const { document } = await this.rendererDocument();
    return (await document.getPage(page)).getTextContent();
  }

  async outline(): Promise<PdfOutlineEntry[]> {
    if (this.client?.ready) return this.client.call<PdfOutlineEntry[]>('outline');
    const { document } = await this.rendererDocument();
    const convert = async (items: Awaited<ReturnType<typeof document.getOutline>> | null): Promise<PdfOutlineEntry[]> => Promise.all((items ?? []).map(async item => {
      let page = 1;
      try {
        const destination = typeof item.dest === 'string' ? await document.getDestination(item.dest) : item.dest;
        if (Array.isArray(destination) && destination[0]) page = await document.getPageIndex(destination[0]) + 1;
      } catch { /* an unresolved destination keeps its entry on page one */ }
      return { title: (item.title || '').trim(), page, items: await convert(item.items) };
    }));
    return convert(await document.getOutline());
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.client?.dispose();
    this.controller.abort();
    const fallback = this.fallback;
    if (fallback) await fallback.then(({ task }) => task.destroy()).catch(() => undefined);
  }
}
