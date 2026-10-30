import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { downloadPoetryShard } from './download';

export const POETRY_SHARDS = [
  { filename: '0000.parquet', size: 126379298, sha256: '75cffe4e2fb5a44855eba3ed695fbdd8931b6d9e36f22f413466ff5574d6a467' },
  { filename: '0001.parquet', size: 150989177, sha256: '6a5ff88137ce13653ef042d09a108b1ea6f7dfa5e221c9ec3abe92b6bd5cc04c' },
] as const;

export async function downloadPoetryCorpus(root: string, signal: AbortSignal, progress: (downloaded: number, total: number) => void): Promise<string[]> {
  const manifest = [];
  const total = POETRY_SHARDS.reduce((sum, shard) => sum + shard.size, 0);
  let completed = 0;
  for (const shard of POETRY_SHARDS) {
    const url = `https://huggingface.co/datasets/arbml/ashaar/resolve/refs%2Fconvert%2Fparquet/default/train/${shard.filename}`;
    const target = path.join(root, shard.filename);
    await downloadPoetryShard(url, target, signal, value => progress(completed + value.downloaded, total));
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of createReadStream(target)) { signal.throwIfAborted(); bytes += chunk.length; hash.update(chunk); }
    if (bytes !== shard.size || hash.digest('hex') !== shard.sha256) throw new Error('poetry-shard-checksum-mismatch');
    completed += bytes; progress(completed, total);
    manifest.push({ ...shard, url });
  }
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ dataset: 'arbml/ashaar', shards: manifest }, null, 2));
  return POETRY_SHARDS.map(shard => path.join(root, shard.filename));
}
