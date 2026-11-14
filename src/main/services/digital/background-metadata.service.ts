import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { EbookMetadataExtractorService } from './ebook-metadata-extractor.service';
import { app, utilityProcess } from 'electron';
import { MetadataProcess } from './metadata-process';
import type { ExtractedEbookMetadata } from '../../../shared/types/digital-file';
import type { DigitalFormat } from '../../../shared/types/work';

export class BackgroundMetadataService extends EbookMetadataExtractorService {
  private worker?: Worker | MetadataProcess;
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private completed = 0;
  private readonly cache = new Map<string, ExtractedEbookMetadata>();

  constructor(private readonly workerPath = path.join(__dirname, 'metadata-worker.js'), private readonly timeoutMs = 120_000,
    private readonly coverDirectory = path.join(app?.getPath?.('userData') || path.resolve('.baglib-data'), 'covers')) { super(); }

  dispose(): void {
    this.disposed = true;
    void this.worker?.terminate();
    this.worker = undefined;
    this.cache.clear();
  }

  override extract(filePath: string, format?: DigitalFormat): Promise<ExtractedEbookMetadata> {
    const job = this.queue.then(async () => {
      if (this.disposed) throw new Error('Metadata worker disposed');
      const info = await stat(filePath);
      const resolvedFormat = format || this.formatFromPath(filePath);
      const key = JSON.stringify([filePath, info.size, info.mtimeMs, resolvedFormat]);
      const cached = this.cache.get(key);
      if (cached) return cached;
      const metadata = await this.run(filePath, resolvedFormat);
      if ((metadata.coverDataUrl?.length || 0) < 2 * 1024 * 1024) {
        this.cache.set(key, metadata);
        if (this.cache.size > 4) this.cache.delete(this.cache.keys().next().value!);
      }
      return metadata;
    });
    const checked = job.catch(error => {
      const failure = error instanceof Error ? error : new Error(String(error));
      throw Object.assign(failure, { code: 'METADATA_ERROR' });
    });
    this.queue = checked.catch(() => {});
    return checked;
  }

  private formatFromPath(filePath: string): DigitalFormat {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === '.fb2') return 'FB2';
    if (extension === '.cbz') return 'CBZ';
    if (['.htm', '.html', '.xhtml'].includes(extension)) return 'HTML';
    if (['.azw', '.azw3'].includes(extension)) return 'AZW3';
    if (['.mobi', '.prc'].includes(extension)) return 'MOBI';
    return extension === '.epub' ? 'EPUB' : extension === '.txt' ? 'TXT' : 'PDF';
  }

  private run(filePath: string, format?: DigitalFormat): Promise<ExtractedEbookMetadata> {
    if (!this.worker) {
      const created = typeof utilityProcess?.fork === 'function' && app?.isReady?.() ? new MetadataProcess(this.workerPath) : new Worker(this.workerPath, { resourceLimits: { maxOldGenerationSizeMb: 768 } });
      created.on('error', () => { if (this.worker === created) this.worker = undefined; void created.terminate(); });
      created.on('exit', () => { if (this.worker === created) this.worker = undefined; });
      this.worker = created;
    }
    const worker = this.worker;
    worker.unref();
    return new Promise((resolve, reject) => {
      const finish = (error?: Error, metadata?: ExtractedEbookMetadata) => {
        clearTimeout(timer);
        worker.removeListener('message', message);
        worker.removeListener('error', failed);
        worker.removeListener('exit', exited);
        if (error) {
          if (this.worker === worker) this.worker = undefined;
          void worker.terminate();
          reject(error);
        } else {
          this.completed++;
          if (this.completed >= 25) {
            this.completed = 0;
            if (this.worker === worker) this.worker = undefined;
            void worker.terminate();
          }
          resolve(metadata!);
        }
      };
      const message = (response: { metadata?: ExtractedEbookMetadata; error?: string }) => response.metadata ? finish(undefined, response.metadata) : finish(new Error(response.error || 'Metadata unavailable'));
      const failed = (error: Error) => finish(error);
      const exited = (code: number) => finish(new Error(`Metadata worker exited: ${code}`));
      const timer = setTimeout(() => finish(new Error('Metadata extraction timed out')), this.timeoutMs);
      worker.once('message', message);
      worker.once('error', failed);
      worker.once('exit', exited);
      worker.postMessage({ filePath, format, coverDirectory: this.coverDirectory });
    });
  }
}
