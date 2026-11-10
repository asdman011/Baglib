/**
 * OCR Suspect Word Detection & Review Logic (KEY-275 / Wave 13.3)
 */

import type { OcrPageResult, OcrWord } from './types/ocr';

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.6;

export type SuspectKind = 'confidence' | 'heuristic';
export type HeuristicReason = 'mixed-scripts' | 'invalid-chars' | 'isolated-arabic' | 'dictionary-miss';

export interface OcrSuspectWord {
  word: OcrWord;
  originalIndex: number;
  kind: SuspectKind;
  confidence?: number;
  heuristicReason?: HeuristicReason;
}

export type OcrSuspect = OcrSuspectWord;

export interface FindSuspectsOptions {
  threshold?: number;
  confidenceThreshold?: number;
  isRtl?: boolean;
  dictionarySet?: Set<string>;
}

// Standalone single Arabic letters that are valid prepositions or conjunctions
const VALID_STANDALONE_ARABIC = new Set(['و', 'ف', 'ب', 'ل', 'ك']);

/**
 * Checks if a word is an unconfident/suspect candidate based on heuristic rules.
 * Clearly separated from confidence scores.
 */
export function detectHeuristicSuspectReason(text: string, dictionarySet?: Set<string>): HeuristicReason | null {
  const clean = text.trim();
  if (!clean) return null;

  // 1. Invalid or replacement characters
  if (/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(clean)) {
    return 'invalid-chars';
  }

  // 2. Mixed scripts inside a single token (e.g. Arabic mixed with Latin or Cyrillic)
  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(clean);
  const hasLatin = /[A-Za-z]/.test(clean);
  if (hasArabic && hasLatin) {
    return 'mixed-scripts';
  }

  // 3. Isolated Arabic letters that are not valid standalone conjunctions/prepositions
  // Strip any attached punctuation
  const lettersOnly = clean.replace(/[^\p{L}\p{N}]/gu, '');
  if (lettersOnly.length === 1 && hasArabic && !VALID_STANDALONE_ARABIC.has(lettersOnly)) {
    return 'isolated-arabic';
  }

  // 4. Missing from dictionary if provided
  if (dictionarySet && dictionarySet.size > 0 && lettersOnly.length > 1) {
    const norm = lettersOnly
      .replace(/[\u064b-\u065f\u0670\u0640]/gu, '')
      .replace(/[أإآٱ]/gu, 'ا')
      .toLowerCase();
    if (!dictionarySet.has(norm)) {
      return 'dictionary-miss';
    }
  }

  return null;
}

/**
 * Sorts OCR words by natural page reading order:
 * - Line-by-line (top to bottom by y coordinate, grouping within line height tolerance)
 * - Within a line:
 *   - RTL (Arabic): right to left (descending x coordinate)
 *   - LTR (English/Latin): left to right (ascending x coordinate)
 */
export function sortWordsByReadingOrder<T extends { word: OcrWord }>(
  items: T[],
  isRtl: boolean = true
): T[] {
  if (items.length <= 1) return items.slice();

  // Sort by Y coordinate first to establish vertical order
  const sortedByY = items.slice().sort((a, b) => a.word.bbox.y - b.word.bbox.y);

  // Group into horizontal lines using height tolerance
  const lines: T[][] = [];
  let currentLine: T[] = [];
  let currentY = sortedByY[0].word.bbox.y;
  let currentH = sortedByY[0].word.bbox.height;

  for (const item of sortedByY) {
    const { y, height } = item.word.bbox;
    const tolerance = Math.max(10, (currentH || height || 20) * 0.5);

    if (Math.abs(y - currentY) <= tolerance) {
      currentLine.push(item);
    } else {
      if (currentLine.length > 0) lines.push(currentLine);
      currentLine = [item];
      currentY = y;
      currentH = height;
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);

  // Sort each line horizontally
  const result: T[] = [];
  for (const line of lines) {
    line.sort((a, b) => {
      return isRtl
        ? b.word.bbox.x - a.word.bbox.x // Right to Left
        : a.word.bbox.x - b.word.bbox.x; // Left to Right
    });
    result.push(...line);
  }

  return result;
}

/**
 * Finds all suspect words on a page:
 * - If words have `confidence`, flags those below `threshold` (default 0.6).
 * - Flags heuristic anomalies where confidence is missing or zero.
 * - Returns suspects sorted in page reading order.
 */
export function findOcrSuspects(
  words: OcrWord[],
  options: FindSuspectsOptions = {}
): OcrSuspectWord[] {
  const threshold = options.threshold ?? options.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const isRtl = options.isRtl ?? true;
  const list: OcrSuspectWord[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word || !word.text?.trim()) continue;

    if (word.confidence !== undefined) {
      if (word.confidence < threshold) {
        list.push({
          word,
          originalIndex: i,
          kind: 'confidence',
          confidence: word.confidence,
        });
        continue;
      }
    }

    // Heuristic check
    const heuristicReason = detectHeuristicSuspectReason(word.text, options.dictionarySet);
    if (heuristicReason) {
      list.push({
        word,
        originalIndex: i,
        kind: 'heuristic',
        heuristicReason,
      });
    }
  }

  return sortWordsByReadingOrder(list, isRtl);
}

/**
 * Updates a word in an OcrPageResult, re-deriving the line and page text.
 */
export function applyWordCorrection(
  page: OcrPageResult,
  wordIndex: number,
  newText: string
): OcrPageResult {
  const words = page.words.map((w, idx) => (idx === wordIndex ? { ...w, text: newText } : w));

  // Find target line and update word within it
  const lines = page.lines.map(line => {
    let lineModified = false;
    const lineWords = line.words.map(w => {
      if (w === page.words[wordIndex] || (w.bbox.x === page.words[wordIndex].bbox.x && w.bbox.y === page.words[wordIndex].bbox.y && w.text === page.words[wordIndex].text)) {
        lineModified = true;
        return { ...w, text: newText };
      }
      return w;
    });

    if (lineModified) {
      return {
        ...line,
        words: lineWords,
        text: lineWords.map(w => w.text).join(' '),
      };
    }
    return line;
  });

  const text = lines.length > 0 ? lines.map(l => l.text).join('\n') : words.map(w => w.text).join(' ');

  return {
    ...page,
    words,
    lines,
    text,
    markdown: text,
  };
}

// ---------------------------------------------------------------------------
// Storage Keys & Persistent Correction Data Types (Source-keyed & Validated)
// ---------------------------------------------------------------------------

export function ocrCorrectionsKey(sourceId: string | null | undefined, page: number): string | null {
  if (!sourceId) return null;
  return `ocr.corrections.v1:${sourceId}:${page}`;
}

export function ocrAcceptedKey(sourceId: string | null | undefined, page: number): string | null {
  if (!sourceId) return null;
  return `ocr.accepted.v1:${sourceId}:${page}`;
}

export function legacyOcrCorrectionsKey(bookId: string | null | undefined, page: number): string | null {
  if (!bookId) return null;
  return `ocr.corrections.v1:${bookId}:${page}`;
}

export function legacyOcrAcceptedKey(bookId: string | null | undefined, page: number): string | null {
  if (!bookId) return null;
  return `ocr.accepted.v1:${bookId}:${page}`;
}

export interface OcrWordCorrectionEntry {
  original: string;
  corrected: string;
  engine?: string;
  timestamp?: number;
}

export type OcrWordCorrectionsMap = Record<string, OcrWordCorrectionEntry | string>;

export interface StaleCorrectionInfo {
  index: number;
  original: string;
  corrected: string;
  engine?: string;
  reason: 'index-out-of-bounds' | 'text-mismatch' | 'engine-mismatch' | 'legacy-shape';
}

export interface AppliedCorrectionsResult {
  patchedResult: OcrPageResult;
  appliedCount: number;
  staleCorrections: StaleCorrectionInfo[];
}

/**
 * Applies saved corrections to an OcrPageResult safely:
 * - Checks that the target index exists and that its current text matches `original`.
 * - Checks that the engine matches if specified.
 * - Rejects legacy shape `Record<number, string>` (never applies blindly, marks stale).
 * - Returns the patched result along with any stale corrections that no longer match.
 */
export function applyStoredCorrections(
  pageResult: OcrPageResult,
  corrections: OcrWordCorrectionsMap | null | undefined,
  currentEngine?: string
): AppliedCorrectionsResult {
  if (!corrections || typeof corrections !== 'object' || !pageResult.words || pageResult.words.length === 0) {
    return { patchedResult: pageResult, appliedCount: 0, staleCorrections: [] };
  }

  const effectiveEngine = currentEngine || pageResult.engine;
  const staleCorrections: StaleCorrectionInfo[] = [];
  let patched = pageResult;
  let appliedCount = 0;

  for (const [key, value] of Object.entries(corrections)) {
    const idx = Number(key);
    if (!Number.isFinite(idx) || idx < 0) continue;

    // Check legacy shape or invalid entry
    if (typeof value === 'string' || !value || typeof value !== 'object' || typeof (value as { original?: unknown }).original !== 'string') {
      const correctedText = typeof value === 'string' ? value : String((value as { corrected?: unknown })?.corrected || '');
      staleCorrections.push({
        index: idx,
        original: '',
        corrected: correctedText,
        reason: 'legacy-shape',
      });
      continue;
    }

    const entry = value as OcrWordCorrectionEntry;

    // Check bounds
    if (idx >= patched.words.length) {
      staleCorrections.push({
        index: idx,
        original: entry.original,
        corrected: entry.corrected,
        engine: entry.engine,
        reason: 'index-out-of-bounds',
      });
      continue;
    }

    const targetWord = patched.words[idx];

    // Check engine match if specified
    if (entry.engine && effectiveEngine && entry.engine !== effectiveEngine) {
      staleCorrections.push({
        index: idx,
        original: entry.original,
        corrected: entry.corrected,
        engine: entry.engine,
        reason: 'engine-mismatch',
      });
      continue;
    }

    // Check original text match
    if (targetWord.text !== entry.original) {
      staleCorrections.push({
        index: idx,
        original: entry.original,
        corrected: entry.corrected,
        engine: entry.engine,
        reason: 'text-mismatch',
      });
      continue;
    }

    // Valid: apply correction
    patched = applyWordCorrection(patched, idx, entry.corrected);
    appliedCount++;
  }

  return { patchedResult: patched, appliedCount, staleCorrections };
}

export interface MigrateSourceCorrectionsInput {
  sourceId: string;
  bookId?: string | null;
  sourcesCount: number;
  page: number;
  getSetting: (key: string, defaultVal: unknown) => Promise<unknown>;
  setSetting: (key: string, val: unknown) => Promise<void>;
}

/**
 * Resolves source-keyed corrections and accepted indices, migrating from legacy
 * book-keyed settings only when the work has exactly one source.
 */
export async function resolveAndMigratePageCorrections(input: MigrateSourceCorrectionsInput): Promise<{
  corrections: OcrWordCorrectionsMap;
  acceptedIndices: number[];
}> {
  const sourceCorrKey = ocrCorrectionsKey(input.sourceId, input.page);
  const sourceAcceptedKey = ocrAcceptedKey(input.sourceId, input.page);

  let corrections: OcrWordCorrectionsMap = {};
  let acceptedIndices: number[] = [];

  if (sourceCorrKey) {
    const saved = await input.getSetting(sourceCorrKey, null) as OcrWordCorrectionsMap | null;
    if (saved && typeof saved === 'object' && Object.keys(saved).length > 0) {
      corrections = saved;
    }
  }

  if (sourceAcceptedKey) {
    const savedAcc = await input.getSetting(sourceAcceptedKey, null) as number[] | null;
    if (Array.isArray(savedAcc) && savedAcc.length > 0) {
      acceptedIndices = savedAcc;
    }
  }

  // Migrate legacy book-keyed data ONLY if work has exactly one source
  if (input.bookId && input.sourcesCount === 1) {
    if (Object.keys(corrections).length === 0 && sourceCorrKey) {
      const legCorrKey = legacyOcrCorrectionsKey(input.bookId, input.page);
      if (legCorrKey) {
        const legSaved = await input.getSetting(legCorrKey, null) as OcrWordCorrectionsMap | null;
        if (legSaved && typeof legSaved === 'object' && Object.keys(legSaved).length > 0) {
          corrections = legSaved;
          await input.setSetting(sourceCorrKey, legSaved);
        }
      }
    }

    if (acceptedIndices.length === 0 && sourceAcceptedKey) {
      const legAccKey = legacyOcrAcceptedKey(input.bookId, input.page);
      if (legAccKey) {
        const legAccSaved = await input.getSetting(legAccKey, null) as number[] | null;
        if (Array.isArray(legAccSaved) && legAccSaved.length > 0) {
          acceptedIndices = legAccSaved;
          await input.setSetting(sourceAcceptedKey, legAccSaved);
        }
      }
    }
  }

  return { corrections, acceptedIndices };
}
