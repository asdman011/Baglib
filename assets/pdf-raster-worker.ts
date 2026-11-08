import * as pdfjs from 'pdfjs-dist';
import { openPdfByteSource, type PdfByteSource } from '../src/shared/pdf-byte-source';
import { renderWithoutOwned } from '../src/shared/pdf-owned-annotations';

const scope = globalThis as unknown as { fonts: FontFaceSet; postMessage: (message: unknown, transfer?: Transferable[]) => void; onmessage: ((event: MessageEvent) => void) | null };
let documentTask: ReturnType<typeof pdfjs.getDocument> | undefined;
let documentReady: Promise<pdfjs.PDFDocumentProxy> | undefined;
let controller: AbortController | undefined;
let renderTask: pdfjs.RenderTask | undefined;
let activeId: number | undefined;
let cancelled = new Set<number>();
const pending = new Set<number>();
let canvas: OffscreenCanvas | undefined;
let queue = Promise.resolve();
let coreWorker: Worker | undefined;

class WorkerFilters {
  addFilter() { throw new Error('unsupported-worker-filter'); }
  addHCMFilter() { throw new Error('unsupported-worker-filter'); }
  addAlphaFilter() { throw new Error('unsupported-worker-filter'); }
  addLuminosityFilter() { throw new Error('unsupported-worker-filter'); }
  addHighlightHCMFilter() { throw new Error('unsupported-worker-filter'); }
  destroy() {}
}

class WorkerRange extends pdfjs.PDFDataRangeTransport {
  constructor(private source: PdfByteSource, private signal: AbortSignal, private fail: (error: unknown) => void) {
    super(source.length, source.initialData, false);
  }
  requestDataRange(begin: number, end: number): void {
    void this.source.read(begin, end).then(data => { if (!this.signal.aborted) this.onDataRange(begin, data); }).catch(error => { if (!this.signal.aborted) this.fail(error); });
  }
}

/** Loading the parser ahead of time is what lets a warm host open a book without paying worker startup. */
function warmCore(assets: string): Worker {
  if (!coreWorker) {
    coreWorker = new Worker(new URL('pdf.worker.min.mjs', assets), { type: 'module' });
    pdfjs.GlobalWorkerOptions.workerPort = coreWorker;
  }
  return coreWorker;
}

async function initialize(url: string, assets: string): Promise<pdfjs.PDFDocumentProxy> {
  controller = new AbortController();
  warmCore(assets);
  const ownerDocument = { fonts: scope.fonts, createElement: (tag: string) => {
    if (tag !== 'canvas') throw new Error('unsupported-worker-dom');
    return new OffscreenCanvas(1, 1);
  } } as unknown as Document;
  let rejectRange!: (error: unknown) => void;
  const failure = new Promise<never>((_, reject) => { rejectRange = reject; });
  void failure.catch(() => undefined);
  const source = await openPdfByteSource(url, controller.signal);
  const range = new WorkerRange(source, controller.signal, error => {
    rejectRange(error);
    scope.postMessage({ type: 'source-failed', error: String(error) });
  });
  documentTask = pdfjs.getDocument({ range, length: source.length, url: new URL(url), ownerDocument, FilterFactory: WorkerFilters, useWorkerFetch: true, disableAutoFetch: true, disableStream: true, rangeChunkSize: 65536, cMapUrl: new URL('cmaps/', assets).href, cMapPacked: true, standardFontDataUrl: new URL('standard_fonts/', assets).href });
  return Promise.race([documentTask.promise, failure]);
}

async function pageInfo(document: pdfjs.PDFDocumentProxy, number: number) {
  const viewport = (await document.getPage(number)).getViewport({ scale: 1 });
  return { width: viewport.width, height: viewport.height, rotation: viewport.rotation, rawDims: viewport.rawDims };
}

type RawOutline = Awaited<ReturnType<pdfjs.PDFDocumentProxy['getOutline']>>;
async function outline(document: pdfjs.PDFDocumentProxy, items: RawOutline | null): Promise<unknown[]> {
  const result: unknown[] = [];
  for (const item of items ?? []) {
    let page = 1;
    try {
      const destination = typeof item.dest === 'string' ? await document.getDestination(item.dest) : item.dest;
      if (Array.isArray(destination) && destination[0]) page = await document.getPageIndex(destination[0]) + 1;
    } catch { /* an unresolved destination keeps its entry on page one */ }
    result.push({ title: (item.title || '').trim(), page, items: await outline(document, item.items) });
  }
  return result;
}

async function call(document: pdfjs.PDFDocumentProxy, method: string, page: number): Promise<unknown> {
  if (method === 'page-info') return pageInfo(document, page);
  if (method === 'text') return (await document.getPage(page)).getTextContent();
  if (method === 'outline') return outline(document, await document.getOutline());
  throw new Error('invalid-request');
}

scope.onmessage = event => {
  const message = event.data;
  if (message.type === 'warm') {
    warmCore(message.assets);
  } else if (message.type === 'init') {
    documentReady = initialize(message.url, message.assets);
    void documentReady.then(async document => scope.postMessage({ type: 'ready', pages: document.numPages, firstPage: await pageInfo(document, 1) }))
      .catch(error => scope.postMessage({ type: 'error', error: String(error) }));
  } else if (message.type === 'call') {
    void Promise.resolve(documentReady).then(document => {
      if (!document) throw new Error('invalid-request');
      return call(document, message.method, message.page);
    }).then(value => scope.postMessage({ type: 'result', id: message.id, value }), error => scope.postMessage({ type: 'call-error', id: message.id, error: String(error) }));
  } else if (message.type === 'cancel') {
    if (!pending.has(message.id)) return;
    cancelled.add(message.id);
    if (activeId === message.id) renderTask?.cancel();
  } else if (message.type === 'render') {
    pending.add(message.id);
    queue = queue.then(async () => {
      try {
        if (!documentReady || cancelled.has(message.id)) return;
        activeId = message.id;
        const document = await documentReady;
        const page = await document.getPage(message.page);
        if (cancelled.has(message.id)) return;
        const viewport = page.getViewport({ scale: message.scale });
        const width = Math.floor(viewport.width * message.dpr), height = Math.floor(viewport.height * message.dpr);
        if (width < 1 || height < 1 || width * height > 32 * 1024 * 1024) throw new Error('raster-size-limit');
        canvas ||= new OffscreenCanvas(width, height);
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('unsupported-worker-canvas');
        context.setTransform(message.dpr, 0, 0, message.dpr, 0, 0);
        renderTask = page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport, ...await renderWithoutOwned(document, page) });
        await renderTask.promise;
        if (cancelled.has(message.id)) return;
        const bitmap = canvas.transferToImageBitmap();
        scope.postMessage({ type: 'bitmap', id: message.id, bitmap }, [bitmap]);
      } catch (error) {
        if (!cancelled.has(message.id)) scope.postMessage({ type: 'error', id: message.id, error: String(error) });
      } finally {
        cancelled.delete(message.id);
        pending.delete(message.id);
        renderTask = undefined;
        activeId = undefined;
      }
    });
  } else if (message.type === 'dispose') {
    controller?.abort();
    renderTask?.cancel();
    void documentTask?.destroy();
    coreWorker?.terminate();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
};
