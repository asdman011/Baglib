/**
 * Baglib — In-Book Morphology-Aware Full-Text Search Engine (KEY-140)
 *
 * Implements progressive, non-blocking document search across reflowable EPUB chapters,
 * paginated blocks, and PDF extracted text. Streams matching results back to the UI thread
 * without frame drops, returning exact page numbers, CFI locations, and context snippets
 * with authentic Arabic diacritics and ligatures preserved.
 */

import type {
  InBookSearchMatch,
  InBookSearchOptions,
  InBookSearchProgress,
} from '../../../shared/types/full-text-search';
import { findMatchesInText } from '../../../shared/utils/text-normalizer';

export interface SearchableSection {
  pageNumber: number;
  locationCfiOrPage?: string;
  chapterTitle?: string;
  text: string;
}

/**
 * Executes a morphology-aware full-text search across book sections/pages.
 * Progressively yields execution to prevent main thread stutters.
 */
export async function searchBookProgressive(
  sections: SearchableSection[],
  query: string,
  options: InBookSearchOptions = {}
): Promise<InBookSearchMatch[]> {
  const cleanQuery = query?.trim();
  if (!cleanQuery || !sections || sections.length === 0) {
    if (options.onProgress) {
      options.onProgress({
        currentSection: 0,
        totalSections: sections?.length || 0,
        matchesCount: 0,
        matches: [],
        isComplete: true,
      });
    }
    return [];
  }

  const {
    caseSensitive = false,
    matchWholeWord = false,
    normalizeArabic = true,
    contextRadius = 45,
    signal,
    onProgress,
  } = options;

  const matches: InBookSearchMatch[] = [];
  const totalSections = sections.length;
  let lastYieldTime = performance.now();

  for (let idx = 0; idx < totalSections; idx++) {
    // Check abort signal
    if (signal?.aborted) {
      break;
    }

    const sec = sections[idx];
    if (sec.text && sec.text.trim()) {
      const pageMatches = findMatchesInText(sec.text, cleanQuery, {
        caseSensitive,
        matchWholeWord,
        normalizeArabic,
        contextRadius,
      });

      for (let mIdx = 0; mIdx < pageMatches.length; mIdx++) {
        const pm = pageMatches[mIdx];
        matches.push({
          id: `match-p${sec.pageNumber}-${idx}-${mIdx}`,
          pageNumber: sec.pageNumber,
          locationCfiOrPage: sec.locationCfiOrPage || String(sec.pageNumber),
          chapterTitle: sec.chapterTitle,
          preContext: pm.preContext,
          matchText: pm.matchText,
          postContext: pm.postContext,
          fullSnippet: pm.fullSnippet,
          characterIndex: pm.start,
        });
      }
    }

    // Yield control to event loop every ~12ms or every 25 pages to guarantee 60fps responsiveness
    const now = performance.now();
    if (now - lastYieldTime > 12 || idx % 25 === 0 || idx === totalSections - 1) {
      lastYieldTime = now;

      if (onProgress) {
        onProgress({
          currentSection: idx + 1,
          totalSections,
          matchesCount: matches.length,
          matches: [...matches],
          isComplete: idx === totalSections - 1,
        });
      }

      // Non-blocking sleep
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  if (onProgress && !signal?.aborted) {
    onProgress({
      currentSection: totalSections,
      totalSections,
      matchesCount: matches.length,
      matches: [...matches],
      isComplete: true,
    });
  }

  return matches;
}

/**
 * Worker message payload definitions for dedicated Web Worker execution
 */
export interface SearchWorkerRequest {
  type: 'START_SEARCH';
  query: string;
  sections: SearchableSection[];
  options?: InBookSearchOptions;
}

export interface SearchWorkerCancelRequest {
  type: 'CANCEL_SEARCH';
}

export type SearchWorkerIncomingMessage = SearchWorkerRequest | SearchWorkerCancelRequest;

export interface SearchWorkerProgressResponse {
  type: 'SEARCH_PROGRESS';
  progress: InBookSearchProgress;
}

export interface SearchWorkerCompleteResponse {
  type: 'SEARCH_COMPLETE';
  matches: InBookSearchMatch[];
}

export type SearchWorkerOutgoingMessage = SearchWorkerProgressResponse | SearchWorkerCompleteResponse;
