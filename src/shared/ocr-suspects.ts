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
