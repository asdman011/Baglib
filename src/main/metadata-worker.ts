import { parentPort } from 'node:worker_threads';
import { EbookMetadataExtractorService } from './services/digital/ebook-metadata-extractor.service';
import type { DigitalFormat } from '../shared/types/work';

parentPort?.on('message', async (request: { filePath: string; format?: DigitalFormat }) => {
  try {
    const metadata = await EbookMetadataExtractorService.getInstance().extract(request.filePath, request.format);
    const { coverBuffer: discardedCover, ...result } = metadata;
    void discardedCover;
    parentPort?.postMessage({ metadata: { ...result, coverDataUrl: (result.coverDataUrl?.length || 0) <= 512 * 1024 ? result.coverDataUrl : undefined } });
  } catch (error) {
    parentPort?.postMessage({ error: String(error) });
  }
});
