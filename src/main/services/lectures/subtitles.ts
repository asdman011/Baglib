import type { Database } from 'better-sqlite3';
import { open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { companionSubtitleNames, MAX_SUBTITLE_BYTES, parseSubtitles, type SubtitleCue } from '../../../shared/subtitles';
import { SqliteSettingsRepository } from '../../database/repositories/settings.repository';

const SUBTITLE_KEY = 'media.lecture-subtitles.v1';
export interface LoadedSubtitles { path: string; cues: SubtitleCue[] }

export function decodeSubtitles(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('windows-1256').decode(bytes).replace(/^\uFEFF/u, ''); }
}

export async function readSubtitles(file: string): Promise<LoadedSubtitles> {
  if (!path.isAbsolute(file) || !/\.(srt|vtt)$/iu.test(file)) throw new Error('invalid-subtitles');
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_SUBTITLE_BYTES) throw new Error('invalid-subtitles');
    const bytes = Buffer.alloc(MAX_SUBTITLE_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = await handle.read(bytes, length, bytes.length - length, null);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length > MAX_SUBTITLE_BYTES) throw new Error('subtitles-too-large');
    return { path: file, cues: parseSubtitles(decodeSubtitles(bytes.subarray(0, length))) };
  } finally { await handle.close(); }
}

export class LectureSubtitles {
  private settings: SqliteSettingsRepository;
  constructor(db: Database) { this.settings = new SqliteSettingsRepository(db); }

  async load(id: string, mediaPath: string, selected?: string): Promise<LoadedSubtitles | null> {
    if (selected !== undefined) {
      const loaded = await readSubtitles(selected);
      const choices = this.settings.get<Record<string, string>>(SUBTITLE_KEY) ?? {};
      this.settings.set(SUBTITLE_KEY, { ...choices, [id]: selected });
      return loaded;
    }
    const saved = this.settings.get<Record<string, string>>(SUBTITLE_KEY)?.[id];
    if (saved) {
      try { return await readSubtitles(saved); } catch { /* A moved sidecar can be rediscovered beside the media. */ }
    }
    const directory = path.dirname(mediaPath);
    const siblings = await readdir(directory).catch(() => []);
    for (const name of companionSubtitleNames(path.basename(mediaPath), siblings)) {
      try { return await readSubtitles(path.join(directory, name)); } catch { /* Try the next readable companion. */ }
    }
    return null;
  }
}
