/**
 * Baglib — Aard Slob / ZIM Reader (KEY-142)
 *
 * Implements Aard 2 (.slob) format parsing, ref item list binary search,
 * and zlib bin decompression for offline Wikipedia / Wiktionary dumps.
 */

import fs from 'node:fs';
import { unzlibSync } from 'fflate';
import { LRU } from './dict-zip';

const utf8 = new TextDecoder('utf-8');
const MAGIC = new Uint8Array([0x21, 0x2d, 0x31, 0x53, 0x4c, 0x4f, 0x42, 0x1f]); // "!-1SLOB\x1F"

export interface SlobHeader {
  uuid: Uint8Array;
  encoding: string;
  compression: string;
  tags: Record<string, string>;
  contentTypes: string[];
  blobCount: number;
  storeOffset: number;
  fileSize: number;
  refsOffset: number;
}

export interface SlobRef {
  key: string;
  binIndex: number;
  itemIndex: number;
  fragment: string;
}

export interface SlobItem {
  contentType: string;
  data: Uint8Array;
  text?: string;
}

class ByteCursor {
  pos = 0;
  constructor(public readonly buf: Uint8Array) {}

  read(n: number): Uint8Array {
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  byte(): number {
    return this.buf[this.pos++]!;
  }
  u16(): number {
    const b0 = this.buf[this.pos]!;
    const b1 = this.buf[this.pos + 1]!;
    this.pos += 2;
    return (b0 << 8) | b1;
  }
  u32(): number {
    const v = readU32BE(this.buf, this.pos);
    this.pos += 4;
    return v;
  }
  u64(): number {
    const hi = readU32BE(this.buf, this.pos);
    const lo = readU32BE(this.buf, this.pos + 4);
    this.pos += 8;
    return hi * 0x1_0000_0000 + lo;
  }
  text(lenBytes: 1 | 2): string {
    const len = lenBytes === 1 ? this.byte() : this.u16();
    const bytes = this.read(len);
    return decodePascalText(bytes);
  }
}

function readU32BE(b: Uint8Array, o: number): number {
  return (
    (((b[o]! << 24) >>> 0) | ((b[o + 1]! << 16) >>> 0) | ((b[o + 2]! << 8) >>> 0) | b[o + 3]!) >>> 0
  );
}

function decodePascalText(bytes: Uint8Array): string {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return utf8.decode(bytes.subarray(0, end));
}

const cmpAsciiCI = (a: string, b: string): number => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};

export class SlobReader {
  header: SlobHeader = {
    uuid: new Uint8Array(),
    encoding: 'utf-8',
    compression: '',
    tags: {},
    contentTypes: [],
    blobCount: 0,
    storeOffset: 0,
    fileSize: 0,
    refsOffset: 0,
  };
  refCount = 0;
  private filePath = '';
  private fd: number | null = null;
  private refsDataOffset = 0;
  private refPositions: Float64Array = new Float64Array(0);

  private binCount = 0;
  private binDataOffset = 0;
  private binPositions: Float64Array = new Float64Array(0);

  private refCache: LRU<number, SlobRef>;
  private binCache: LRU<number, { contentTypeIds: Uint8Array; raw: Uint8Array }>;

  constructor() {
    this.refCache = new LRU<number, SlobRef>(512);
    this.binCache = new LRU<number, { contentTypeIds: Uint8Array; raw: Uint8Array }>(16);
  }

  loadFromFile(filePath: string): void {
    this.filePath = filePath;
    this.fd = fs.openSync(filePath, 'r');
    const stat = fs.fstatSync(this.fd);

    const headBytes = Buffer.alloc(Math.min(stat.size, 64 * 1024));
    fs.readSync(this.fd, headBytes, 0, headBytes.length, 0);

    const c = new ByteCursor(headBytes);
    const magic = c.read(MAGIC.length);
    for (let i = 0; i < MAGIC.length; i++) {
      if (magic[i] !== MAGIC[i]) throw new Error('Not a Slob file (bad magic)');
    }
    const uuid = c.read(16);
    const encoding = c.text(1);
    const compression = c.text(1);
    const tagCount = c.byte();
    const tags: Record<string, string> = {};
    for (let i = 0; i < tagCount; i++) {
      const k = c.text(1);
      const v = c.text(1);
      tags[k] = v;
    }
    const ctCount = c.byte();
    const contentTypes: string[] = [];
    for (let i = 0; i < ctCount; i++) contentTypes.push(c.text(2));
    const blobCount = c.u32();
    const storeOffset = c.u64();
    const fileSize = c.u64();
    const refsOffset = c.pos;

    this.header = {
      uuid: new Uint8Array(uuid),
      encoding,
      compression,
      tags,
      contentTypes,
      blobCount,
      storeOffset,
      fileSize,
      refsOffset,
    };

    // Read refs ItemList
    const refsHead = Buffer.alloc(4);
    fs.readSync(this.fd, refsHead, 0, 4, refsOffset);
    this.refCount = readU32BE(refsHead, 0);

    const posBytes = Buffer.alloc(this.refCount * 8);
    fs.readSync(this.fd, posBytes, 0, posBytes.length, refsOffset + 4);

    this.refPositions = new Float64Array(this.refCount);
    for (let i = 0; i < this.refCount; i++) {
      const hi = readU32BE(posBytes, i * 8);
      const lo = readU32BE(posBytes, i * 8 + 4);
      this.refPositions[i] = hi * 0x1_0000_0000 + lo;
    }
    this.refsDataOffset = refsOffset + 4 + this.refCount * 8;

    // Read store ItemList
    const storeHead = Buffer.alloc(4);
    fs.readSync(this.fd, storeHead, 0, 4, storeOffset);
    this.binCount = readU32BE(storeHead, 0);

    const binPosBytes = Buffer.alloc(this.binCount * 8);
    fs.readSync(this.fd, binPosBytes, 0, binPosBytes.length, storeOffset + 4);

    this.binPositions = new Float64Array(this.binCount);
    for (let i = 0; i < this.binCount; i++) {
      const hi = readU32BE(binPosBytes, i * 8);
      const lo = readU32BE(binPosBytes, i * 8 + 4);
      this.binPositions[i] = hi * 0x1_0000_0000 + lo;
    }
    this.binDataOffset = storeOffset + 4 + this.binCount * 8;
  }

  private decodeRef(i: number): SlobRef {
    const cached = this.refCache.get(i);
    if (cached) return cached;
    if (this.fd === null) throw new Error('Slob file not loaded');

    const start = this.refsDataOffset + this.refPositions[i]!;
    const maxLen = Math.min(1024, Number(this.header.fileSize) - start);
    const slice = Buffer.alloc(Math.max(0, maxLen));
    fs.readSync(this.fd, slice, 0, slice.length, start);

    let pos = 0;
    const keyLen = (slice[pos]! << 8) | slice[pos + 1]!;
    pos += 2;
    const keyBytes = slice.subarray(pos, pos + keyLen);
    pos += keyLen;

    const binIndex = readU32BE(slice, pos);
    pos += 4;
    const itemIndex = (slice[pos]! << 8) | slice[pos + 1]!;
    pos += 2;
    const fragLen = slice[pos]!;
    pos += 1;
    const fragment = decodePascalText(slice.subarray(pos, pos + fragLen));

    const ref: SlobRef = {
      key: decodePascalText(keyBytes),
      binIndex,
      itemIndex,
      fragment,
    };
    this.refCache.set(i, ref);
    return ref;
  }

  findRef(word: string): SlobRef | undefined {
    if (!this.refCount) return undefined;
    let lo = 0;
    let hi = this.refCount - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const r = this.decodeRef(mid);
      const cmp = cmpAsciiCI(word, r.key);
      if (cmp === 0) return r;
      if (cmp > 0) lo = mid + 1;
      else hi = mid - 1;
    }

    // Window scan around lo for collation variances
    const NEAR_WINDOW = 8;
    const wlo = Math.max(0, lo - NEAR_WINDOW);
    const whi = Math.min(this.refCount - 1, lo + NEAR_WINDOW);
    for (let i = wlo; i <= whi; i++) {
      const r = this.decodeRef(i);
      if (cmpAsciiCI(word, r.key) === 0) return r;
    }
    return undefined;
  }

  private getBin(binIndex: number): { contentTypeIds: Uint8Array; raw: Uint8Array } {
    const cached = this.binCache.get(binIndex);
    if (cached) return cached;
    if (this.fd === null) throw new Error('Slob file not loaded');

    const start = this.binDataOffset + this.binPositions[binIndex]!;
    const headSlice = Buffer.alloc(1024);
    fs.readSync(this.fd, headSlice, 0, 1024, start);

    const binItemCount = readU32BE(headSlice, 0);
    const ctIds = headSlice.subarray(4, 4 + binItemCount);
    const compLenPos = 4 + binItemCount;
    const compLen = readU32BE(headSlice, compLenPos);
    const compStart = start + compLenPos + 4;

    const compBytes = Buffer.alloc(compLen);
    fs.readSync(this.fd, compBytes, 0, compLen, compStart);

    let decompressed: Uint8Array;
    if (this.header.compression === 'zlib') {
      decompressed = unzlibSync(compBytes);
    } else if (!this.header.compression) {
      decompressed = compBytes;
    } else {
      throw new Error(`Unsupported Slob compression: ${this.header.compression}`);
    }

    const res = { contentTypeIds: new Uint8Array(ctIds), raw: decompressed };
    this.binCache.set(binIndex, res);
    return res;
  }

  readItem(ref: SlobRef): SlobItem {
    const bin = this.getBin(ref.binIndex);
    const ctId = bin.contentTypeIds[ref.itemIndex] ?? 0;
    const contentType = this.header.contentTypes[ctId] ?? 'text/plain';

    // In decompressed bin: pos array: u32 BE * binItemCount
    const itemCount = bin.contentTypeIds.length;
    const posOffset = ref.itemIndex * 4;
    const itemStart = readU32BE(bin.raw, posOffset);

    // At itemStart: 4-byte length + payload
    const itemLen = readU32BE(bin.raw, itemStart);
    const payload = bin.raw.subarray(itemStart + 4, itemStart + 4 + itemLen);

    const isText = contentType.startsWith('text/') || contentType.includes('json');
    return {
      contentType,
      data: payload,
      text: isText ? utf8.decode(payload) : undefined,
    };
  }

  lookup(word: string): SlobItem | undefined {
    const ref = this.findRef(word);
    if (!ref) return undefined;
    return this.readItem(ref);
  }

  getAllHeadwords(max = 20000): string[] {
    const count = Math.min(this.refCount, max);
    const words: string[] = [];
    for (let i = 0; i < count; i++) {
      words.push(this.decodeRef(i).key);
    }
    return words;
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
