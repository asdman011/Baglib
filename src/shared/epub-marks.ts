/**
 * EPUB study markup location adapter and grouping utilities (KEY-274 / Waves 8.3 & 9.2).
 *
 * Bridges the gap between rigid PDF coordinates (pages and normalized rects) and reflowable
 * EPUB Canonical Fragment Identifiers (CFIs), allowing ReaderMarkupBar, PdfMarkPopover,
 * and PdfMarksList to operate across both document formats without component duplication.
 *
 * Marks are saved solely to BagLib's SQLite database (`knowledge` table) and EPUB files on
 * disk are never modified (ADR-012 Safe Save compliance).
 */

import type { TextStyle, ListedMark } from './pdf-markup';
import { markPage } from './pdf-markup';

export interface EpubLocationData {
  cfi: string;
  chapter?: string;
  sectionIndex?: number;
  sectionId?: string;
  page?: number;
  text?: string;
  color?: string;
  style?: TextStyle;
}

/** Check if a string has the standard EPUB CFI format (e.g. `epubcfi(...)` or `cfi(...)`). */
export function isCFIString(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return /^(epubcfi|cfi)\(.*\)$/iu.test(trimmed);
}

/**
 * Parses an EPUB location string. Supports:
 * 1. Plain CFI strings: `epubcfi(/6/4[chap01]!/4/2/10/1:0,/4/2/10/1:25)`
 * 2. JSON-encoded location objects containing a `cfi` property.
 */
export function parseEpubLocation(location: string): EpubLocationData | null {
  if (!location || typeof location !== 'string') return null;
  const trimmed = location.trim();

  // 1. Direct CFI string
  if (isCFIString(trimmed)) {
    return { cfi: trimmed };
  }

  // 2. JSON location payload
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof obj.cfi === 'string' && (isCFIString(obj.cfi) || obj.cfi.startsWith('/'))) {
        const pageNum = typeof obj.page === 'number' && Number.isInteger(obj.page) && obj.page > 0
          ? obj.page
          : undefined;
        const sectionIdx = typeof obj.sectionIndex === 'number' && Number.isInteger(obj.sectionIndex) && obj.sectionIndex >= 0
          ? obj.sectionIndex
          : undefined;
        const style = obj.style === 'underline' || obj.style === 'strike' || obj.style === 'highlight'
          ? (obj.style as TextStyle)
          : undefined;

        return {
          cfi: obj.cfi,
          chapter: typeof obj.chapter === 'string' && obj.chapter.trim() ? obj.chapter.trim() : undefined,
          sectionIndex: sectionIdx,
          sectionId: typeof obj.sectionId === 'string' ? obj.sectionId : undefined,
          page: pageNum,
          text: typeof obj.text === 'string' ? obj.text : undefined,
          color: typeof obj.color === 'string' ? obj.color : undefined,
          style,
        };
      }
    } catch {
      return null;
    }
  }

  return null;
}

/** Serializes an EPUB location into a JSON string suitable for storage in `knowledge.location`. */
export function serializeEpubLocation(data: EpubLocationData): string {
  const payload: Record<string, unknown> = {
    cfi: data.cfi,
  };
  if (data.chapter) payload.chapter = data.chapter;
  if (data.sectionIndex !== undefined) payload.sectionIndex = data.sectionIndex;
  if (data.sectionId) payload.sectionId = data.sectionId;
  if (data.page !== undefined) payload.page = data.page;
  if (data.text) payload.text = data.text;
  if (data.color) payload.color = data.color;
  if (data.style && data.style !== 'highlight') payload.style = data.style;

  return JSON.stringify(payload);
}

/** Checks whether a location string represents reflowable EPUB markup. */
export function isEpubLocation(locationOrItem: { location: string } | string): boolean {
  const loc = typeof locationOrItem === 'string' ? locationOrItem : locationOrItem.location;
  return parseEpubLocation(loc) !== null;
}

/** Extracts the human-readable chapter title for a mark, if present. */
export function extractMarkChapter(item: { location: string; chapter?: string } | string): string | null {
  if (typeof item !== 'string' && item.chapter && item.chapter.trim()) return item.chapter.trim();
  const loc = typeof item === 'string' ? item : item.location;
  const parsed = parseEpubLocation(loc);
  return parsed?.chapter ?? null;
}

/** Extracts the page number of a mark, supporting both PDF and EPUB location shapes. */
export function extractMarkPage(item: { location: string } | string): number | null {
  const loc = typeof item === 'string' ? item : item.location;
  const epubLoc = parseEpubLocation(loc);
  if (epubLoc?.page) return epubLoc.page;
  return markPage(loc);
}

/** Extracts the CFI string of a mark, if present. */
export function extractMarkCfi(item: { location: string } | string): string | null {
  const loc = typeof item === 'string' ? item : item.location;
  const epubLoc = parseEpubLocation(loc);
  return epubLoc?.cfi ?? (isCFIString(loc) ? loc.trim() : null);
}

/**
 * Groups listed marks by chapter for the EPUB Marks list.
 * Preserves reading order or creation order within each chapter bucket.
 */
export function groupMarksByChapter(
  marks: ListedMark[],
  fallbackTitle = 'General',
): Map<string, ListedMark[]> {
  const groups = new Map<string, ListedMark[]>();

  for (const mark of marks) {
    const chapter = mark.chapter?.trim() || fallbackTitle;
    const list = groups.get(chapter);
    if (list) {
      list.push(mark);
    } else {
      groups.set(chapter, [mark]);
    }
  }

  return groups;
}

/**
 * Groups listed marks by page for the PDF Marks list.
 */
export function groupMarksByPage(
  marks: ListedMark[],
): Map<number, ListedMark[]> {
  const groups = new Map<number, ListedMark[]>();

  for (const mark of marks) {
    const page = mark.page ?? 0;
    const list = groups.get(page);
    if (list) {
      list.push(mark);
    } else {
      groups.set(page, [mark]);
    }
  }

  return groups;
}

/**
 * Helper to split an EPUB CFI into sortable numeric and offset tokens.
 * Used to sort marks sequentially according to document spine and DOM tree reading order.
 */
function parseCfiTokens(cfi: string): Array<number | string> {
  // Strip epubcfi(...) or cfi(...) wrapper
  const inner = cfi.replace(/^(epubcfi|cfi)\((.*)\)$/iu, '$2');
  // For ranged CFIs (parent,start,end), starting location is parent + start
  const parts = inner.split(',');
  const startPath = parts.length > 1 ? parts[0] + parts[1] : parts[0];
  // Extract parts delimited by / or : or !
  const rawParts = startPath.split(/[/!:]/u).filter(p => p.length > 0);

  const tokens: Array<number | string> = [];
  for (const part of rawParts) {
    // Strip assertion brackets like [chap01]
    const clean = part.replace(/\[.*?\]/gu, '');
    const num = Number(clean);
    if (!isNaN(num)) {
      tokens.push(num);
    } else {
      tokens.push(clean);
    }
  }
  return tokens;
}

/**
 * Compares two EPUB CFIs.
 * Returns negative if `a` precedes `b` in reading order, positive if `b` precedes `a`, or 0 if identical.
 */
export function compareCfi(a: string, b: string): number {
  if (a === b) return 0;
  const tokensA = parseCfiTokens(a);
  const tokensB = parseCfiTokens(b);
  const minLen = Math.min(tokensA.length, tokensB.length);

  for (let i = 0; i < minLen; i++) {
    const tokA = tokensA[i];
    const tokB = tokensB[i];

    if (typeof tokA === 'number' && typeof tokB === 'number') {
      if (tokA !== tokB) return tokA - tokB;
    } else {
      const cmp = String(tokA).localeCompare(String(tokB));
      if (cmp !== 0) return cmp;
    }
  }

  return tokensA.length - tokensB.length;
}

/**
 * Constructs an EPUB Canonical Fragment Identifier for a given section index and character offsets.
 * Format: `epubcfi(/6/{spineStep}[{sectionId}]!/4/2/1:{startOffset},/4/2/1:{endOffset})`
 */
export function buildEpubCfi(
  sectionIndex: number,
  startOffset: number,
  endOffset?: number,
  sectionId?: string,
): string {
  const spineStep = (sectionIndex + 1) * 2;
  const idAssertion = sectionId ? `[${sectionId}]` : '';
  const basePath = `/6/${spineStep}${idAssertion}!/4/2`;

  if (endOffset === undefined || endOffset === startOffset) {
    return `epubcfi(${basePath}/1:${startOffset})`;
  }

  const startPart = `/1:${startOffset}`;
  const endPart = `/1:${endOffset}`;
  return `epubcfi(${basePath},${startPart},${endPart})`;
}
