/**
 * Baglib — StarDict Reader (KEY-142)
 *
 * Implements full StarDict format reading (.ifo, .idx, .dict / .dict.dz, .syn).
 * Supports lazy random-access binary search and DictZip integration.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadDictBodyFromFile, LRU, type DictBody } from './dict-zip';

export interface StarDictEntry {
  word: string;
  offset: number;
  size: number;
}

const utf8Decoder = new TextDecoder('utf-8');

export function parseIfo(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || !line.includes('=')) continue;
    const eq = line.indexOf('=');
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

export function scanEntryOffsets(bytes: Uint8Array, payloadBytes: number): Int32Array {
  const offsets: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    offsets.push(i);
    while (i < bytes.length && bytes[i] !== 0) i++;
    if (i >= bytes.length) break;
    i += 1 + payloadBytes;
  }
  return new Int32Array(offsets);
}

const cmpAscii = (a: string, b: string): number => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};

export class StarDictReader {
  ifo: Record<string, string> = {};
  private body: DictBody | null = null;
  private idxBytes: Uint8Array | null = null;
  private idxOffsets: Int32Array = new Int32Array(0);
  private idxCount = 0;

  private synBytes: Uint8Array | null = null;
  private synOffsets: Int32Array = new Int32Array(0);
  private synCount = 0;

  private idxCache: LRU<number, StarDictEntry>;
  private synCache: LRU<number, { syn: string; idxIndex: number }>;

  constructor(cacheSize = 256) {
    this.idxCache = new LRU<number, StarDictEntry>(cacheSize);
    this.synCache = new LRU<number, { syn: string; idxIndex: number }>(cacheSize);
  }

  async loadFromFiles(bundleDirOrIfoPath: string): Promise<void> {
    let ifoPath = bundleDirOrIfoPath;
    let baseDir = path.dirname(bundleDirOrIfoPath);
    let baseName = '';

    if (fs.statSync(bundleDirOrIfoPath).isDirectory()) {
      baseDir = bundleDirOrIfoPath;
      const files = fs.readdirSync(baseDir);
      const ifoFile = files.find((f) => f.endsWith('.ifo'));
      if (!ifoFile) throw new Error(`No .ifo file found in ${bundleDirOrIfoPath}`);
      ifoPath = path.join(baseDir, ifoFile);
      baseName = ifoFile.slice(0, -4);
    } else {
      baseName = path.basename(ifoPath, '.ifo');
    }

    const ifoText = fs.readFileSync(ifoPath, 'utf8');
    this.ifo = parseIfo(ifoText);

    // Locate .idx
    const idxPath = path.join(baseDir, `${baseName}.idx`);
    if (!fs.existsSync(idxPath)) {
      throw new Error(`Missing .idx file at ${idxPath}`);
    }
    this.idxBytes = fs.readFileSync(idxPath);
    this.idxOffsets = scanEntryOffsets(this.idxBytes, 8);
    this.idxCount = this.idxOffsets.length;

    // Locate .dict or .dict.dz
    let dictPath = path.join(baseDir, `${baseName}.dict.dz`);
    if (!fs.existsSync(dictPath)) {
      dictPath = path.join(baseDir, `${baseName}.dict`);
    }
    if (!fs.existsSync(dictPath)) {
      throw new Error(`Missing .dict or .dict.dz file at ${baseDir}`);
    }
    this.body = await loadDictBodyFromFile(dictPath);

    // Optional .syn
    const synPath = path.join(baseDir, `${baseName}.syn`);
    if (fs.existsSync(synPath)) {
      this.synBytes = fs.readFileSync(synPath);
      this.synOffsets = scanEntryOffsets(this.synBytes, 4);
      this.synCount = this.synOffsets.length;
    }
  }

  get entryCount(): number {
    return this.idxCount;
  }

  private decodeIdxEntry(i: number): StarDictEntry {
    const cached = this.idxCache.get(i);
    if (cached) return cached;
    if (!this.idxBytes) throw new Error('idx bytes not loaded');

    const start = this.idxOffsets[i]!;
    const end = i + 1 < this.idxCount ? this.idxOffsets[i + 1]! : this.idxBytes.length;
    const slice = this.idxBytes.subarray(start, end);

    let nullPos = 0;
    while (nullPos < slice.length && slice[nullPos] !== 0) nullPos++;
    const word = utf8Decoder.decode(slice.subarray(0, nullPos));
    const view = new DataView(slice.buffer, slice.byteOffset + nullPos + 1, 8);
    const offset = view.getUint32(0);
    const size = view.getUint32(4);

    const entry: StarDictEntry = { word, offset, size };
    this.idxCache.set(i, entry);
    return entry;
  }

  private decodeSynEntry(i: number): { syn: string; idxIndex: number } {
    const cached = this.synCache.get(i);
    if (cached) return cached;
    if (!this.synBytes) throw new Error('syn bytes not loaded');

    const start = this.synOffsets[i]!;
    const end = i + 1 < this.synCount ? this.synOffsets[i + 1]! : this.synBytes.length;
    const slice = this.synBytes.subarray(start, end);

    let nullPos = 0;
    while (nullPos < slice.length && slice[nullPos] !== 0) nullPos++;
    const syn = utf8Decoder.decode(slice.subarray(0, nullPos));
    const view = new DataView(slice.buffer, slice.byteOffset + nullPos + 1, 4);
    const idxIndex = view.getUint32(0);

    const entry = { syn, idxIndex };
    this.synCache.set(i, entry);
    return entry;
  }

  lookup(word: string): StarDictEntry | undefined {
    let lo = 0;
    let hi = this.idxCount - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const entry = this.decodeIdxEntry(mid);
      const cmp = cmpAscii(word, entry.word);
      if (cmp === 0) return entry;
      if (cmp > 0) lo = mid + 1;
      else hi = mid - 1;
    }

    // Try synonym
    if (this.synCount > 0) {
      let slo = 0;
      let shi = this.synCount - 1;
      while (slo <= shi) {
        const mid = (slo + shi) >>> 1;
        const entry = this.decodeSynEntry(mid);
        const cmp = cmpAscii(word, entry.syn);
        if (cmp === 0) return this.decodeIdxEntry(entry.idxIndex);
        if (cmp > 0) slo = mid + 1;
        else shi = mid - 1;
      }
    }

    return undefined;
  }

  async readDefinition(entry: StarDictEntry): Promise<string> {
    if (!this.body) throw new Error('dict body not loaded');
    const bytes = await this.body.read(entry.offset, entry.size);
    return utf8Decoder.decode(bytes);
  }

  /** Read all headwords in the dictionary (for SQLite indexing) */
  getAllHeadwords(): Array<{ word: string; offset: number; size: number }> {
    const list: Array<{ word: string; offset: number; size: number }> = [];
    for (let i = 0; i < this.idxCount; i++) {
      list.push(this.decodeIdxEntry(i));
    }
    return list;
  }

  close(): void {
    if (this.body && this.body.close) {
      this.body.close();
    }
  }
}
