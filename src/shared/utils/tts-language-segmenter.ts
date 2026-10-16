/**
 * Baglib — Multilingual TTS Language Auto-Switching Segmenter (KEY-145)
 *
 * Detects mixed-script text within a single paragraph or sentence (e.g. an English
 * academic essay quoting an Arabic Quranic/Hadith passage, or Arabic literature quoting Latin terms)
 * and segments the text so the audio player can transition between specialized voices seamlessly.
 */

import type { TTSUtteranceSegment } from '../types/audio';

const ARABIC_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_SCRIPT_REGEX = /[a-zA-Z]/;

export type DetectedScript = 'ar' | 'en' | 'neutral';

/**
 * Detects script category for an individual character.
 */
export function detectCharScript(char: string): DetectedScript {
  if (ARABIC_SCRIPT_REGEX.test(char)) return 'ar';
  if (LATIN_SCRIPT_REGEX.test(char)) return 'en';
  return 'neutral';
}

/**
 * Detects the dominant language of a block of text.
 */
export function detectDominantLanguage(text: string, defaultLang: string = 'ar'): string {
  if (!text) return defaultLang;

  let arabicCount = 0;
  let latinCount = 0;

  for (const char of text) {
    if (ARABIC_SCRIPT_REGEX.test(char)) arabicCount++;
    else if (LATIN_SCRIPT_REGEX.test(char)) latinCount++;
  }

  if (arabicCount === 0 && latinCount === 0) return defaultLang;
  return arabicCount >= latinCount ? 'ar' : 'en';
}

/**
 * Segments a mixed paragraph into contiguous language utterances.
 * Neutral symbols and punctuation are grouped with the active script run.
 */
export function segmentMixedTextForTTS(
  text: string,
  baseLang: string = 'ar'
): TTSUtteranceSegment[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  interface RawRun {
    script: DetectedScript;
    text: string;
    start: number;
    end: number;
  }

  const rawRuns: RawRun[] = [];
  let currentScript: DetectedScript = 'neutral';
  let buffer = '';
  let runStart = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const script = detectCharScript(char);

    if (script === 'neutral') {
      buffer += char;
    } else {
      if (currentScript === 'neutral') {
        currentScript = script;
        buffer += char;
      } else if (script === currentScript) {
        buffer += char;
      } else {
        // Script switched: flush existing buffer
        if (buffer.length > 0) {
          rawRuns.push({
            script: currentScript,
            text: buffer,
            start: runStart,
            end: i,
          });
        }
        currentScript = script;
        runStart = i;
        buffer = char;
      }
    }
  }

  if (buffer.length > 0) {
    rawRuns.push({
      script: currentScript,
      text: buffer,
      start: runStart,
      end: text.length,
    });
  }

  if (rawRuns.length === 0) {
    return [
      {
        text,
        lang: baseLang,
        startIndex: 0,
        endIndex: text.length,
      },
    ];
  }

  // Merge neutral runs into adjacent runs
  const mergedSegments: TTSUtteranceSegment[] = [];

  for (let i = 0; i < rawRuns.length; i++) {
    const run = rawRuns[i];
    const resolvedLang = run.script === 'neutral' ? baseLang : run.script;

    // Check if can merge with preceding segment of same language
    const prev = mergedSegments[mergedSegments.length - 1];
    if (prev && prev.lang === resolvedLang) {
      prev.text += run.text;
      prev.endIndex = run.end;
    } else {
      mergedSegments.push({
        text: run.text,
        lang: resolvedLang,
        startIndex: run.start,
        endIndex: run.end,
      });
    }
  }

  // Filter out any empty segments
  return mergedSegments.filter((s) => s.text.trim().length > 0);
}
