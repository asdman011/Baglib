import * as fflate from 'fflate';
import type { BookDoc, SectionItem, TOCItem, BookMetadata } from './types';

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.avif', '.jxl'];

/**
 * Naturally sorts file paths segment-by-segment (e.g. Chapter 0060/002.jpg before Chapter 0060/010.jpg,
 * and base folders before suffixed siblings like 'Chapter 0060 (2)/').
 */
export function naturalPathSort(paths: string[]): string[] {
  return [...paths].sort((a, b) => {
    const segsA = a.split(/[\\/]/);
    const segsB = b.split(/[\\/]/);
    const minLen = Math.min(segsA.length, segsB.length);

    for (let i = 0; i < minLen; i++) {
      const segA = segsA[i];
      const segB = segsB[i];
      if (segA !== segB) {
        return segA.localeCompare(segB, undefined, { numeric: true, sensitivity: 'base' });
      }
    }
    return segsA.length - segsB.length;
  });
}

export interface ArchiveStreamOptions {
  filename?: string;
}

/**
 * Creates a memory-efficient BookDoc instance from a comic/archive buffer or File.
 * Extracts images lazily on demand and releases blob URLs upon page unload.
 */
export async function makeArchiveBookDoc(
  data: Uint8Array | ArrayBuffer | File,
  options: ArchiveStreamOptions = {}
): Promise<BookDoc> {
  const bytes = data instanceof File
    ? new Uint8Array(await data.arrayBuffer())
    : data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : data;

  const fileName = options.filename || (data instanceof File ? data.name : 'Comic Archive');

  // Decompress ZIP central directory / entries using fflate
  const unzipped = fflate.unzipSync(bytes);
  const entryNames = Object.keys(unzipped);

  // Filter image entries and naturally sort them
  const rawImageEntries = entryNames.filter((name) => {
    const lower = name.toLowerCase();
    return !name.endsWith('/') && IMAGE_EXTS.some((ext) => lower.endsWith(ext));
  });

  const sortedImageEntries = naturalPathSort(rawImageEntries);

  if (sortedImageEntries.length === 0) {
    throw new Error('No supported image files found in archive.');
  }

  // Parse ComicInfo.xml metadata if present
  const metadata: BookMetadata = {
    title: fileName.replace(/\.[^/.]+$/, ''),
  };

  const comicInfoKey = entryNames.find((k) => k.toLowerCase().endsWith('comicinfo.xml'));
  if (comicInfoKey && unzipped[comicInfoKey]) {
    try {
      const xmlStr = fflate.strFromU8(unzipped[comicInfoKey]);
      const titleMatch = xmlStr.match(/<Title>([\s\S]*?)<\/Title>/i);
      const writerMatch = xmlStr.match(/<Writer>([\s\S]*?)<\/Writer>/i);
      const pubMatch = xmlStr.match(/<Publisher>([\s\S]*?)<\/Publisher>/i);
      const summaryMatch = xmlStr.match(/<Summary>([\s\S]*?)<\/Summary>/i);

      if (titleMatch && titleMatch[1]) metadata.title = titleMatch[1].trim();
      if (writerMatch && writerMatch[1]) metadata.author = writerMatch[1].trim();
      if (pubMatch && pubMatch[1]) metadata.publisher = pubMatch[1].trim();
      if (summaryMatch && summaryMatch[1]) metadata.description = summaryMatch[1].trim();
    } catch {
      // Ignore XML parse errors in ComicInfo
    }
  }

  // Cache of active Blob URLs per page to manage memory
  const activeBlobUrls = new Map<string, string>();

  const getPageBlob = (entryName: string): Blob => {
    const rawBytes = unzipped[entryName];
    if (!rawBytes) throw new Error(`Image entry ${entryName} not found`);
    const ext = entryName.split('.').pop()?.toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return new Blob([rawBytes], { type: mime });
  };

  const sections: SectionItem[] = sortedImageEntries.map((name, idx) => {
    return {
      id: name,
      size: unzipped[name]?.length || 0,
      linear: 'yes',
      pageSpread: '',
      loadBlob: async () => getPageBlob(name),
      load: async () => {
        let url = activeBlobUrls.get(name);
        if (!url) {
          const blob = getPageBlob(name);
          url = URL.createObjectURL(blob);
          activeBlobUrls.set(name, url);
        }
        return url;
      },
      unload: () => {
        const url = activeBlobUrls.get(name);
        if (url) {
          URL.revokeObjectURL(url);
          activeBlobUrls.delete(name);
        }
      },
      createDocument: async () => {
        let url = activeBlobUrls.get(name);
        if (!url) {
          const blob = getPageBlob(name);
          url = URL.createObjectURL(blob);
          activeBlobUrls.set(name, url);
        }
        if (typeof document === 'undefined') {
          return { body: { innerHTML: `<img src="${url}">` } } as unknown as Document;
        }
        const doc = document.implementation.createHTMLDocument(name);
        doc.body.style.margin = '0';
        doc.body.style.padding = '0';
        doc.body.style.display = 'flex';
        doc.body.style.justifyContent = 'center';
        doc.body.style.alignItems = 'center';
        doc.body.style.backgroundColor = '#000000';
        const img = doc.createElement('img');
        img.src = url;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100vh';
        img.style.objectFit = 'contain';
        doc.body.appendChild(img);
        return doc;
      },
    };
  });

  const toc: TOCItem[] = sortedImageEntries.map((name, idx) => ({
    id: idx + 1,
    label: name.split(/[\\/]/).pop() || `Page ${idx + 1}`,
    href: name,
    index: idx,
  }));

  const bookDoc: BookDoc = {
    metadata,
    rendition: {
      layout: 'pre-paginated',
      spread: 'auto',
    },
    dir: 'ltr',
    toc,
    sections,
    splitTOCHref: (href: string) => [href, 0],
    resolveHref: (href: string) => {
      const idx = sections.findIndex((s) => s.id === href);
      return idx >= 0 ? { index: idx } : null;
    },
    getCover: async () => {
      if (sortedImageEntries.length > 0) {
        return getPageBlob(sortedImageEntries[0]);
      }
      return null;
    },
    destroy: () => {
      for (const url of activeBlobUrls.values()) {
        URL.revokeObjectURL(url);
      }
      activeBlobUrls.clear();
    },
  };

  return bookDoc;
}
