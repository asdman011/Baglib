/**
 * BagLib — Arabic Lexicons Pack Worker (KEY-413)
 *
 * Extracts the nested `assets/data/db/db.sqlite.zip` and `assets/data/ar_en/*`
 * from a repo zip archive using `fflate` off the main thread so the UI never freezes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { Unzip, AsyncUnzipInflate, unzipSync } from 'fflate';

interface WorkerInput {
  zipPath: string;
  destDir: string;
}

const ARAMORPH_FILES = new Set([
  'dictprefixes',
  'dictstems',
  'dictsuffixes',
  'tableab',
  'tableac',
  'tablebc',
  'GPL.redistributable.txt',
  'gpl.txt',
]);

function postProgress(stage: string, current?: number, total?: number): void {
  parentPort?.postMessage({ type: 'progress', stage, current, total });
}

function streamUnzipSingleEntryToFile(
  zipBytes: Uint8Array,
  matchPredicate: (entryName: string) => boolean,
  destPath: string
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let matched = false;
    let settled = false;
    let fd: number | null = null;

    const closeFd = () => {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {
          // ignore
        }
        fd = null;
      }
    };

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      closeFd();
      try {
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      } catch {
        // ignore
      }
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const unzipper = new Unzip((file) => {
      if (matched || !matchPredicate(file.name)) return;
      matched = true;
      try {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fd = fs.openSync(destPath, 'w');
      } catch (err) {
        fail(err);
        return;
      }

      file.ondata = (err, chunk, final) => {
        if (settled) return;
        if (err) {
          fail(err);
          return;
        }
        if (chunk && chunk.length > 0 && fd !== null) {
          try {
            fs.writeSync(fd, chunk);
          } catch (writeErr) {
            fail(writeErr);
            return;
          }
        }
        if (final) {
          closeFd();
          settled = true;
          resolve(true);
        }
      };
      file.start();
    });
    unzipper.register(AsyncUnzipInflate);

    try {
      const CHUNK_SIZE = 4 * 1024 * 1024;
      for (let offset = 0; offset < zipBytes.length; offset += CHUNK_SIZE) {
        if (settled) break;
        const end = Math.min(offset + CHUNK_SIZE, zipBytes.length);
        const isLast = end >= zipBytes.length;
        unzipper.push(zipBytes.subarray(offset, end), isLast);
      }
      if (!matched && !settled) {
        settled = true;
        resolve(false);
      }
    } catch (err) {
      fail(err);
    }
  });
}

async function run(): Promise<void> {
  const { zipPath, destDir } = workerData as WorkerInput;
  postProgress('reading');
  const outerBytes = fs.readFileSync(zipPath);

  fs.mkdirSync(destDir, { recursive: true });
  const arEnDir = path.join(destDir, 'ar_en');
  fs.mkdirSync(arEnDir, { recursive: true });

  postProgress('unzipping', 0, 2);

  // Extract ar_en/* and Sources.md and locate either db.sqlite.zip or db.sqlite
  let nestedDbZipBytes: Uint8Array | null = null;
  let directDbSaved = false;
  const dbDestPath = path.join(destDir, 'db.sqlite');
  const dbTempPath = `${dbDestPath}.tmp`;

  const extractedEntries = unzipSync(outerBytes, {
    filter: (file) => {
      if (file.name.endsWith('/')) return false;
      const normalized = file.name.replace(/\\/gu, '/');
      if (normalized.endsWith('assets/data/db/db.sqlite.zip') || normalized === 'db.sqlite.zip') {
        return true;
      }
      if (normalized.endsWith('assets/data/db/Sources.md') || normalized.endsWith('/Sources.md')) {
        return true;
      }
      if (normalized.includes('assets/data/ar_en/') || normalized.startsWith('ar_en/')) {
        const base = path.posix.basename(normalized);
        return ARAMORPH_FILES.has(base);
      }
      const base = path.posix.basename(normalized);
      if (ARAMORPH_FILES.has(base)) return true;
      return false;
    },
  });

  let hasArEn = false;
  for (const [entryName, bytes] of Object.entries(extractedEntries)) {
    const normalized = entryName.replace(/\\/gu, '/');
    const base = path.posix.basename(normalized);
    if (normalized.endsWith('db.sqlite.zip')) {
      nestedDbZipBytes = bytes;
    } else if (base === 'Sources.md') {
      fs.writeFileSync(path.join(destDir, 'Sources.md'), bytes);
    } else if (ARAMORPH_FILES.has(base)) {
      fs.writeFileSync(path.join(arEnDir, base), bytes);
      hasArEn = true;
    }
  }

  postProgress('unzipping', 1, 2);

  if (nestedDbZipBytes) {
    const ok = await streamUnzipSingleEntryToFile(
      nestedDbZipBytes,
      (name) => name.endsWith('.sqlite') || name.endsWith('.db'),
      dbTempPath
    );
    if (!ok) {
      throw new Error('invalid-pack');
    }
    fs.renameSync(dbTempPath, dbDestPath);
    directDbSaved = true;
  } else {
    // Check if outer zip directly contained db.sqlite
    const ok = await streamUnzipSingleEntryToFile(
      outerBytes,
      (name) => {
        const norm = name.replace(/\\/gu, '/');
        return norm.endsWith('db.sqlite') && !norm.endsWith('.zip');
      },
      dbTempPath
    );
    if (ok) {
      fs.renameSync(dbTempPath, dbDestPath);
      directDbSaved = true;
    }
  }

  if (!directDbSaved || !fs.existsSync(dbDestPath)) {
    throw new Error('invalid-pack');
  }

  postProgress('unzipping', 2, 2);
  parentPort?.postMessage({
    type: 'done',
    dbPath: dbDestPath,
    arEnDir: hasArEn ? arEnDir : null,
  });
}

void run().catch((err) => {
  parentPort?.postMessage({
    type: 'error',
    error: err instanceof Error ? err.message : 'invalid-pack',
  });
});
