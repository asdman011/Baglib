import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, link, unlink, access } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { openPoetryPartition } from './partition';
import { ingestPoetryStream, type AshaarRow } from './ingest';

export interface PoetrySeedOptions { userData: string; python: string; parser: string; shards: string[]; expectedCount?: number; signal: AbortSignal; progress: (count: number) => void }

export async function seedPoetry(options: PoetrySeedOptions): Promise<number> {
  const target = path.join(options.userData, 'partitions', 'bayan_poetry.sqlite');
  if (await access(target).then(() => true).catch(() => false)) throw new Error('poetry-partition-exists');
  options.signal.throwIfAborted();
  const staging = path.join(options.userData, 'partitions', `.poetry-${randomUUID()}`);
  const database = openPoetryPartition(staging);
  const child = spawn(options.python, ['-I', '-u', options.parser, ...options.shards], { windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'], signal: options.signal });
  const completion = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('poetry-parquet-failed')));
  });
  void completion.catch(() => {});
  try {
    const lines = createInterface({ input: child.stdout });
    async function* rows(): AsyncGenerator<AshaarRow> {
      for await (const line of lines) { options.signal.throwIfAborted(); yield JSON.parse(line) as AshaarRow; }
      await completion;
    }
    const count = await ingestPoetryStream(database, rows(), options.progress);
    options.signal.throwIfAborted();
    if (!count || options.expectedCount !== undefined && count !== options.expectedCount || database.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('poetry-invalid-partition');
    database.pragma('wal_checkpoint(TRUNCATE)');
    database.close();
    await mkdir(path.dirname(target), { recursive: true });
    const staged = path.join(staging, 'partitions', 'bayan_poetry.sqlite');
    await link(staged, target);
    await unlink(staged);
    return count;
  } finally {
    if (database.open) database.close();
    child.kill();
  }
}
