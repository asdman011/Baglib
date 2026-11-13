import { createReadStream, createWriteStream } from 'node:fs';
import { access, link, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * KEY-266: a local, versioned Al-Bayan poetry pack for installed builds. It replaces the Python/PyArrow build with a
 * prebuilt database. A pack is two files side by side: `bayan_poetry-v1.sqlite.gz` and its manifest
 * `bayan_poetry-v1.pack.json`, which records the uncompressed size, SHA-256 and poem count.
 */
export const POETRY_PACK_FORMAT = 'baglib-poetry-pack';
export interface PoetryPackManifest { format: typeof POETRY_PACK_FORMAT; version: 1; dataset: 'bayan_poetry'; file: string; compression: 'gzip'; bytes: number; sha256: string; rows: number; createdAt: string }

const MAX_BYTES = 8 * 1024 ** 3;
const HEADROOM = 256 * 1024 ** 2;
const PROGRESS_STEP = 8 * 1024 ** 2;

/** Validates a parsed manifest; throws `poetry-pack-invalid` for anything that is not exactly a version-1 pack. */
export function parsePoetryPackManifest(value: unknown): PoetryPackManifest {
  const fail = () => { throw new Error('poetry-pack-invalid'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const manifest = value as Record<string, unknown>;
  const file = manifest.file;
  if (manifest.format !== POETRY_PACK_FORMAT || manifest.version !== 1 || manifest.dataset !== 'bayan_poetry' || manifest.compression !== 'gzip') return fail();
  if (typeof file !== 'string' || !/^[^/\\:]+\.sqlite\.gz$/u.test(file) || file.includes('..')) return fail();
  if (!Number.isSafeInteger(manifest.bytes) || (manifest.bytes as number) < 1 || (manifest.bytes as number) > MAX_BYTES) return fail();
  if (typeof manifest.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(manifest.sha256)) return fail();
  if (!Number.isSafeInteger(manifest.rows) || (manifest.rows as number) < 1 || typeof manifest.createdAt !== 'string') return fail();
  return manifest as unknown as PoetryPackManifest;
}

export interface PoetryPackImportOptions {
  manifestPath: string;
  userData: string;
  signal: AbortSignal;
  progress: (written: number, total: number) => void;
  freeBytes: (directory: string) => Promise<number>;
  verify: (stagedSqlitePath: string) => Promise<number>;
}

const exists = (file: string) => access(file).then(() => true, () => false);

/**
 * Imports a pack into `<userData>/partitions/bayan_poetry.sqlite`: checks disk space, gunzips into a staging file while
 * hashing, verifies size, SHA-256 and poem count, then publishes exclusively (an existing partition is never replaced).
 * Any failure removes the staging file and throws a coded error.
 */
export async function importPoetryPack(options: PoetryPackImportOptions): Promise<{ rows: number; bytes: number }> {
  let manifest: PoetryPackManifest;
  try { manifest = parsePoetryPackManifest(JSON.parse(await readFile(options.manifestPath, 'utf8'))); } catch { throw new Error('poetry-pack-invalid'); }
  const partitions = path.join(options.userData, 'partitions');
  const target = path.join(partitions, 'bayan_poetry.sqlite');
  if (await exists(target)) throw new Error('poetry-partition-exists');
  const packFile = path.join(path.dirname(options.manifestPath), manifest.file);
  if (!(await stat(packFile).then(info => info.isFile(), () => false))) throw new Error('poetry-pack-missing');
  await mkdir(partitions, { recursive: true });
  if (await options.freeBytes(partitions) < manifest.bytes + HEADROOM) throw new Error('poetry-pack-no-space');
  options.signal.throwIfAborted?.();
  const staging = path.join(partitions, `.poetry-pack-${randomUUID()}.sqlite`);
  try {
    const hash = createHash('sha256');
    let written = 0, reported = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk); written += chunk.length;
        if (written > manifest.bytes) { callback(new Error('poetry-pack-checksum-mismatch')); return; }
        if (written - reported >= PROGRESS_STEP) { reported = written; options.progress(written, manifest.bytes); }
        callback(null, chunk);
      },
    });
    try {
      await pipeline(createReadStream(packFile), createGunzip(), meter, createWriteStream(staging, { flags: 'wx' }), { signal: options.signal });
    } catch (error) {
      if (options.signal.aborted) throw new Error('cancelled');
      const message = error instanceof Error ? error.message : '';
      throw new Error(message === 'poetry-pack-checksum-mismatch' ? message : 'poetry-pack-corrupt');
    }
    options.progress(written, manifest.bytes);
    if (written !== manifest.bytes || hash.digest('hex') !== manifest.sha256) throw new Error('poetry-pack-checksum-mismatch');
    if (options.signal.aborted) throw new Error('cancelled');
    let rows: number;
    try { rows = await options.verify(staging); } catch { throw new Error('poetry-invalid-partition'); }
    if (rows !== manifest.rows) throw new Error('poetry-invalid-partition');
    if (options.signal.aborted) throw new Error('cancelled');
    try { await link(staging, target); } catch { throw new Error(await exists(target) ? 'poetry-partition-exists' : 'poetry-pack-corrupt'); }
    return { rows, bytes: written };
  } finally {
    // SQLite opens a WAL database with -wal/-shm side files even read-only; none of them may outlive the import.
    for (const file of [staging, `${staging}-wal`, `${staging}-shm`]) await unlink(file).catch(() => {});
  }
}

/** Builds a version-1 pack from an existing poetry database: gzip next to a manifest with its size, hash and count. */
export async function buildPoetryPack(options: { source: string; outDir: string; rows: number; version?: 1; now?: () => Date }): Promise<{ manifestPath: string; manifest: PoetryPackManifest }> {
  await mkdir(options.outDir, { recursive: true });
  const file = 'bayan_poetry-v1.sqlite.gz';
  const hash = createHash('sha256');
  let bytes = 0;
  const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) { hash.update(chunk); bytes += chunk.length; callback(null, chunk); } });
  await pipeline(createReadStream(options.source), meter, createGzip({ level: 6 }), createWriteStream(path.join(options.outDir, file)));
  const manifest = parsePoetryPackManifest({ format: POETRY_PACK_FORMAT, version: 1, dataset: 'bayan_poetry', file, compression: 'gzip', bytes, sha256: hash.digest('hex'), rows: options.rows, createdAt: (options.now?.() ?? new Date()).toISOString() });
  const manifestPath = path.join(options.outDir, 'bayan_poetry-v1.pack.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifestPath, manifest };
}
