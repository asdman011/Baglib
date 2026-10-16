/**
 * Baglib — EPUB 3 Media Overlays SMIL Parser (KEY-145)
 *
 * Reverse-engineered from Readest's SMIL overlay architecture.
 * Parses `.smil` media overlay documents to extract precise sync points
 * pairing text fragment IDs (`chapter1.xhtml#id`) with narration audio clips.
 */

import type { SmilPar } from '../types/audio';

const NUMBER_RE = /^\d*\.?\d+$/;
const TIMECOUNT_RE = /^(\d*\.?\d+)(h|min|ms|s)?$/;
const UNIT_SECONDS: Record<string, number> = { h: 3600, min: 60, s: 1, ms: 0.001 };

/**
 * Parses a SMIL 3.0 clock value into seconds.
 * Supports `hh:mm:ss.mmm`, `mm:ss.mmm`, or timecount with units (h, min, s, ms).
 */
export function parseSmilClock(value: string | null | undefined): number {
  if (!value) return 0;
  const str = value.trim();
  if (!str) return 0;

  if (str.includes(':')) {
    const parts = str.split(':');
    if (parts.length === 2 && parts.every((p) => NUMBER_RE.test(p))) {
      const [m, s] = parts.map(Number);
      return m * 60 + s;
    }
    if (parts.length === 3 && parts.every((p) => NUMBER_RE.test(p))) {
      const [h, m, s] = parts.map(Number);
      return h * 3600 + m * 60 + s;
    }
    return 0;
  }

  const match = TIMECOUNT_RE.exec(str);
  if (!match) return 0;
  const num = Number(match[1]);
  const unit = match[2] || 's';
  return num * (UNIT_SECONDS[unit] ?? 1);
}

/**
 * Regex-based XML SMIL parser that operates identically in Node.js (main/test process)
 * and browser (renderer process) without requiring DOMParser or browser window.
 */
export function parseSmilXml(xmlString: string, basePath: string = ''): SmilPar[] {
  if (!xmlString || !xmlString.trim()) return [];

  const pars: SmilPar[] = [];

  // Match each <par>...</par> block (case-insensitive, handling attributes)
  const parRegex = /<par\b[^>]*>([\s\S]*?)<\/par>/gi;
  let parMatch: RegExpExecArray | null;

  while ((parMatch = parRegex.exec(xmlString)) !== null) {
    const parContent = parMatch[1];

    // Extract <text src="..." />
    const textMatch = /<text\b[^>]*\bsrc=["']([^"']+)["'][^>]*\/?>/i.exec(parContent);
    // Extract <audio src="..." clipBegin="..." clipEnd="..." />
    const audioMatch = /<audio\b[^>]*\bsrc=["']([^"']+)["'][^>]*\/?>/i.exec(parContent);

    if (textMatch && audioMatch) {
      const rawTextSrc = textMatch[1];
      const audioTag = audioMatch[0];
      const audioSrc = audioMatch[1];

      // Extract clipBegin & clipEnd
      const beginMatch = /\bclipBegin=["']([^"']+)["']/i.exec(audioTag);
      const endMatch = /\bclipEnd=["']([^"']+)["']/i.exec(audioTag);

      const clipBegin = parseSmilClock(beginMatch ? beginMatch[1] : '0');
      const clipEnd = parseSmilClock(endMatch ? endMatch[1] : '0');

      // Split textHref and textId fragment
      const hashIndex = rawTextSrc.indexOf('#');
      const textHref = hashIndex !== -1 ? rawTextSrc.slice(0, hashIndex) : rawTextSrc;
      const textId = hashIndex !== -1 ? rawTextSrc.slice(hashIndex + 1) : '';

      pars.push({
        textHref,
        textId,
        audioHref: audioSrc,
        clipBegin,
        clipEnd,
      });
    }
  }

  return pars;
}
