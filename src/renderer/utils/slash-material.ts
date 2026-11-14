import { extractPassages } from '../../shared/passage-extract';
import { bookCfiTarget, bookStudyTarget, studyLinkText } from '../../shared/study-notes';
import { lectureTarget } from './lecture-navigation';
import type { SubtitleCue } from '../../shared/subtitles';
import type { IndexedBookPage, LibraryFtsResult } from '../../shared/types/full-text-search';
import type { SlashResult } from './slash-search';

export interface SlashMaterial { result: SlashResult; indexed: boolean; pages: IndexedBookPage[]; cues: SubtitleCue[]; available: boolean }

export interface MaterialOcrState {
  bookId: string;
  status: 'idle' | 'running' | 'completed' | 'cancelled' | 'failed';
  percentage: number;
  recognizedWords: number;
  error?: string;
}

const activeOcrJobs = new Map<string, MaterialOcrState>();
const ocrListeners = new Map<string, Set<(state: MaterialOcrState) => void>>();

export function getMaterialOcrState(bookId: string): MaterialOcrState | undefined {
  return activeOcrJobs.get(bookId);
}

export function resetMaterialOcrState(bookId?: string): void {
  if (bookId) {
    activeOcrJobs.delete(bookId);
    ocrListeners.delete(bookId);
  } else {
    activeOcrJobs.clear();
    ocrListeners.clear();
  }
}

export async function runMaterialOcr(
  book: { id: string; filePath?: string; title?: string },
  onProgress?: (state: MaterialOcrState) => void
): Promise<MaterialOcrState> {
  const current = activeOcrJobs.get(book.id);
  if (current?.status === 'running') {
    if (onProgress) {
      let listeners = ocrListeners.get(book.id);
      if (!listeners) {
        listeners = new Set();
        ocrListeners.set(book.id, listeners);
      }
      listeners.add(onProgress);
    }
    return current;
  }

  const state: MaterialOcrState = {
    bookId: book.id,
    status: 'running',
    percentage: 0,
    recognizedWords: 0,
  };
  activeOcrJobs.set(book.id, state);

  let listeners = ocrListeners.get(book.id);
  if (!listeners) {
    listeners = new Set();
    ocrListeners.set(book.id, listeners);
  }
  if (onProgress) listeners.add(onProgress);

  const notify = (updated: MaterialOcrState) => {
    listeners?.forEach(cb => {
      try { cb(updated); } catch { /* ignore */ }
    });
  };

  notify({ ...state });

  if (!book.filePath || !window.electronAPI?.ocrRecognizeDocument) {
    state.status = 'failed';
    notify({ ...state });
    return state;
  }

  const unsub = window.electronAPI.onOcrProgress?.(payload => {
    if (payload.bookId === book.id) {
      const job = activeOcrJobs.get(book.id);
      if (job && job.status === 'running') {
        job.percentage = payload.percentage;
        job.recognizedWords = payload.recognizedWords;
        if (payload.status === 'cancelled') {
          job.status = 'cancelled';
        } else if (payload.status === 'completed') {
          job.status = 'completed';
        } else if (payload.status === 'failed') {
          job.status = 'failed';
          job.error = payload.error;
        }
        notify({ ...job });
      }
    }
  });

  try {
    const res = await window.electronAPI.ocrRecognizeDocument({
      filePath: book.filePath,
      bookId: book.id,
      startPage: 1,
      endPage: 20,
      autoIndexFts: true,
    });

    const job = activeOcrJobs.get(book.id);
    if (job && job.status === 'running') {
      const hasPages = res && res.pages && res.pages.length > 0 && res.pages.some((p: { text?: string }) => Boolean(p.text?.trim()));
      job.status = hasPages ? 'completed' : 'failed';
      job.percentage = 100;
      notify({ ...job });
    }
    return activeOcrJobs.get(book.id) || state;
  } catch (err: unknown) {
    const job = activeOcrJobs.get(book.id);
    if (job && job.status === 'running') {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : String(err);
      notify({ ...job });
    }
    return activeOcrJobs.get(book.id) || state;
  } finally {
    unsub?.();
  }
}

export async function cancelMaterialOcr(bookId: string): Promise<void> {
  const job = activeOcrJobs.get(bookId);
  if (job && job.status === 'running') {
    job.status = 'cancelled';
    const listeners = ocrListeners.get(bookId);
    listeners?.forEach(cb => {
      try { cb({ ...job }); } catch { /* ignore */ }
    });
  }
  await window.electronAPI?.ocrCancel?.(bookId);
}

export async function prepareSlashMaterial(result: SlashResult): Promise<SlashMaterial> {
  const book = result.material!;
  const material: SlashMaterial = { result, indexed: false, pages: [], cues: [], available: false };
  if (result.scope === 'lectures') {
    const loaded = await window.electronAPI.lectures.subtitles(book.id);
    material.cues = loaded?.cues ?? [];
    material.available = material.cues.some(cue => cue.text.trim());
    if (material.available && typeof window.electronAPI?.indexLectureTranscript === 'function') {
      void window.electronAPI.indexLectureTranscript(book.id, material.cues).catch(() => {});
      if (typeof window.electronAPI?.isBookIndexed === 'function') {
        material.indexed = await window.electronAPI.isBookIndexed(book.id).catch(() => false);
      }
    }
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
export const quotePassage = (text: string, target: string, label: string) => text.split(/\r?\n/u).map(line => `> ${line}`).join('\n') + '\n> ' + studyLinkText(target, label);
const quote = quotePassage;
/** Search only the explicitly selected material. Exact source text is fetched separately from FTS snippets. */
export async function searchSlashMaterial(material: SlashMaterial, query: string, limit: number, offset: number, stale: () => boolean): Promise<SlashResult[]> {
  if (!material.available || query.trim().length < 3 || stale()) return [];
  const book = material.result.material!;
  const found: SlashResult[] = [];
  const append = (text: string, target: string, suffix: string) => {
    const label = book.title + ' · ' + suffix;
    found.push({ scope: material.result.scope, target, label, snippet: text.slice(0, 160), score: 0, quote: quote(text, target, label) });
  };
  if (material.indexed && typeof window !== 'undefined' && typeof window.electronAPI?.searchLibraryFullText === 'function') {
    const hits = await window.electronAPI.searchLibraryFullText(query, { bookId: book.id, limit, offset }) as LibraryFtsResult[];
    for (const hit of hits) {
      if (stale()) return [];
      const content = hit.content || (await window.electronAPI.getPageContent(book.id, hit.pageNumber) as IndexedBookPage | null)?.content;
      if (!content || stale()) continue;
      const passage = extractPassages(content, query, { limit: 1 })[0];
      if (passage) {
        const isLecture = material.result.scope === 'lectures';
        const target = isLecture
          ? lectureTarget(book.id, hit.pageNumber)
          : (hit.locationCfiOrPage.startsWith('epubcfi(') ? bookCfiTarget(book, hit.locationCfiOrPage) : bookStudyTarget(book, hit.pageNumber));
        const suffix = isLecture ? hit.locationCfiOrPage : String(hit.pageNumber);
        append(passage.text, target, suffix);
      }
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
