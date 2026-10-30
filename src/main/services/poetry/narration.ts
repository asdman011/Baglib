import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PoetryNarration, PoetryNarrationKind, PoetryNarrationProvider } from '../../../shared/types/poetry';
import { narrationExtensionAllowed, narrationLabelValid, parseNarrationLink, POETRY_NARRATION_MAX_BYTES, POETRY_NARRATION_MAX_RECORDING_SECONDS } from '../../../shared/poetry-narration';

interface NarrationRow {
  id: string; poem_id: number; kind: PoetryNarrationKind; provider: PoetryNarrationProvider; label: string | null;
  file_name: string | null; url: string | null; mime_type: string | null; duration_seconds: number | null; created_at: string;
}

const MANAGED_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/u;
const MIME_BY_EXTENSION: Record<string, string> = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
  '.opus': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.webm': 'audio/webm',
};

function assertPoemId(poemId: unknown): asserts poemId is number {
  if (!Number.isSafeInteger(poemId) || (poemId as number) < 1) throw new Error('invalid-poetry-narration');
}

function cleanLabel(label: unknown): string | null {
  if (!narrationLabelValid(label)) throw new Error('invalid-poetry-narration');
  return label?.trim() || null;
}

/** Detects the container of a microphone recording from its leading bytes. */
export function recordingExtension(bytes: Uint8Array, mimeType: string): '.webm' | '.ogg' | '.m4a' | null {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  if (base === 'audio/webm' && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return '.webm';
  if (base === 'audio/ogg' && String.fromCharCode(...bytes.subarray(0, 4)) === 'OggS') return '.ogg';
  if (base === 'audio/mp4' && String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp') return '.m4a';
  return null;
}

export function narrationMediaUrl(filePath: string): string {
  return `baglib-asset://${encodeURI(filePath.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
}

export class PoetryNarrationService {
  constructor(private database: Database.Database, private directory: string) {}

  private toNarration(row: NarrationRow): PoetryNarration {
    const managed = row.file_name && MANAGED_FILE.test(row.file_name) ? path.join(this.directory, row.file_name) : null;
    return {
      id: row.id, poemId: row.poem_id, kind: row.kind, provider: row.provider, label: row.label, url: row.url,
      mediaUrl: managed ? narrationMediaUrl(managed) : row.provider === 'url' ? row.url : null,
      mimeType: row.mime_type, durationSeconds: row.duration_seconds, createdAt: row.created_at,
    };
  }

  private insert(row: NarrationRow): PoetryNarration {
    this.database.prepare(`INSERT INTO poetry_narration(id,poem_id,kind,provider,label,file_name,url,mime_type,duration_seconds,created_at)
      VALUES(@id,@poem_id,@kind,@provider,@label,@file_name,@url,@mime_type,@duration_seconds,@created_at)`).run(row);
    return this.toNarration(row);
  }

  list(poemId: unknown): PoetryNarration[] {
    assertPoemId(poemId);
    const rows = this.database.prepare('SELECT * FROM poetry_narration WHERE poem_id=? ORDER BY created_at DESC, id DESC LIMIT 200').all(poemId) as NarrationRow[];
    return rows.map(row => this.toNarration(row));
  }

  async addFile(poemId: unknown, sourcePath: string, label?: unknown): Promise<PoetryNarration> {
    assertPoemId(poemId);
    const cleaned = cleanLabel(label);
    if (!narrationExtensionAllowed(sourcePath)) throw new Error('unsupported-poetry-narration');
    const stat = await fs.promises.stat(sourcePath);
    if (!stat.isFile() || stat.size < 1 || stat.size > POETRY_NARRATION_MAX_BYTES) throw new Error('unsupported-poetry-narration');
    const extension = path.extname(sourcePath).toLowerCase();
    const id = randomUUID(), fileName = `${id}${extension}`;
    await fs.promises.mkdir(this.directory, { recursive: true });
    const target = path.join(this.directory, fileName);
    await fs.promises.copyFile(sourcePath, target, fs.constants.COPYFILE_EXCL);
    try {
      return this.insert({ id, poem_id: poemId, kind: 'file', provider: 'local', label: cleaned ?? path.basename(sourcePath, path.extname(sourcePath)).slice(0, 200), file_name: fileName, url: null, mime_type: MIME_BY_EXTENSION[extension] ?? null, duration_seconds: null, created_at: new Date().toISOString() });
    } catch (error) { await fs.promises.rm(target, { force: true }); throw error; }
  }

  async addRecording(input: unknown): Promise<PoetryNarration> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid-poetry-narration');
    const value = input as { poemId: unknown; label?: unknown; mimeType: unknown; durationSeconds: unknown; data: unknown };
    assertPoemId(value.poemId);
    const cleaned = cleanLabel(value.label);
    const bytes = value.data instanceof ArrayBuffer ? new Uint8Array(value.data) : ArrayBuffer.isView(value.data) ? new Uint8Array(value.data.buffer, value.data.byteOffset, value.data.byteLength) : null;
    const duration = typeof value.durationSeconds === 'number' && Number.isFinite(value.durationSeconds) ? value.durationSeconds : NaN;
    if (!bytes || bytes.byteLength < 16 || bytes.byteLength > POETRY_NARRATION_MAX_BYTES || typeof value.mimeType !== 'string' || !(duration > 0 && duration <= POETRY_NARRATION_MAX_RECORDING_SECONDS + 5)) throw new Error('invalid-poetry-narration');
    const extension = recordingExtension(bytes, value.mimeType);
    if (!extension) throw new Error('unsupported-poetry-narration');
    const id = randomUUID(), fileName = `${id}${extension}`;
    await fs.promises.mkdir(this.directory, { recursive: true });
    const target = path.join(this.directory, fileName);
    await fs.promises.writeFile(target, bytes, { flag: 'wx' });
    try {
      return this.insert({ id, poem_id: value.poemId, kind: 'recording', provider: 'local', label: cleaned, file_name: fileName, url: null, mime_type: MIME_BY_EXTENSION[extension], duration_seconds: Math.round(duration * 10) / 10, created_at: new Date().toISOString() });
    } catch (error) { await fs.promises.rm(target, { force: true }); throw error; }
  }

  addLink(input: unknown): PoetryNarration {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid-poetry-narration');
    const value = input as { poemId: unknown; label?: unknown; url: unknown };
    assertPoemId(value.poemId);
    const cleaned = cleanLabel(value.label);
    const parsed = typeof value.url === 'string' ? parseNarrationLink(value.url) : null;
    if (!parsed) throw new Error('unsupported-poetry-narration');
    return this.insert({ id: randomUUID(), poem_id: value.poemId, kind: 'online', provider: parsed.provider, label: cleaned, file_name: null, url: parsed.url, mime_type: null, duration_seconds: null, created_at: new Date().toISOString() });
  }

  async delete(id: unknown): Promise<boolean> {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/u.test(id)) throw new Error('invalid-poetry-narration');
    const row = this.database.prepare('SELECT file_name FROM poetry_narration WHERE id=?').get(id) as { file_name: string | null } | undefined;
    if (!row) return false;
    this.database.prepare('DELETE FROM poetry_narration WHERE id=?').run(id);
    if (row.file_name && MANAGED_FILE.test(row.file_name)) await fs.promises.rm(path.join(this.directory, row.file_name), { force: true });
    return true;
  }
}
