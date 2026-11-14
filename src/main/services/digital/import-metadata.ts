import { isValidIsbn } from '../../../shared/validators/metadata-validator';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DOMParser } from 'linkedom';
import yauzl from 'yauzl';
import type { ExtractedEbookMetadata } from '../../../shared/types/digital-file';

type Metadata = Partial<ExtractedEbookMetadata>;
const MAX_COVER_BYTES = 16 * 1024 * 1024;
const MAX_XML_BYTES = 1024 * 1024;

function xmlDocument(xml: string) {
  // External entities are never resolved by linkedom. Reject DTDs explicitly.
  if (/<!DOCTYPE/i.test(xml)) throw new Error('Unsupported XML DTD');
  return new DOMParser().parseFromString(xml, 'text/xml');
}

interface XmlNode {
  localName: string;
  textContent: string | null;
  id: string;
  getAttribute(name: string): string | null;
  querySelectorAll(selectors: string): ArrayLike<XmlNode>;
}
type XmlRoot = Pick<XmlNode, 'querySelectorAll'>;

function elements(root: XmlRoot, name: string): XmlNode[] {
  return Array.from(root.querySelectorAll('*')).filter(element => element.localName.split(':').pop() === name);
}

function text(root: XmlRoot, name: string): string | undefined {
  return elements(root, name)[0]?.textContent?.trim() || undefined;
}

export async function readFb2Metadata(filePath: string): Promise<Metadata> {
  const handle = await fs.open(filePath, 'r');
  let xml: string;
  try {
    const { size } = await handle.stat();
    if (size > 32 * 1024 * 1024) return {};
    const buffer = Buffer.alloc(size);
    const { bytesRead } = await handle.read(buffer, 0, size, 0);
    xml = buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
  const doc = xmlDocument(xml);
  if (doc.documentElement.localName.split(':').pop() !== 'FictionBook') return {};
  const info = elements(doc, 'title-info')[0];
  if (!info) return {};
  const authors = elements(info, 'author').map(author =>
    ['first-name', 'middle-name', 'last-name'].map(name => text(author, name)).filter(Boolean).join(' ') || text(author, 'nickname') || ''
  ).filter(Boolean);
  const image = elements(elements(info, 'coverpage')[0] || info, 'image')[0];
  const href = image?.getAttribute('l:href') || image?.getAttribute('xlink:href') || image?.getAttribute('href');
  const binary = href?.startsWith('#') ? elements(doc, 'binary').find(item => item.id === href.slice(1)) : undefined;
  const mime = binary?.getAttribute('content-type') || '';
  const encoded = binary?.textContent?.replace(/\s/g, '') || '';
  const coverBuffer = /^image\/(jpeg|png|gif|webp)$/.test(mime) && encoded.length <= Math.ceil(MAX_COVER_BYTES / 3) * 4
    ? Buffer.from(encoded, 'base64') : undefined;
  return { title: text(info, 'book-title'), authors, language: text(info, 'lang'), description: text(info, 'annotation'),
    coverBuffer, coverMimeType: coverBuffer ? mime : undefined, format: 'FB2' };
}

function readEntry(zip: yauzl.ZipFile, entry: yauzl.Entry, limit: number): Promise<Buffer> {
  if (entry.uncompressedSize > limit) return Promise.reject(new Error('Archive entry too large'));
  return new Promise((resolve, reject) => zip.openReadStream(entry, (error, stream) => {
    if (error || !stream) return reject(error || new Error('Missing ZIP stream'));
    const chunks: Buffer[] = [];
    let size = 0;
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) stream.destroy(new Error('Archive entry too large'));
      else chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  }));
}

export async function readCbzMetadata(filePath: string): Promise<Metadata> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (error, archive) => {
    if (error || !archive) reject(error || new Error('Missing ZIP archive'));
    else resolve(archive);
  }));
  try {
    const entries = await new Promise<yauzl.Entry[]>((resolve, reject) => {
      const selected: yauzl.Entry[] = [];
      let count = 0;
      zip.on('error', reject);
      zip.on('entry', (entry: yauzl.Entry) => {
        if (++count > 100000) return reject(new Error('Too many ZIP entries'));
        if (/(?:^|\/)ComicInfo\.xml$/i.test(entry.fileName) || /\.(?:jpe?g|png|gif|webp|bmp|avif)$/i.test(entry.fileName)) selected.push(entry);
        zip.readEntry();
      });
      zip.on('end', () => resolve(selected));
      zip.readEntry();
    });
    const infoEntry = entries.find(entry => /(?:^|\/)ComicInfo\.xml$/i.test(entry.fileName));
    let meta: Metadata = { format: 'CBZ' };
    if (infoEntry && infoEntry.uncompressedSize <= MAX_XML_BYTES) {
      try {
        const doc = xmlDocument((await readEntry(zip, infoEntry, MAX_XML_BYTES)).toString('utf8'));
        const year = Number(text(doc, 'Year'));
        meta = { ...meta, title: text(doc, 'Title'), authors: text(doc, 'Writer')?.split(/[,;]/).map(name => name.trim()).filter(Boolean),
          publisher: text(doc, 'Publisher'), description: text(doc, 'Summary'), language: text(doc, 'LanguageISO'),
          publicationYear: Number.isInteger(year) && year > 0 ? year : undefined };
      } catch { /* Cover remains available when ComicInfo is malformed. */ }
    }
    const images = entries.filter(entry => !/\.xml$/i.test(entry.fileName)).sort((a, b) => {
      const left = a.fileName.split('/');
      const right = b.fileName.split('/');
      for (let index = 0; index < Math.min(left.length, right.length); index++) {
        const order = left[index].localeCompare(right[index], undefined, { numeric: true, sensitivity: 'base' });
        if (order) return order;
      }
      return left.length - right.length;
    });
    const cover = images[0];
    if (cover && cover.uncompressedSize <= MAX_COVER_BYTES) {
      const ext = path.extname(cover.fileName).slice(1).toLowerCase();
      try {
        meta.coverBuffer = await readEntry(zip, cover, MAX_COVER_BYTES);
        meta.coverMimeType = 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
      } catch { /* Artwork is optional. */ }
    }
    return meta;
  } finally { zip.close(); }
}

export async function readMobiMetadata(filePath: string, format: 'MOBI' | 'AZW3'): Promise<Metadata> {
  const handle = await fs.open(filePath, 'r');
  const meta: Metadata = { format, authors: [] };
  try {
    const { size } = await handle.stat();
    const read = async (offset: number, length: number, limit: number) => {
      if (offset < 0 || length < 0 || length > limit || offset + length > size) throw new Error('Invalid MOBI record');
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      if (bytesRead !== length) throw new Error('Truncated MOBI record');
      return buffer;
    };
    const header = await read(0, 78, 78);
    meta.title = header.subarray(0, 32).toString('latin1').replace(/\0.*$/g, '').trim() || undefined;
    const count = header.readUInt16BE(76);
    if (!count) return meta;
    const table = await read(78, count * 8, 65535 * 8);
    const offsets = Array.from({ length: count }, (_, index) => table.readUInt32BE(index * 8));
    offsets.push(size);
    if (offsets[0] < 78 + count * 8 || offsets.some((offset, index) => offset > size || (index > 0 && offset < offsets[index - 1]))) return meta;
    const rec0 = await read(offsets[0], offsets[1] - offsets[0], 2 * 1024 * 1024);
    if (rec0.length < 132 || rec0.toString('ascii', 16, 20) !== 'MOBI') return meta;
    const headerLength = rec0.readUInt32BE(20);
    const exth = 16 + headerLength;
    if (headerLength < 116 || !(rec0.readUInt32BE(128) & 0x40) || exth + 12 > rec0.length || rec0.toString('ascii', exth, exth + 4) !== 'EXTH') return meta;
    const exthEnd = exth + rec0.readUInt32BE(exth + 4);
    if (exthEnd > rec0.length || exthEnd < exth + 12) return meta;
    const records = rec0.readUInt32BE(exth + 8);
    const imageOffsets = new Map<number, number>();
    let position = exth + 12;
    for (let index = 0; index < records && position + 8 <= exthEnd; index++) {
      const tag = rec0.readUInt32BE(position);
      const length = rec0.readUInt32BE(position + 4);
      if (length < 8 || position + length > exthEnd) break;
      const value = rec0.subarray(position + 8, position + length);
      const content = value.toString('utf8').trim();
      switch (tag) {
        case 100:
          if (content) meta.authors!.push(content);
          break;
        case 101:
          meta.publisher = content;
          break;
        case 103:
          meta.description = content;
          break;
        case 104:
          if (isValidIsbn(content.replace(/[-\s]/g, ''))) meta.isbn = content.replace(/[-\s]/g, '');
          break;
        case 106:
          meta.publicationYear = Number(content.match(/(?:18|19|20)\d{2}/)?.[0]) || undefined;
          break;
        case 503:
          if (content) meta.title = content;
          break;
        case 524:
          meta.language = content;
          break;
        case 201:
        case 202:
          if (value.length === 4) imageOffsets.set(tag, value.readUInt32BE());
          break;
      }
      position += length;
    }
    const resourceStart = rec0.readUInt32BE(108);
    for (const tag of [201, 202]) {
      const relative = imageOffsets.get(tag);
      if (relative === undefined || relative === 0xffffffff) continue;
      const index = resourceStart + relative;
      if (index < 1 || index >= count) continue;
      try {
        const image = await read(offsets[index], offsets[index + 1] - offsets[index], MAX_COVER_BYTES);
        const mime = image.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? 'image/jpeg'
          : image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
          : /^GIF8[79]a/.test(image.toString('ascii', 0, 6)) ? 'image/gif' : undefined;
        if (mime) {
          meta.coverBuffer = image;
          meta.coverMimeType = mime;
          break;
        }
      } catch { /* Invalid/oversized cover falls through to thumbnail. */ }
    }
    return meta;
  } catch {
    return meta;
  } finally {
    await handle.close();
  }
}
