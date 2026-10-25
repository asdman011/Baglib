import { parentPort } from 'node:worker_threads';
import { EbookMetadataExtractorService } from './services/digital/ebook-metadata-extractor.service';
import type { DigitalFormat } from '../shared/types/work';
import { installPdfDiagnosticFilter } from './services/digital/pdf-diagnostics';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

installPdfDiagnosticFilter();

const respond = (message: unknown) => {
  if (parentPort) parentPort.postMessage(message);
  else process.parentPort?.postMessage(message);
};

const extract = async (request: { filePath: string; format?: DigitalFormat; coverDirectory?: string }) => {
  try {
    const metadata = await EbookMetadataExtractorService.getInstance().extract(request.filePath, request.format);
    const { coverBuffer, ...result } = metadata;
    if (coverBuffer && request.coverDirectory) {
      const extension = metadata.coverMimeType === 'image/png' ? 'png' : metadata.coverMimeType === 'image/webp' ? 'webp' : metadata.coverMimeType === 'image/gif' ? 'gif' : 'jpg';
      const digest = createHash('sha256').update(coverBuffer).digest('hex');
      await mkdir(request.coverDirectory, { recursive: true });
      const coverPath = path.join(request.coverDirectory, `${digest}.${extension}`);
      const temporary = `${coverPath}.${randomUUID()}.tmp`;
      try { await writeFile(temporary, coverBuffer); await rename(temporary, coverPath); }
      finally { await rm(temporary, { force: true }); }
      respond({ metadata: { ...result, coverDataUrl: undefined, coverPath } });
    } else respond({ metadata: result });
  } catch (error) {
    respond({ error: String(error) });
  }
};

if (parentPort) parentPort.on('message', extract);
else process.parentPort?.on('message', event => { void extract(event.data); });
