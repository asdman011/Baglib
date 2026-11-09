import { segmentTextIntoSentences } from './utils/tts-text';

export const ARABIC_CHAR_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;

export const KNOWN_PUA_CHAR_MAP: Record<number, string> = {
  0xF22B: '﴿',
  0xF22A: '﴾',
  0xF222: '﴾',
  0xF228: '﴾',
  0xFD3E: '﴾',
  0xFD3F: '﴿',
  0xF220: ' ',
};

export interface SanitizedPdfTextResult {
  cleanText: string;
  hasUnmappedGlyphs: boolean;
  unmappedCount: number;
  totalLength: number;
}

/**
 * Sanitizes extracted PDF text:
 * - Maps known Private Use Area (PUA) characters (e.g. U+F22B/U+F222 for Quranic brackets).
 * - Drops unmapped PUA characters (0xE000-0xF8FF, 0xF0000-0xFFFFD, 0x100000-0x10FFFD) so they
 *   never render as boxes (□) and are never spoken.
 * - Detects whether any unmapped glyphs were encountered so the UI can warn the user.
 */
export function sanitizePdfExtractedText(text: string): SanitizedPdfTextResult {
  if (!text) {
    return { cleanText: '', hasUnmappedGlyphs: false, unmappedCount: 0, totalLength: 0 };
  }

  let unmappedCount = 0;
  const chars: string[] = [];

  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code in KNOWN_PUA_CHAR_MAP) {
      chars.push(KNOWN_PUA_CHAR_MAP[code]);
    } else if (
      (code >= 0xE000 && code <= 0xF8FF) ||
      (code >= 0xF0000 && code <= 0xFFFFD) ||
      (code >= 0x100000 && code <= 0x10FFFD)
    ) {
      unmappedCount++;
    } else {
      chars.push(ch);
    }
  }

  const rawClean = chars.join('');
  const cleanText = rawClean
    .replace(/[ \t]+/gu, ' ')
    .replace(/\r\n/gu, '\n')
    .replace(/\n\s*\n+/gu, '\n\n')
    .trim();

  return {
    cleanText,
    hasUnmappedGlyphs: unmappedCount > 0,
    unmappedCount,
    totalLength: text.length,
  };
}

export function isArabicText(text: string): boolean {
  if (!text) return false;
  const arabicChars = text.match(new RegExp(ARABIC_CHAR_REGEX.source, 'gu')) || [];
  const latinChars = text.match(/[A-Za-z]/gu) || [];
  if (arabicChars.length === 0) return false;
  if (latinChars.length === 0) return true;
  return arabicChars.length >= latinChars.length;
}

export interface TextBlockItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  direction?: 'rtl' | 'ltr';
}

export interface ReflowParagraph {
  id: string;
  order: number;
  text: string;
  direction: 'rtl' | 'ltr';
  sentences: string[];
}

/**
 * Builds reflow paragraphs from raw text blocks or string text.
 * Sorts visually top-to-bottom, respecting column geometry and RTL/LTR direction.
 */
export function buildReflowParagraphs(
  input: string | TextBlockItem[],
  fallbackDirection: 'rtl' | 'ltr' = 'ltr'
): ReflowParagraph[] {
  if (typeof input === 'string') {
    const { cleanText } = sanitizePdfExtractedText(input);
    if (!cleanText) return [];

    const rawParagraphs = cleanText
      .split(/\n\s*\n+/u)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    return rawParagraphs.map((text, idx) => {
      const isAr = isArabicText(text);
      const direction = isAr ? 'rtl' : (fallbackDirection === 'rtl' ? 'rtl' : 'ltr');
      return {
        id: `p-${idx + 1}`,
        order: idx + 1,
        text,
        direction,
        sentences: segmentTextIntoSentences(text).map(s => s.text),
      };
    });
  }

  if (!Array.isArray(input) || input.length === 0) {
    return [];
  }

  // Sanitize blocks and filter empty blocks
  const sanitizedBlocks = input
    .map(block => ({
      ...block,
      text: sanitizePdfExtractedText(block.text).cleanText,
    }))
    .filter(b => b.text.length > 0);

  if (sanitizedBlocks.length === 0) return [];

  // Group text blocks into lines based on Y coordinate proximity
  // Line threshold: 0.6 of average block height
  const sorted = [...sanitizedBlocks].sort((a, b) => {
    // Round Y to nearest 4px bucket for line grouping
    const lineDiff = Math.round(a.y / 6) - Math.round(b.y / 6);
    if (lineDiff !== 0) return lineDiff;
    // Within same line: if RTL, higher X comes first; if LTR, lower X comes first
    const isAr = (a.direction === 'rtl' || b.direction === 'rtl' || isArabicText(a.text) || isArabicText(b.text));
    return isAr ? b.x - a.x : a.x - b.x;
  });

  // Group into paragraphs based on vertical line gaps (> 1.6 * line height)
  const paragraphGroups: TextBlockItem[][] = [];
  let currentGroup: TextBlockItem[] = [];
  let lastY = -1;
  let lastHeight = 12;

  for (const block of sorted) {
    if (!block.text || !block.text.trim()) continue;
    if (currentGroup.length > 0) {
      const yGap = block.y - (lastY + lastHeight);
      if (yGap > lastHeight * 0.9) {
        paragraphGroups.push(currentGroup);
        currentGroup = [];
      }
    }
    currentGroup.push(block);
    lastY = block.y;
    lastHeight = Math.max(10, block.height);
  }
  if (currentGroup.length > 0) {
    paragraphGroups.push(currentGroup);
  }

  return paragraphGroups.map((group, idx) => {
    const text = group.map(b => b.text.trim()).join(' ');
    const isAr = isArabicText(text);
    const direction = isAr ? 'rtl' : fallbackDirection;
    return {
      id: `p-${idx + 1}`,
      order: idx + 1,
      text,
      direction,
      sentences: segmentTextIntoSentences(text).map(s => s.text),
    };
  });
}

export interface VoiceSelectionResult {
  hasVoice: boolean;
  voiceURI?: string;
  lang: string;
  missingArabicNotice?: boolean;
}

/**
 * Selects an appropriate TTS voice for a given paragraph text from available system voices.
 * Adheres strictly to the 2026-11-09 user decision:
 * When no Arabic voice is installed, reports `hasVoice: false` and `missingArabicNotice: true`
 * so the UI shows the clear localized message without failing or attempting speech.
 */
export function selectTtsVoiceForParagraph(
  text: string,
  voices: { lang: string; voiceURI: string; name?: string }[],
  preferredEnVoiceURI?: string,
  preferredArVoiceURI?: string,
): VoiceSelectionResult {
  const isAr = isArabicText(text);

  if (isAr) {
    // Check if an Arabic voice exists
    const arabicVoice = voices.find(v =>
      (preferredArVoiceURI && v.voiceURI === preferredArVoiceURI) ||
      v.lang.toLowerCase().startsWith('ar')
    );

    if (arabicVoice) {
      return {
        hasVoice: true,
        voiceURI: arabicVoice.voiceURI,
        lang: arabicVoice.lang,
        missingArabicNotice: false,
      };
    }

    // No Arabic voice installed
    return {
      hasVoice: false,
      lang: 'ar',
      missingArabicNotice: true,
    };
  }

  // English / Western text
  const englishVoice = voices.find(v =>
    (preferredEnVoiceURI && v.voiceURI === preferredEnVoiceURI) ||
    v.lang.toLowerCase().startsWith('en')
  );

  if (englishVoice) {
    return {
      hasVoice: true,
      voiceURI: englishVoice.voiceURI,
      lang: englishVoice.lang,
      missingArabicNotice: false,
    };
  }

  // Fallback to any voice if available
  const anyVoice = voices[0];
  return {
    hasVoice: Boolean(anyVoice),
    voiceURI: anyVoice?.voiceURI,
    lang: anyVoice?.lang || 'en-US',
    missingArabicNotice: false,
  };
}
