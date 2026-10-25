import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, rm, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import Database from 'better-sqlite3';
import type { QuranPack, QuranResource } from '../../../shared/types/quran';

export function detectPayload(bytes: Uint8Array): QuranPack['files'][number]['type'] {
  const header = Buffer.from(bytes).subarray(0, 16);
  if (header.toString() === 'SQLite format 3\0') return 'sqlite';
  if (['wOF2', 'wOFF', 'OTTO', 'true'].includes(header.subarray(0, 4).toString()) || header.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0]))) return 'font';
  if (header.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || (header[0] === 255 && header[1] === 216)) return 'image';
  if (header.subarray(0, 3).toString() === 'ID3' || (header[0] === 255 && (header[1] & 224) === 224)) return 'audio';
  const text = Buffer.from(bytes).toString('utf8').trimStart();
  if (text.startsWith('{') || text.startsWith('[')) { JSON.parse(text); return 'json'; }
  throw new Error('unsupported-format');
}

export async function installPackage(root: string, jobId: string, archive: string, resource: QuranResource): Promise<QuranPack> {
  if (!/^[a-f0-9-]{36}$/.test(jobId)) throw new Error('invalid-package');
  const info = await stat(archive);
  if (!info.isFile() || !info.size || info.size > 128 * 1024 * 1024) throw new Error('invalid-package');
  const disk = await statfs(root);
  if (disk.bavail * disk.bsize < info.size * 3 + 256 * 1024 * 1024) throw new Error('storage');
  const bytes = await readFile(archive);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const staging = path.join(root, 'staging', jobId);
  const destination = path.join(root, 'packs', jobId);
  await mkdir(staging, { recursive: true });
  try {
    let expanded = 0;
    let count = 0;
    const entries = bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4])) ? unzipSync(bytes, { filter: file => {
      expanded += file.originalSize;
      count++;
      if (count > 2000 || expanded > 512 * 1024 * 1024 || file.originalSize > 128 * 1024 * 1024) throw new Error('invalid-package');
      if (file.name.includes('\\') || file.name.startsWith('/') || file.name.split('/').some(part => part === '..' || part.includes(':') || part.includes('\0'))) throw new Error('invalid-package');
      return !file.name.endsWith('/');
    } }) : { 'payload.bin': bytes };
    const files: QuranPack['files'] = [];
    const metadata: { name: string; tables: string[] }[] = [];
    for (const [originalName, content] of Object.entries(entries)) {
      const type = detectPayload(content);
      const name = `${files.length}.${type === 'sqlite' ? 'sqlite' : type === 'json' ? 'json' : 'bin'}`;
      const target = path.join(staging, name);
      await writeFile(target, content, { flag: 'wx' });
      if (type === 'sqlite') {
        const database = new Database(target, { readonly: true, fileMustExist: true });
        try {
          database.pragma('trusted_schema = OFF');
          const schema = database.prepare("SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all() as { type: string; name: string; sql: string }[];
          if (schema.length > 100 || schema.some(item => !['table', 'index'].includes(item.type) || /CREATE\s+VIRTUAL/i.test(item.sql || ''))) throw new Error('invalid-package');
          if (database.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('invalid-package');
          metadata.push({ name, tables: schema.filter(item => item.type === 'table').map(item => item.name) });
        } finally { database.close(); }
      }
      files.push({ name: originalName, bytes: content.length, type });
    }
    if (!files.length) throw new Error('invalid-package');
    const pack: QuranPack = { id: jobId, resource, digest, bytes: files.reduce((total, file) => total + file.bytes, 0), files, installedAt: new Date().toISOString(), capability: 'stored' };
    await writeFile(path.join(staging, 'source.archive'), bytes, { flag: 'wx' });
    await writeFile(path.join(staging, 'manifest.json'), JSON.stringify({ pack, sqlite: metadata }));
    await mkdir(path.dirname(destination), { recursive: true });
    await rename(staging, destination);
    return pack;
  } catch (error) {
    if (path.dirname(staging) !== path.join(root, 'staging')) throw new Error('storage');
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
