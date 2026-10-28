import fs from 'node:fs';
import { lstat, realpath, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Database } from 'better-sqlite3';

export async function fileSha256(filename: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
export interface PdfSource { workId: string | null; sourceId: string | null; editionId: string | null; path: string; sha256: string }
export async function resolvePdfSource(db: Database, workId: string, sourceId?: string): Promise<PdfSource> {
  if (typeof workId !== 'string' || !/^[\w-]{1,180}$/u.test(workId) || (sourceId !== undefined && (typeof sourceId !== 'string' || !/^[\w-]{1,180}$/u.test(sourceId)))) throw new Error('invalid-request');
  const rows = db.prepare(`SELECT e.work_id workId, e.id editionId, s.id sourceId, f.file_path path
    FROM edition e JOIN source s ON s.edition_id=e.id JOIN file_source_detail f ON f.source_id=s.id
    WHERE e.work_id=? AND upper(f.file_format)='PDF' ${sourceId ? 'AND s.id=?' : ''}`).all(...(sourceId ? [workId, sourceId] : [workId])) as Omit<PdfSource, 'sha256'>[];
  if (!rows.length) throw new Error('invalid-source');
  if (rows.length !== 1) throw new Error('source-required');
  const source = rows[0];
  source.path = await realpath(source.path);
  const stat = await lstat(source.path);
  if (!stat.isFile() || stat.size > 256 * 1024 * 1024) throw new Error('invalid-source');
  const handle = await open(source.path, 'r');
  try {
    const header = Buffer.alloc(1024); const read = await handle.read(header, 0, 1024, 0);
    if (!header.subarray(0, read.bytesRead).includes(Buffer.from('%PDF-'))) throw new Error('invalid-source');
  } finally { await handle.close(); }
  return { ...source, sha256: await fileSha256(source.path) };
}
