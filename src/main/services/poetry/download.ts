import { mkdir, open, rename, stat, truncate, unlink } from 'node:fs/promises';
import path from 'node:path';

export interface PoetryDownloadProgress { downloaded: number; total: number | null }

export async function downloadPoetryShard(url: string, target: string, signal: AbortSignal, progress: (value: PoetryDownloadProgress) => void): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  if (await stat(target).then(info => info.isFile()).catch(() => false)) return;
  const partial = `${target}.partial`;
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    try {
      let offset = await stat(partial).then(info => info.size).catch(() => 0);
      const response = await fetch(url, { headers: offset ? { Range: `bytes=${offset}-`, 'Accept-Encoding': 'identity' } : { 'Accept-Encoding': 'identity' }, signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]) });
      if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('poetry-download-failed'); }
      if (response.status === 206) {
        const match = /^bytes (\d+)-(\d+)\/(\d+)$/u.exec(response.headers.get('content-range') || '');
        if (!match || Number(match[1]) !== offset) { await response.body.cancel(); throw new Error('poetry-invalid-range'); }
      } else if (offset) {
        await truncate(partial, 0); offset = 0;
      }
      const rangeTotal = response.headers.get('content-range')?.split('/')[1];
      const length = Number(response.headers.get('content-length'));
      const total = rangeTotal ? Number(rangeTotal) : length > 0 ? offset + length : null;
      const file = await open(partial, 'a');
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          signal.throwIfAborted();
          await file.writeFile(chunk);
          offset += chunk.byteLength;
          progress({ downloaded: offset, total });
        }
        await file.sync();
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); await file.close(); }
      if (total !== null && offset !== total) throw new Error('poetry-incomplete-download');
      const check = await open(partial, 'r');
      try {
        const first = Buffer.alloc(4), last = Buffer.alloc(4);
        await check.read(first, 0, 4, 0); await check.read(last, 0, 4, offset - 4);
        if (first.toString() !== 'PAR1' || last.toString() !== 'PAR1') {
          await check.close(); await unlink(partial); throw new Error('poetry-invalid-parquet');
        }
      } finally { await check.close().catch(() => {}); }
      await rename(partial, target);
      return;
    } catch (error) {
      if (signal.aborted || attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}
