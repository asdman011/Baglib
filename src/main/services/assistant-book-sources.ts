import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { DOMParser } from 'linkedom';
import { getDatabase } from '../database/connection';
import { inspectPdfFile } from './pdf-editor/inspection';
import { extractPdfPageTexts } from './pdf-editor/accessibility';
import { pdfEngineTools } from './pdf-editor/tools';
import { bookStudyTarget, parseBookTarget } from '../../shared/study-notes';
import type { AssistantSource } from '../../shared/study-assistant';

export class AssistantBookError extends Error {
  constructor(code: 'no-text-layer', readonly target: string) { super(code); }
}

type BookFile = { title: string; sourceId: string; path: string };
export interface BookSourceDependencies {
  resolve: (workId: string, sourceId: string) => BookFile | null;
  pdf: (filename: string, pages: number[]) => Promise<{ totalPages: number; pageTexts?: Record<string, string> }>;
  epub: (filename: string, cfi: string) => Promise<string>;
}

/** Read the adapter's section-wide CFI offsets from the local EPUB, with no network or document execution. */
export async function readAssistantEpub(filename: string, cfi: string): Promise<string> {
  const match = /^epubcfi\(\/6\/(\d+)(?:\[[^\]]*\])?!\/4\/2(?:\/1:(\d+)|,\/1:(\d+),\/1:(\d+))\)$/u.exec(cfi);
  if (!match) throw new Error('missing-page');
  // Only decompress text/package entries; never unpack the book's images to disk.
  const entries = unzipSync(await readFile(filename), { filter: file => /\.(?:xml|opf|xhtml|html|htm)$/iu.test(file.name) && file.originalSize <= 8_000_000 });
  const xml = (name: string) => {
    if (!entries[name]) throw new Error('missing-page');
    return new DOMParser().parseFromString(strFromU8(entries[name]), 'text/xml');
  };
  const opf = xml('META-INF/container.xml').querySelector('rootfile')?.getAttribute('full-path');
  if (!opf) throw new Error('missing-page');
  const packageDoc = xml(opf);
  const id = packageDoc.querySelectorAll('spine > itemref')[Number(match[1]) / 2 - 1]?.getAttribute('idref');
  const item = [...packageDoc.querySelectorAll('manifest > item')].find(entry => entry.getAttribute('id') === id);
  const href = item?.getAttribute('href');
  if (!href) throw new Error('missing-page');
  const section = xml(path.posix.normalize(path.posix.join(path.posix.dirname(opf), decodeURIComponent(href.split('#')[0]))));
  for (const node of section.querySelectorAll('script, style')) node.remove();
  const text = section.querySelector('body')?.textContent ?? '';
  const start = Number(match[2] ?? match[3]);
  const end = match[4] === undefined ? text.replace(/\s/gu, '').length : Number(match[4]);
  let offset = 0, begin = -1, finish = -1;
  for (let i = 0; i < text.length; i++) {
    if (/\s/u.test(text[i])) continue;
    if (offset === start) begin = i;
    offset++;
    if (offset === end) finish = i + 1;
  }
  if (begin < 0 || finish < begin || end <= start) throw new Error('missing-page');
  return text.slice(begin, finish);
}

const defaults: BookSourceDependencies = {
  resolve: (workId, sourceId) => {
    const row = getDatabase().prepare(`SELECT w.title, s.id AS sourceId, f.file_path AS path FROM work w
      JOIN edition e ON e.work_id=w.id JOIN source s ON s.edition_id=e.id
      JOIN file_source_detail f ON f.source_id=s.id WHERE w.id=? AND s.id=?`).get(workId, sourceId) as BookFile | undefined;
    return row && existsSync(row.path) ? row : null;
  },
  pdf: async (filename, pages) => {
    // Retain PDF.js bounds/password/copy-permission checks. Text itself comes from KEY-272's mapping-aware reader.
    try { await inspectPdfFile(filename, undefined, () => {}, pages); }
    catch (error) { if ((error as Error).message === 'invalid-request') throw new Error('missing-page'); throw error; }
    return extractPdfPageTexts(pdfEngineTools(), filename, pages);
  },
  epub: readAssistantEpub,
};

/** Resolves Work → Edition → Source on main, before extraction. Never accepts renderer source text. */
export async function readAssistantBookSources(target: string, to?: number, dependencies = defaults): Promise<AssistantSource[]> {
  const location = parseBookTarget(target);
  if (!location?.sourceId || (!location.page && !location.cfi)) throw new Error('invalid-request');
  const file = dependencies.resolve(location.id, location.sourceId);
  if (!file) throw new Error('missing-source');
  if (location.cfi) {
    if (!/\.epub$/iu.test(file.path) || to !== undefined) throw new Error('invalid-request');
    const text = await dependencies.epub(file.path, location.cfi);
    if (!text.trim()) throw new Error('no-text-layer');
    return [{ id: 'S1', label: file.title, target, text }];
  }
  if (!/\.pdf$/iu.test(file.path)) throw new Error('invalid-request');
  const from = location.page!;
  const end = to ?? from;
  if (!Number.isInteger(end) || end < from || end - from >= 50) throw new Error('invalid-request');
  const pages = Array.from({ length: end - from + 1 }, (_, i) => from + i);
  const report = await dependencies.pdf(file.path, pages);
  if (end > report.totalPages || pages.some(page => typeof report.pageTexts?.[String(page)] !== 'string')) throw new Error('missing-page');
  return pages.map((page, i) => {
    const text = report.pageTexts![String(page)];
    if (!text.trim()) throw new AssistantBookError('no-text-layer', bookStudyTarget(location, page));
    return { id: `S${i + 1}`, label: `${file.title} (${page})`, target: bookStudyTarget(location, page), text };
  });
}
