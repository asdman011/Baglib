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
