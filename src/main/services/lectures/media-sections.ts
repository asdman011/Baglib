import { open } from 'node:fs/promises';
import type { LectureSection } from '../../../shared/lectures';

/** Chapters are always near the start, or in the MP4 moov box, so a bounded read is enough. */
const HEAD_BYTES = 16 * 1024 * 1024;
const MAX_BOX_BYTES = 64 * 1024 * 1024;

const text = (bytes: Buffer, encoding: number) => {
  if (encoding === 1 || encoding === 2) {
    let body = bytes;
    let little = encoding === 1;
    if (encoding === 1 && body.length >= 2) {
      little = !(body[0] === 0xfe && body[1] === 0xff);
      if ((body[0] === 0xff && body[1] === 0xfe) || (body[0] === 0xfe && body[1] === 0xff)) body = body.subarray(2);
    }
    if (!little) { body = Buffer.from(body); body.swap16(); }
    return body.toString('utf16le').replace(/\0+$/u, '');
  }
  return bytes.toString(encoding === 3 ? 'utf8' : 'latin1').replace(/\0+$/u, '');
};
const syncsafe = (bytes: Buffer, at: number) => (bytes[at] << 21) | (bytes[at + 1] << 14) | (bytes[at + 2] << 7) | bytes[at + 3];

/** ID3v2.3 and 2.4 CHAP frames, as podcast and lecture tools write them. */
export function id3Sections(head: Buffer): LectureSection[] {
  if (head.length < 10 || head.toString('latin1', 0, 3) !== 'ID3') return [];
  const version = head[3];
  const end = Math.min(head.length, 10 + syncsafe(head, 6));
  const sections: LectureSection[] = [];
  for (let at = 10; at + 10 <= end;) {
    const id = head.toString('latin1', at, at + 4);
    if (!/^[A-Z0-9]{4}$/u.test(id)) break;
    const size = version === 4 ? syncsafe(head, at + 4) : head.readUInt32BE(at + 4);
    const body = head.subarray(at + 10, at + 10 + size);
    if (id === 'CHAP') {
      const terminator = body.indexOf(0);
      const startMs = body.readUInt32BE(terminator + 1);
      let title = '';
      for (let sub = terminator + 17; sub + 10 <= body.length;) {
        const subSize = version === 4 ? syncsafe(body, sub + 4) : body.readUInt32BE(sub + 4);
        if (body.toString('latin1', sub, sub + 4) === 'TIT2') title = text(body.subarray(sub + 11, sub + 10 + subSize), body[sub + 10]);
        sub += 10 + subSize;
      }
      sections.push({ title: title.trim() || `${sections.length + 1}`, start: startMs / 1000 });
    }
    at += 10 + size;
  }
  return sections;
}

/** Nero `chpl` chapters in moov/udta, which most MP4 and M4A chapter tools write. */
export function chplSections(moov: Buffer): LectureSection[] {
  const find = (buffer: Buffer, type: string): Buffer | null => {
    for (let at = 0; at + 8 <= buffer.length;) {
      const size = buffer.readUInt32BE(at);
      if (size < 8) return null;
      if (buffer.toString('latin1', at + 4, at + 8) === type) return buffer.subarray(at + 8, at + size);
      at += size;
    }
    return null;
  };
  const chpl = find(find(moov, 'udta') ?? Buffer.alloc(0), 'chpl');
  if (!chpl) return [];
  let at = chpl[0] ? 9 : 5;
  const count = chpl[at - 1];
  const sections: LectureSection[] = [];
  for (let index = 0; index < count && at + 9 <= chpl.length; index++) {
    const start = Number(chpl.readBigUInt64BE(at)) / 10_000_000;
    const length = chpl[at + 8];
    sections.push({ title: chpl.toString('utf8', at + 9, at + 9 + length).trim() || `${index + 1}`, start });
    at += 9 + length;
  }
  return sections;
}

/** Matroska Chapters: Segment › Chapters › EditionEntry › ChapterAtom › (ChapterTimeStart, ChapterDisplay › ChapString). */
export function matroskaSections(head: Buffer): LectureSection[] {
  const vint = (at: number, keepMarker: boolean): { value: number; length: number; unknown: boolean } | null => {
    const first = head[at];
    if (first === undefined || first === 0) return null;
    const length = Math.clz32(first) - 23;
    if (at + length > head.length) return null;
    let value = keepMarker ? first : first & (0xff >> length);
    let all = value === (0xff >> length);
    for (let index = 1; index < length; index++) { value = value * 256 + head[at + index]; all &&= head[at + index] === 0xff; }
    return { value, length, unknown: !keepMarker && all };
  };
  const element = (at: number) => {
    const id = vint(at, true), size = id && vint(at + id.length, false);
    return id && size ? { id: id.value, start: at + id.length + size.length, size: size.unknown ? Infinity : size.value } : null;
  };
  const children = (from: number, to: number) => {
    const found: { id: number; start: number; end: number }[] = [];
    for (let at = from; at < Math.min(to, head.length);) {
      const item = element(at);
      if (!item) break;
      const end = item.size === Infinity ? Math.min(to, head.length) : item.start + item.size;
      found.push({ id: item.id, start: item.start, end });
      if (item.size === Infinity && item.id !== 0x18538067) break;
      at = item.size === Infinity ? item.start : end;
    }
    return found;
  };
  const uint = (from: number, to: number) => { let value = 0; for (let at = from; at < to; at++) value = value * 256 + head[at]; return value; };
  const segment = children(0, head.length).find(item => item.id === 0x18538067);
  const chapters = segment && children(segment.start, segment.end).find(item => item.id === 0x1043a770);
  const edition = chapters && children(chapters.start, chapters.end).find(item => item.id === 0x45b9);
  if (!edition) return [];
  return children(edition.start, edition.end).filter(item => item.id === 0xb6).map((atom, index) => {
    const parts = children(atom.start, atom.end);
    const time = parts.find(item => item.id === 0x91);
    const display = parts.find(item => item.id === 0x80);
    const name = display && children(display.start, display.end).find(item => item.id === 0x85);
    return { title: (name ? head.toString('utf8', name.start, name.end) : '').trim() || `${index + 1}`, start: time ? uint(time.start, time.end) / 1e9 : 0 };
  });
}

export async function readSections(filename: string): Promise<LectureSection[]> {
  const file = await open(filename, 'r');
  try {
    const { size } = await file.stat();
    const head = Buffer.alloc(Math.min(size, HEAD_BYTES));
    await file.read(head, 0, head.length, 0);
    if (head.toString('latin1', 0, 3) === 'ID3') return id3Sections(head);
    if (head.readUInt32BE(0) === 0x1a45dfa3) return matroskaSections(head);
    if (head.toString('latin1', 4, 8) !== 'ftyp') return [];
    // The moov box can sit after the media data, so walk the top-level boxes by their sizes.
    for (let at = 0; at + 8 <= size;) {
      const header = Buffer.alloc(16);
      await file.read(header, 0, 16, at);
      let length = header.readUInt32BE(0);
      if (length === 1) length = Number(header.readBigUInt64BE(8));
      if (length === 0) length = size - at;
      if (length < 8) return [];
      if (header.toString('latin1', 4, 8) === 'moov') {
        if (length > MAX_BOX_BYTES) return [];
        const moov = Buffer.alloc(length - 8);
        await file.read(moov, 0, moov.length, at + 8);
        return chplSections(moov);
      }
      at += length;
    }
    return [];
  } finally { await file.close(); }
}


export interface MediaTags { title?: string; speaker?: string; recordingDate?: string; coverBuffer?: Buffer; coverMimeType?: string }

/** ID3 text frames share the same encoding rules as chapter titles. */
export function id3Tags(head: Buffer): MediaTags {
  const tags: MediaTags = {};
  if (head.length < 10 || head.toString('latin1', 0, 3) !== 'ID3' || ![3, 4].includes(head[3])) return tags;
  const end = Math.min(head.length, 10 + syncsafe(head, 6));
  for (let at = 10; at + 10 <= end;) {
    const id = head.toString('latin1', at, at + 4);
    const size = head[3] === 4 ? syncsafe(head, at + 4) : head.readUInt32BE(at + 4);
    if (!/^[A-Z0-9]{4}$/u.test(id) || size < 1 || at + 10 + size > end) break;
    if (id === 'APIC' && !tags.coverBuffer) {
      const body = head.subarray(at + 10, at + 10 + size);
      const mimeEnd = body.indexOf(0, 1);
      const wide = body[0] === 1 || body[0] === 2;
      let end = mimeEnd + 2;
      if (mimeEnd > 0) {
        while (end < body.length && (body[end] !== 0 || (wide && body[end + 1] !== 0))) end += wide ? 2 : 1;
        const image = body.subarray(end + (wide ? 2 : 1));
        if (image.length && image.length <= 12 * 1024 * 1024) {
          tags.coverBuffer = image;
          tags.coverMimeType = body.toString('latin1', 1, mimeEnd);
        }
      }
    }
    const field = ({ TIT2: 'title', TPE1: 'speaker', TDRC: 'recordingDate', TYER: 'recordingDate' } as const)[id as 'TIT2'];
    if (field && !(id === 'TYER' && tags.recordingDate)) {
      const bytes = head.subarray(at + 11, at + 10 + size);
      if (![1, 2].includes(head[at + 10]) || bytes.length % 2 === 0) tags[field] = text(bytes, head[at + 10]).trim().slice(0, 1000) || undefined;
    }
    at += 10 + size;
  }
  return tags;
}

function mp4Children(buffer: Buffer): { type: string; body: Buffer }[] {
  const items: { type: string; body: Buffer }[] = [];
  for (let at = 0; at + 8 <= buffer.length;) {
    let size = buffer.readUInt32BE(at);
    const header = size === 1 ? 16 : 8;
    if (size === 1) { if (at + 16 > buffer.length) break; size = Number(buffer.readBigUInt64BE(at + 8)); }
    if (size === 0) size = buffer.length - at;
    if (!Number.isSafeInteger(size) || size < header || at + size > buffer.length) break;
    items.push({ type: buffer.toString('latin1', at + 4, at + 8), body: buffer.subarray(at + header, at + size) });
    at += size;
  }
  return items;
}

/** FullBox meta has four version/flags bytes before its ilst children. */
export function mp4Tags(moov: Buffer): MediaTags {
  const tags: MediaTags = {};
  const udta = mp4Children(moov).find(item => item.type === 'udta');
  const meta = mp4Children(udta?.body ?? Buffer.alloc(0)).find(item => item.type === 'meta');
  const ilst = mp4Children(meta?.body.subarray(4) ?? Buffer.alloc(0)).find(item => item.type === 'ilst');
  for (const item of mp4Children(ilst?.body ?? Buffer.alloc(0))) {
    const field = ({ '\xa9nam': 'title', '\xa9ART': 'speaker', '\xa9day': 'recordingDate' } as const)[item.type as '\xa9nam'];
    const data = mp4Children(item.body).find(child => child.type === 'data')?.body;
    if (item.type === 'covr' && data && data.length > 8 && data.length <= 12 * 1024 * 1024) {
      tags.coverBuffer = data.subarray(8);
      tags.coverMimeType = (data.readUInt32BE(0) & 0xffffff) === 14 ? 'image/png' : 'image/jpeg';
    }
    if (field && data && data.length >= 8) {
      const encoding = data.readUInt32BE(0) & 0xffffff;
      tags[field] = (encoding === 2 ? text(data.subarray(8), 2) : data.toString('utf8', 8)).replace(/\0+$/u, '').trim().slice(0, 1000) || undefined;
    }
  }
  return tags;
}

function ebmlChildren(buffer: Buffer): { id: number; body: Buffer }[] {
  const items: { id: number; body: Buffer }[] = [];
  const vint = (at: number, marker: boolean) => {
    const first = buffer[at];
    if (!first) return null;
    const length = Math.clz32(first) - 23;
    if (at + length > buffer.length || (marker && length > 4)) return null;
    let value = marker ? first : first & (0xff >> length);
    let unknown = !marker && value === (0xff >> length);
    for (let i = 1; i < length; i++) { value = value * 256 + buffer[at + i]; unknown &&= buffer[at + i] === 255; }
    return { length, value, unknown };
  };
  for (let at = 0; at < buffer.length;) {
    const id = vint(at, true);
    const size = id && vint(at + id.length, false);
    if (!id || !size) break;
    const start = at + id.length + size.length;
    const end = size.unknown ? buffer.length : start + size.value;
    if (!Number.isSafeInteger(end) || (end > buffer.length && id.value !== 0x18538067)) break;
    items.push({ id: id.value, body: buffer.subarray(start, Math.min(end, buffer.length)) });
    at = end;
  }
  return items;
}

export function matroskaTags(head: Buffer): MediaTags {
  const tags: MediaTags = {};
  const segment = ebmlChildren(head).find(item => item.id === 0x18538067);
  if (!segment) return tags;
  const children = ebmlChildren(segment.body);
  const info = children.find(item => item.id === 0x1549a966);
  const title = ebmlChildren(info?.body ?? Buffer.alloc(0)).find(item => item.id === 0x7ba9);
  if (title) tags.title = title.body.toString('utf8').trim().slice(0, 1000);
  const tagRoot = children.find(item => item.id === 0x1254c367);
  const visit = (body: Buffer, depth: number) => {
    if (depth > 8) return;
    for (const item of ebmlChildren(body)) {
      if (item.id === 0x67c8) {
        const parts = ebmlChildren(item.body);
        const name = parts.find(part => part.id === 0x45a3)?.body.toString('utf8').toUpperCase();
        const value = parts.find(part => part.id === 0x4487)?.body.toString('utf8').trim().slice(0, 1000);
        const field = ({ TITLE: 'title', ARTIST: 'speaker', DATE_RECORDED: 'recordingDate' } as const)[name as 'TITLE'];
        if (field && value) tags[field] = value;
      }
      if ([0x7373, 0x67c8].includes(item.id)) visit(item.body, depth + 1);
    }
  };
  visit(tagRoot?.body ?? Buffer.alloc(0), 0);
  return tags;
}

export async function readMediaTags(filename: string): Promise<MediaTags> {
  const file = await open(filename, 'r');
  try {
    const { size } = await file.stat();
    const head = Buffer.alloc(Math.min(size, HEAD_BYTES));
    await file.read(head, 0, head.length, 0);
    if (head.toString('latin1', 0, 3) === 'ID3') return id3Tags(head);
    if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) return await readMatroskaTags(file, size);
    if (head.toString('latin1', 4, 8) !== 'ftyp') return {};
    for (let at = 0; at + 8 <= size;) {
      const header = Buffer.alloc(16);
      await file.read(header, 0, 16, at);
      let length = header.readUInt32BE(0);
      const headerSize = length === 1 ? 16 : 8;
      if (length === 1) length = Number(header.readBigUInt64BE(8));
      if (length === 0) length = size - at;
      if (!Number.isSafeInteger(length) || length < headerSize || at + length > size) return {};
      if (header.toString('latin1', 4, 8) === 'moov') {
        if (length > MAX_BOX_BYTES) return {};
        const moov = Buffer.alloc(length - headerSize);
        await file.read(moov, 0, moov.length, at + headerSize);
        return mp4Tags(moov);
      }
      at += length;
    }
    return {};
  } finally { await file.close(); }
}


/** Skip media clusters by their declared sizes, so end-of-file Tags in long videos stay bounded. */
async function readMatroskaTags(file: Awaited<ReturnType<typeof open>>, fileSize: number): Promise<MediaTags> {
  const headerAt = async (at: number) => {
    const bytes = Buffer.alloc(16);
    const { bytesRead } = await file.read(bytes, 0, 16, at);
    const vint = (from: number, marker: boolean) => {
      const first = bytes[from];
      if (!first) return null;
      const length = Math.clz32(first) - 23;
      if (from + length > bytesRead || (marker && length > 4)) return null;
      let value = marker ? first : first & (255 >> length);
      let unknown = !marker && value === (255 >> length);
      for (let index = 1; index < length; index++) { value = value * 256 + bytes[from + index]; unknown &&= bytes[from + index] === 255; }
      return { value, length, unknown };
    };
    const id = vint(0, true);
    const size = id && vint(id.length, false);
    if (!id || !size) return null;
    const start = at + id.length + size.length;
    const end = size.unknown ? fileSize : start + size.value;
    return Number.isSafeInteger(end) && end <= fileSize ? { id: id.value, start, end, unknown: size.unknown } : null;
  };
  let at = 0;
  let segment = false;
  const found: Buffer[] = [];
  for (let count = 0; count < 100_000 && at < fileSize; count++) {
    const item = await headerAt(at);
    if (!item) break;
    if (item.id === 0x18538067) { segment = true; at = item.start; continue; }
    if (segment && [0x1549a966, 0x1254c367].includes(item.id) && item.end - at <= MAX_BOX_BYTES) {
      const data = Buffer.alloc(item.end - at);
      await file.read(data, 0, data.length, at);
      found.push(data);
    }
    if (item.unknown || item.end <= at) break;
    at = item.end;
  }
  return matroskaTags(Buffer.concat([Buffer.from([0x18, 0x53, 0x80, 0x67, 0xff]), ...found]));
}
