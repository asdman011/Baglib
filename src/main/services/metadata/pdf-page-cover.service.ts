import { app, BrowserWindow } from 'electron';
import { readFile, stat, mkdir, writeFile, rename, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

export interface PdfPageCover {
  coverUrl: string;
  currentPage: number;
  totalPages: number;
  documentPages: number;
}

export class PdfPageCoverService {
  private window?: BrowserWindow;
  private pending: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private readonly cache = new Map<string, PdfPageCover>();

  constructor(private readonly assets = path.join(app.getAppPath(), app.isPackaged ? 'out' : 'src/renderer/public', 'vendor/pdfjs')) {}

  render(filePath: string, page = 1): Promise<PdfPageCover> {
    return this.renderPages(filePath, [page]).then(pages => pages[0]);
  }

  renderPages(filePath: string, pages = [1, 2, 3, 4, 5], width = 750): Promise<PdfPageCover[]> {
    const job = this.pending.then(() => this.execute(filePath, pages, width));
    this.pending = job.catch(() => {});
    return job;
  }

  dispose(): void {
    this.disposed = true;
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = undefined;
    this.cache.clear();
  }

  private async getWindow(): Promise<BrowserWindow> {
    if (this.disposed) throw new Error('PDF cover renderer disposed');
    if (this.window && !this.window.isDestroyed()) return this.window;
    const candidates = BrowserWindow.getAllWindows();
    const owner = candidates.find(candidate => candidate.isVisible()) || candidates[0];
    const window = new BrowserWindow({ show: false, parent: owner, webPreferences: { partition: 'baglib-pdf-covers', sandbox: true, nodeIntegration: false, contextIsolation: true, backgroundThrottling: false, webgl: false } });
    const close = () => { if (!window.isDestroyed()) window.destroy(); if (this.window === window) this.window = undefined; };
    owner?.once('closed', close);
    window.once('closed', () => owner?.removeListener('closed', close));
    this.window = window;
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    window.webContents.session.webRequest.onBeforeRequest((_details, callback) => callback({ cancel: !/^(file|blob|data):/.test(_details.url) }));
    try {
      await window.loadFile(path.join(this.assets, 'pdf-cover-frame.html'));
      const workerScript = await readFile(path.join(this.assets, 'pdf.worker.min.mjs'), 'utf8');
      await window.webContents.executeJavaScript(`window.initializeCoverRenderer(${JSON.stringify({ workerScript })})`);
      return window;
    } catch (error) { close(); throw error; }
  }

  private async execute(filePath: string, pages: number[], width: number): Promise<PdfPageCover[]> {
    if (!path.isAbsolute(filePath) || !pages.length || pages.length > 5 || pages.some(page => !Number.isSafeInteger(page)) || !Number.isFinite(width) || width < 100 || width > 1500) throw new Error('Invalid PDF cover request');
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('PDF path is not a file');
    const key = JSON.stringify([path.resolve(filePath), info.size, info.mtimeMs, width]);
    const hits: PdfPageCover[] = [];
    for (const page of pages) {
      const hit = this.cache.get(`${key}:${page}`);
      if (!hit) break;
      try { await access(hit.coverUrl); } catch { break; }
      hits.push(hit);
    }
    if (hits.length === pages.length) return hits;
    const window = await this.getWindow();
    const contents = window.webContents;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const gone = () => rejectGone(new Error('PDF cover renderer exited'));
    let rejectGone: (error: Error) => void = () => {};
    const failure = new Promise<never>((_resolve, reject) => {
      rejectGone = reject;
      timeout = setTimeout(() => reject(new Error('PDF page rendering timed out')), 60_000);
    });
    contents.once('render-process-gone', gone);
    try {
      const request = { url: pathToFileURL(filePath).href, pages, width, cMapUrl: pathToFileURL(path.join(this.assets, 'cmaps') + path.sep).href, standardFontDataUrl: pathToFileURL(path.join(this.assets, 'standard_fonts') + path.sep).href };
      const rendered = await Promise.race([window.webContents.executeJavaScript(`window.renderCoverPages(${JSON.stringify(request)})`) as Promise<(PdfPageCover & { dataUrl: string })[]>, failure]);
      const directory = path.join(app.getPath('userData'), 'covers');
      await mkdir(directory, { recursive: true });
      const results: PdfPageCover[] = [];
      for (const image of rendered) {
        if (!image.dataUrl.startsWith('data:image/jpeg;base64,')) throw new Error('Invalid rendered PDF cover');
        const digest = createHash('sha256').update(`${key}:${image.currentPage}`).digest('hex');
        const coverUrl = path.join(directory, `pdf-page-${digest}.jpg`);
        const temporary = `${coverUrl}.${randomUUID()}.tmp`;
        try { await writeFile(temporary, Buffer.from(image.dataUrl.split(',')[1], 'base64')); await rename(temporary, coverUrl); }
        finally { await rm(temporary, { force: true }); }
        const result = { coverUrl, currentPage: image.currentPage, totalPages: image.totalPages, documentPages: image.documentPages };
        this.cache.set(`${key}:${image.currentPage}`, result);
        if (this.cache.size > 30) this.cache.delete(this.cache.keys().next().value!);
        results.push(result);
      }
      return results;
    } catch (error) {
      if (!window.isDestroyed()) window.destroy();
      if (this.window === window) this.window = undefined;
      throw error;
    } finally {
      clearTimeout(timeout);
      if (!contents.isDestroyed()) contents.removeListener('render-process-gone', gone);
    }
  }
}

let singleton: PdfPageCoverService | undefined;
export function getPdfPageCoverService(): PdfPageCoverService {
  if (!singleton) {
    singleton = new PdfPageCoverService();
    app.once('before-quit', () => singleton?.dispose());
  }
  return singleton;
}
