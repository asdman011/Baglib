import { extractPassages } from '../../shared/passage-extract';
import { bookCfiTarget, bookStudyTarget, studyLinkText } from '../../shared/study-notes';
import { lectureTarget } from './lecture-navigation';
import type { SubtitleCue } from '../../shared/subtitles';
import type { IndexedBookPage, LibraryFtsResult } from '../../shared/types/full-text-search';
import type { SlashResult } from './slash-search';
export interface SlashMaterial { result: SlashResult; indexed: boolean; pages: IndexedBookPage[]; cues: SubtitleCue[]; available: boolean }
export async function prepareSlashMaterial(result: SlashResult): Promise<SlashMaterial> {
  const book = result.material!;
  const material: SlashMaterial = { result, indexed: false, pages: [], cues: [], available: false };
  if (result.scope === 'lectures') {
    const loaded = await window.electronAPI.lectures.subtitles(book.id);
    material.cues = loaded?.cues ?? []; material.available = material.cues.some(cue => cue.text.trim());
  } else {
    material.indexed = await window.electronAPI.isBookIndexed(book.id);
    if (!material.indexed && book.filePath && /\.pdf$/iu.test(book.filePath)) {
      const extracted = await window.electronAPI.extractPdfText(book.filePath);
      if (extracted?.text && !extracted.isScannedImagePdf) {
        const parts = extracted.text.split(/\r?\n---PAGE_SPLIT_MARKER---\r?\n|\f/u);
        if (!parts[0].trim()) parts.shift(); // Remove only the preamble, never empty physical pages.
        material.pages = parts.map((content: string, index: number) => ({ pageNumber: index + 1, content }));
      }
    }
    material.available = material.indexed || material.pages.some(page => page.content.trim());
  }
  return material;
}
const quote = (text: string, target: string, label: string) => text.split(/\r?\n/u).map(line => `> ${line}`).join('\n') + '\n> ' + studyLinkText(target, label);
/** Search only the explicitly selected material. Exact source text is fetched separately from FTS snippets. */
export async function searchSlashMaterial(material: SlashMaterial, query: string, limit: number, offset: number, stale: () => boolean): Promise<SlashResult[]> {
  if (!material.available || query.trim().length < 3 || stale()) return [];
  const book = material.result.material!;
  const found: SlashResult[] = [];
  const append = (text: string, target: string, suffix: string) => {
    const label = book.title + ' · ' + suffix;
    found.push({ scope: material.result.scope, target, label, snippet: text.slice(0, 160), score: 0, quote: quote(text, target, label) });
  };
  if (material.indexed) {
    const hits = await window.electronAPI.searchLibraryFullText(query, { bookId: book.id, limit, offset }) as LibraryFtsResult[];
    for (const hit of hits) {
      if (stale()) return [];
      const page = await window.electronAPI.getPageContent(book.id, hit.pageNumber) as IndexedBookPage | null;
      if (!page || stale()) continue;
      const passage = extractPassages(page.content, query, { limit: 1 })[0];
      if (passage) append(passage.text, hit.locationCfiOrPage.startsWith('epubcfi(') ? bookCfiTarget(book, hit.locationCfiOrPage) : bookStudyTarget(book, hit.pageNumber), String(hit.pageNumber));
    }
    return found;
  }
  // Text-layer fallback/transcripts are loaded once on selection, then searched in yielding bounded batches.
  const cues = material.cues;
  const transcript = cues.map(cue => cue.text).join(' ');
  const pages = cues.length ? [{ pageNumber: 0, content: transcript }] : material.pages;
  let skipped = 0;
  for (const page of pages) {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    if (stale()) return [];
    const passages = extractPassages(page.content, query, { limit: offset + limit, maxLength: cues.length ? 1 : 1200 });
    for (const passage of passages) {
      if (skipped++ < offset) continue;
      if (cues.length) {
        let index = 0, position = 0;
        while (index < cues.length - 1 && position + cues[index].text.length < passage.start) { position += cues[index].text.length + 1; index++; }
        const seconds = cues[index].start;
        append(passage.text, lectureTarget(book.id, seconds), `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`);
      } else append(passage.text, bookStudyTarget(book, page.pageNumber), String(page.pageNumber));
      if (found.length >= limit) return found;
    }
  }
  return found;
}
