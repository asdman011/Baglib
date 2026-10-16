/**
 * Baglib — DictZip Reader (KEY-142)
 *
 * Implements random-access reading of `.dict.dz` indexed gzip files.
 * Uses fflate streaming Inflate for chunk decompression across Z_FULL_FLUSH boundaries.
 */

import fs from 'node:fs';
import { gunzipSync, Inflate } from 'fflate';

const GZIP_MAGIC = [0x1f, 0x8b];

export const isGzip = (bytes: Uint8Array): boolean =>
  bytes.length >= 2 && bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];

export interface DictZipMeta {
  chlen: number;
  chunkSizes: number[];
  compressedDataOffset: number;
}

export function parseDictZipHeader(bytes: Uint8Array): DictZipMeta | null {
  if (bytes.length < 12 || bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 0x08) {
    return null;
  }
  const flg = bytes[3]!;
  const hasFEXTRA = (flg & 0b100) !== 0;
  if (!hasFEXTRA) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const xlen = view.getUint16(10, true);
  let chlen = 0;
  let chcnt = 0;
  const chunkSizes: number[] = [];

  let p = 12;
  while (p + 4 <= 12 + xlen) {
    const si1 = bytes[p]!;
    const si2 = bytes[p + 1]!;
    const slen = view.getUint16(p + 2, true);
    if (si1 === 0x52 && si2 === 0x41) {
      // RA subfield: ver(2) + chlen(2) + chcnt(2) + chunkSizes(2 * chcnt)
      const ver = view.getUint16(p + 4, true);
      if (ver !== 1) return null;
      chlen = view.getUint16(p + 6, true);
      chcnt = view.getUint16(p + 8, true);
      for (let i = 0; i < chcnt; i++) {
        chunkSizes.push(view.getUint16(p + 10 + 2 * i, true));
      }
    }
    p += 4 + slen;
  }
  if (chcnt === 0 || chunkSizes.length !== chcnt) return null;

  let offset = 12 + xlen;
  if (flg & 0b1000) {
    while (offset < bytes.length && bytes[offset] !== 0) offset++;
    offset++;
  }
  if (flg & 0b10000) {
    while (offset < bytes.length && bytes[offset] !== 0) offset++;
    offset++;
  }
  if (flg & 0b10) offset += 2;

  return { chlen, chunkSizes, compressedDataOffset: offset };
}

export function inflateChunkStreaming(chunkBytes: Uint8Array): Uint8Array | null {
  let result: Uint8Array | null = null;
  try {
    const inf = new Inflate();
    inf.ondata = (data) => {
      if (result === null) result = data;
    };
    inf.push(chunkBytes, false);
  } catch {
    return null;
  }
  if (!result || (result as Uint8Array).length === 0) return null;
  return result;
}

export class LRU<K, V> {
  private readonly map = new Map<K, V>();
  constructor(private readonly max: number) {}

  get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) {
      const first = this.map.keys().next().value as K | undefined;
      if (first !== undefined) this.map.delete(first);
    }
  }
}

export interface DictBody {
  read(offset: number, size: number): Promise<Uint8Array>;
  close?(): void;
}

export class BufferedDictBody implements DictBody {
  constructor(private readonly buf: Uint8Array) {}
  async read(offset: number, size: number): Promise<Uint8Array> {
    return this.buf.subarray(offset, offset + size);
  }
}

export class DictZipFileBody implements DictBody {
  private fd: number | null = null;
  private readonly chunkOffsets: number[];
  private readonly chunkCache: LRU<number, Uint8Array>;

  constructor(
    private readonly filePath: string,
    private readonly meta: DictZipMeta,
    cacheSize = 32
  ) {
    this.chunkCache = new LRU<number, Uint8Array>(cacheSize);
    const offsets: number[] = [];
    let acc = meta.compressedDataOffset;
    for (const cs of meta.chunkSizes) {
      offsets.push(acc);
      acc += cs;
    }
    this.chunkOffsets = offsets;
  }

  private getFd(): number {
    if (this.fd === null) {
      this.fd = fs.openSync(this.filePath, 'r');
    }
    return this.fd;
  }

  async read(offset: number, size: number): Promise<Uint8Array> {
    const chlen = this.meta.chlen;
    const startChunk = Math.floor(offset / chlen);
    const endChunk = Math.floor((offset + size - 1) / chlen);

    if (startChunk === endChunk) {
      const chunk = await this.getChunk(startChunk);
      const local = offset - startChunk * chlen;
      return chunk.subarray(local, local + size);
    }

    const parts: Uint8Array[] = [];
    let totalLen = 0;
    for (let i = startChunk; i <= endChunk; i++) {
      const chunk = await this.getChunk(i);
      parts.push(chunk);
      totalLen += chunk.length;
    }
    const combined = new Uint8Array(totalLen);
    let pos = 0;
    for (const p of parts) {
      combined.set(p, pos);
      pos += p.length;
    }
    const local = offset - startChunk * chlen;
    return combined.subarray(local, local + size);
  }

  private async getChunk(i: number): Promise<Uint8Array> {
    const cached = this.chunkCache.get(i);
    if (cached) return cached;

    const fd = this.getFd();
    const start = this.chunkOffsets[i]!;
    const compressedSize = this.meta.chunkSizes[i]!;
    const compressed = Buffer.alloc(compressedSize);
    fs.readSync(fd, compressed, 0, compressedSize, start);

    const inflated = inflateChunkStreaming(compressed);
    if (!inflated) throw new Error(`Failed to inflate DictZip chunk ${i}`);
    this.chunkCache.set(i, inflated);
    return inflated;
  }

  close(): void {
    if (this.fd !== null) {
      try {
        fs.closeSync(this.fd);
      } catch {
        // ignore
      }
      this.fd = null;
    }
  }
}

/**
 * Open a `.dict` or `.dict.dz` file for random-access reading.
 */
export async function loadDictBodyFromFile(filePath: string, cacheSize = 32): Promise<DictBody> {
  const fd = fs.openSync(filePath, 'r');
  const headBuf = Buffer.alloc(Math.min(64 * 1024, fs.fstatSync(fd).size));
  fs.readSync(fd, headBuf, 0, headBuf.length, 0);
  fs.closeSync(fd);

  if (isGzip(headBuf)) {
    const meta = parseDictZipHeader(headBuf);
    if (meta && meta.chunkSizes.length > 0) {
      return new DictZipFileBody(filePath, meta, cacheSize);
    }
    // Whole-file gunzip fallback
    const fullBytes = fs.readFileSync(filePath);
    return new BufferedDictBody(gunzipSync(fullBytes));
  }

  // Raw uncompressed .dict
  const fullBytes = fs.readFileSync(filePath);
  return new BufferedDictBody(fullBytes);
}
