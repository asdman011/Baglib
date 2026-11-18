/**
 * Baglib — card media storage (KEY-391; user decision 2026-11-17).
 *
 * Card images (maps, diagrams, manuscript pages) live as files in `card-media/` next to the
 * database, one file per image, named by the SHA-1 of its bytes so the same image is stored once.
 * There is no database table: notes reference a file by name (`<img src="<sha1>.png">`), the way
 * Anki references files in `collection.media`. Backup snapshots carry the folder (see
 * library-snapshot.service).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getDatabasePath } from '../database/connection';

export const CARD_MEDIA_DIR = 'card-media';
export const MAX_CARD_MEDIA_BYTES = 25 * 1024 * 1024;

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  // KEY-392: Anki's collection.media maps one to one (ADR-017 3.12), so audio and other files are kept too.
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  webm: 'audio/webm',
  bin: 'application/octet-stream',
};

export const CARD_MEDIA_NAME = /^[a-f0-9]{40}\.(png|jpg|gif|webp|bmp|mp3|ogg|wav|m4a|flac|webm|bin)$/u;

/** Recognises the image type from its first bytes; the file name is never trusted. */
export function sniffImageType(bytes: Uint8Array): keyof typeof MIME | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return 'bmp';
  return null;
}

/**
 * KEY-392: the type of any card-media file, from its first bytes: the image types above, common
 * audio formats, and `bin` for anything else (fonts, SVG, video), so an Anki round-trip loses nothing.
 */
export function sniffMediaType(bytes: Uint8Array): keyof typeof MIME {
  const image = sniffImageType(bytes);
  if (image) return image;
  const b = bytes;
  const ascii = (at: number, text: string) => b.length >= at + text.length && [...text].every((ch, i) => b[at + i] === ch.charCodeAt(0));
  if (ascii(0, 'ID3')) return 'mp3';
  if (b.length >= 2 && b[0] === 0xff && (b[1]! & 0xe0) === 0xe0) return 'mp3';
  if (ascii(0, 'OggS')) return 'ogg';
  if (ascii(0, 'RIFF') && ascii(8, 'WAVE')) return 'wav';
  if (ascii(0, 'fLaC')) return 'flac';
  if (ascii(4, 'ftyp')) return 'm4a';
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  return 'bin';
}

export interface StoredCardMedia {
  name: string;
  dataUrl: string;
}

export class CardMediaStore {
  constructor(private readonly directory: string = path.join(path.dirname(getDatabasePath()), CARD_MEDIA_DIR)) {}

  get dir(): string {
    return this.directory;
  }

  private ensureDir(): void {
    fs.mkdirSync(this.directory, { recursive: true });
  }

  /** Stores image bytes; returns the content-hash name. Identical images share one file. */
  save(bytes: Uint8Array): StoredCardMedia {
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new Error('card-media-empty');
    if (bytes.length > MAX_CARD_MEDIA_BYTES) throw new Error('card-media-too-large');
    const type = sniffImageType(bytes);
    if (!type) throw new Error('card-media-unsupported');
    const name = `${crypto.createHash('sha1').update(bytes).digest('hex')}.${type}`;
    this.ensureDir();
    const target = path.join(this.directory, name);
    if (!fs.existsSync(target)) {
      const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(temp, bytes);
      fs.renameSync(temp, target);
    }
    return { name, dataUrl: this.toDataUrl(name, bytes) };
  }

  /** Reads a file the user picked in the main-process dialog. */
  importFile(filePath: string): StoredCardMedia {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error('card-media-not-a-file');
    if (stat.size > MAX_CARD_MEDIA_BYTES) throw new Error('card-media-too-large');
    return this.save(new Uint8Array(fs.readFileSync(filePath)));
  }

  /** The image as a data: URL for the sandboxed card frame (its CSP allows only data: images). */
  read(name: string): StoredCardMedia | null {
    if (typeof name !== 'string' || !CARD_MEDIA_NAME.test(name)) return null;
    const file = path.join(this.directory, name);
    if (!fs.existsSync(file)) return null;
    return { name, dataUrl: this.toDataUrl(name, new Uint8Array(fs.readFileSync(file))) };
  }

  /** Every stored file name, for backups. */
  list(): string[] {
    if (!fs.existsSync(this.directory)) return [];
    return fs.readdirSync(this.directory).filter(name => CARD_MEDIA_NAME.test(name));
  }

  readBytes(name: string): Uint8Array | null {
    if (!CARD_MEDIA_NAME.test(name)) return null;
    const file = path.join(this.directory, name);
    return fs.existsSync(file) ? new Uint8Array(fs.readFileSync(file)) : null;
  }

  /** Restores one file from a backup. Names are content hashes, so an existing file is already right. */
  restore(name: string, bytes: Uint8Array): boolean {
    if (!CARD_MEDIA_NAME.test(name)) return false;
    if (!name.endsWith(`.${sniffMediaType(bytes)}`)) return false;
    if (crypto.createHash('sha1').update(bytes).digest('hex') !== name.slice(0, 40)) return false;
    this.ensureDir();
    const target = path.join(this.directory, name);
    if (!fs.existsSync(target)) fs.writeFileSync(target, bytes);
    return true;
  }

  /**
   * KEY-392: stores any media file (Anki import), named by content hash like the images.
   * Returns the stored name.
   */
  saveAny(bytes: Uint8Array): string {
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new Error('card-media-empty');
    if (bytes.length > MAX_CARD_MEDIA_BYTES) throw new Error('card-media-too-large');
    const name = `${crypto.createHash('sha1').update(bytes).digest('hex')}.${sniffMediaType(bytes)}`;
    this.ensureDir();
    const target = path.join(this.directory, name);
    if (!fs.existsSync(target)) {
      const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(temp, bytes);
      fs.renameSync(temp, target);
    }
    return name;
  }

  private toDataUrl(name: string, bytes: Uint8Array): string {
    const ext = name.slice(name.lastIndexOf('.') + 1);
    return `data:${MIME[ext]};base64,${Buffer.from(bytes).toString('base64')}`;
  }
}
