/**
 * Baglib — Dedicated 5-Vector Edition Intelligence Engine
 *
 * Vector 1: Unicode Normalization & Visual-Order Reversal (Fixes Broken Arabic PDFs)
 * Vector 2: Imprint & CIP Page Locator (Find the "Needle" Page First)
 * Vector 3: Checksum-Validated ISBN Extraction -> Edition Resolution (via Open Library)
 * Vector 4: PDF Outline (Bookmarks) & EPUB Package Spine Inspection
 * Vector 5: Smart Synthesis for Classical Islamic & Academic Works
 *
 * Fully bilingual: Supports English & Academic editions as well as Arabic & Islamic Heritage editions.
 * Maps directly to the `edition` table schema (`edition.label`).
 */

import fs from 'fs';
import path from 'path';
import { openLibraryClient } from '../metadata/http-client';

const pdfParse = require('pdf-parse');
const yauzl = require('yauzl');

// ---------------------------------------------------------------------------
// Engine Output Contract & Types
// ---------------------------------------------------------------------------

export interface EditionExtractionResult {
  /** Formatted string ready for edition.label (e.g., "3rd Revised Edition" or "الطبعة الثانية - دار السلام") */
  editionLabel: string | null;
  /** Numeric representation if determinable (e.g., 1, 2, 3) */
  editionNumber: number | null;
  /** Checksum-verified ISBN found inside the file */
  extractedIsbn: string | null;
  /** Publisher detected on the imprint page */
  extractedPublisher: string | null;
  /** Year (Hijri or Gregorian) detected on the imprint page */
  extractedYear: number | null;
  /** Which vector yielded the primary result */
  vectorUsed: 'filename' | 'imprint_page' | 'reversed_rtl_imprint' | 'isbn_lookup' | 'epub_opf' | 'none';
  /** The exact 1-2 lines from the copyright/imprint page that matched */
  rawSnippet: string | null;
  /** Confidence score from 0.0 to 1.0 */
  confidence: number;

  // Backward compatibility with previous callers and tests:
  isRevised: boolean;
  source: 'filename' | 'imprint_page' | 'reversed_rtl_imprint' | 'isbn_lookup' | 'epub_opf' | 'front_matter' | 'back_matter' | 'embedded_metadata' | 'none';
  rawMatch?: string;
}

export type ExtractedEditionResult = EditionExtractionResult;

// ---------------------------------------------------------------------------
// Bilingual Ordinal and Number Dictionaries
// ---------------------------------------------------------------------------

export const ARABIC_WORD_TO_NUMBER: Record<string, number> = {
  'الاولى': 1, 'الأولى': 1, 'الاول': 1, 'الأول': 1, 'أولى': 1, 'اولى': 1,
  'الثانية': 2, 'الثاني': 2, 'ثانية': 2,
  'الثالثة': 3, 'الثالث': 3, 'ثالثة': 3,
  'الرابعة': 4, 'الرابع': 4, 'رابعة': 4,
  'الخامسة': 5, 'الخامس': 5, 'خامسة': 5,
  'السادسة': 6, 'السادس': 6, 'سادسة': 6,
  'السابعة': 7, 'السابع': 7, 'سابعة': 7,
  'الثامنة': 8, 'الثامن': 8, 'ثامنة': 8,
  'التاسعة': 9, 'التاسع': 9, 'تاسعة': 9,
  'العاشرة': 10, 'العاشر': 10, 'عاشرة': 10,
  'الحادية عشرة': 11, 'الحادية عشر': 11, 'الحادي عشر': 11,
  'الثانية عشرة': 12, 'الثانية عشر': 12, 'الثاني عشر': 12,
  'الثالثة عشرة': 13, 'الثالثة عشر': 13, 'الثالث عشر': 13,
  'الرابعة عشرة': 14, 'الرابعة عشر': 14, 'الرابع عشر': 14,
  'الخامسة عشرة': 15, 'الخامسة عشر': 15, 'الخامس عشر': 15,
  'السادسة عشرة': 16, 'السادسة عشر': 16, 'السادس عشر': 16,
  'السابعة عشرة': 17, 'السابعة عشر': 17, 'السابع عشر': 17,
  'الثامنة عشرة': 18, 'الثامنة عشر': 18, 'الثامن عشر': 18,
  'التاسعة عشرة': 19, 'التاسعة عشر': 19, 'التاسع عشر': 19,
  'العشرون': 20, 'العشرين': 20,
};

export const NUMBER_TO_ARABIC_ORDINAL: Record<number, string> = {
  1: 'الأولى',
  2: 'الثانية',
  3: 'الثالثة',
  4: 'الرابعة',
  5: 'الخامسة',
  6: 'السادسة',
  7: 'السابعة',
  8: 'الثامنة',
  9: 'التاسعة',
  10: 'العاشرة',
  11: 'الحادية عشرة',
  12: 'الثانية عشرة',
  13: 'الثالثة عشرة',
  14: 'الرابعة عشرة',
  15: 'الخامسة عشرة',
  16: 'السادسة عشرة',
  17: 'السابعة عشرة',
  18: 'الثامنة عشرة',
  19: 'التاسعة عشرة',
  20: 'العشرون',
};

export const ENGLISH_WORD_TO_NUMBER: Record<string, number> = {
  'first': 1, '1st': 1,
  'second': 2, '2nd': 2,
  'third': 3, '3rd': 3,
  'fourth': 4, '4th': 4,
  'fifth': 5, '5th': 5,
  'sixth': 6, '6th': 6,
  'seventh': 7, '7th': 7,
  'eighth': 8, '8th': 8,
  'ninth': 9, '9th': 9,
  'tenth': 10, '10th': 10,
  'eleventh': 11, '11th': 11,
  'twelfth': 12, '12th': 12,
  'thirteenth': 13, '13th': 13,
  'fourteenth': 14, '14th': 14,
  'fifteenth': 15, '15th': 15,
  'sixteenth': 16, '16th': 16,
  'seventeenth': 17, '17th': 17,
  'eighteenth': 18, '18th': 18,
  'nineteenth': 19, '19th': 19,
  'twentieth': 20, '20th': 20,
};

export function getEnglishOrdinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

export function normalizeEasternDigits(str: string): string {
  if (!str) return '';
  return str
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// ---------------------------------------------------------------------------
// Vector 1: Unicode Normalization & Visual-Order Reversal
// ---------------------------------------------------------------------------

/**
 * Normalizes Arabic text by converting presentation forms (NFKC),
 * stripping diacritics (tashkeel), tatweel (kashida), and irregular whitespaces.
 */
export function normalizeArabicText(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFKC')
    // Strip tashkeel / harakat
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Strip tatweel / kashida
    .replace(/\u0640/g, '')
    // Replace invisible / zero-width characters and non-breaking spaces
    .replace(/[\u200B-\u200F\uFEFF\u00A0]/g, ' ')
    // Normalize dashes
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u00ad]/g, '-');
}

/**
 * Tests whether text contains Arabic characters.
 */
export function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/**
 * Reconstructs lines from PDF textContent items using vertical Y-coordinates.
 */
export function extractTextWithLines(textContent: any): string {
  if (!textContent?.items || !Array.isArray(textContent.items)) return '';
  let pageStr = '';
  let lastY: number | null = null;
  for (const item of textContent.items) {
    const str = item.str || '';
    if (!str) continue;
    const y = item.transform ? item.transform[5] : null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) {
      pageStr += '\n';
    } else if (item.hasEOL) {
      pageStr += '\n';
    } else if (pageStr.length > 0 && !pageStr.endsWith('\n') && !pageStr.endsWith(' ')) {
      pageStr += ' ';
    }
    pageStr += str;
    lastY = y;
  }
  return pageStr;
}

/**
 * Checks if a string line represents body text citations, volume numbers, or printer's keys.
 */
function isDisqualifiedLine(line: string): boolean {
  if (!line || line.trim().length === 0) return true;
  const trimmed = line.trim();

  // If line contains imprint / copyright / edition keywords, do not disqualify by length
  const hasKeywords =
    /(?:copyright|©|rights reserved|isbn|edition|\bed\.?\b|published|printing|الطبعة|طبعة|ردمك|حقوق|الناشر|تحقيق|إيداع)/i.test(
      trimmed
    );
  if (hasKeywords) return false;

  // Paragraphs longer than 200 characters without keywords are likely body text rather than imprint lines
  if (trimmed.length > 200) return true;

  // Ignore printer's key: e.g. "10 9 8 7 6 5 4 3 2 1" or "1 3 5 7 9 10 8 6 4 2"
  if (/^(?:\s*\d+\s+){3,}\d+\s*$/.test(trimmed)) return true;

  // Ignore body citations referencing other books: e.g. "see Smith, 2nd ed., p. 45" or "انظر فتح الباري ط السلفية ص 45"
  const hasCitationKeyword =
    /\b(?:see|cf\.|cite|cited|ibid|passim|infra|supra)\b/i.test(trimmed) ||
    /(?:^|[\s،,.\-_:;()\[\]])(?:راجع|انظر)(?:$|[\s،,.\-_:;()\[\]])/i.test(trimmed);
  const hasPageKeyword =
    /\b(?:p\.|pp\.|page|pages)\b/i.test(trimmed) ||
    /(?:^|[\s،,.\-_:;()\[\]])(?:ص\.|ص\s+[0-9٠-٩]+)(?:$|[\s،,.\-_:;()\[\]])/i.test(trimmed);

  if (hasCitationKeyword && hasPageKeyword) {
    return true;
  }

  // Pure Volume/Part indications without edition keywords:
  // e.g. "المجلد الثالث - الجزء الأول" or "Vol. 2, Part 1"
  const hasVolumeMarker =
    /\b(?:(?:المجلد|الجزء|مجلد|جزء)\s+(?:[0-9٠-٩]+|[أ-ي]+)|(?:Vol(?:ume)?|Part|Book)\s+(?:\d+|[IVXLCDM]+))\b/i.test(
      trimmed
    );
  const hasEditionMarker =
    /(?:الطبعة|طبعة|\bedition\b|\bed\.?\b|(?:^|[\s\-_(\[])ط\.?\s*[0-9٠-٩]+)/i.test(trimmed);

  if (hasVolumeMarker && !hasEditionMarker) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Vector 3: Mathematical ISBN-10 & ISBN-13 Checksum Validation
// ---------------------------------------------------------------------------

export function validateIsbn10Checksum(raw: string): boolean {
  const clean = raw.replace(/[-\s]/g, '').toUpperCase();
  if (!/^\d{9}[\dX]$/.test(clean)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean[i], 10) * (10 - i);
  }
  const check = clean[9] === 'X' ? 10 : parseInt(clean[9], 10);
  sum += check;
  return sum % 11 === 0;
}

export function validateIsbn13Checksum(raw: string): boolean {
  const clean = raw.replace(/[-\s]/g, '');
  if (!/^\d{13}$/.test(clean)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(clean[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(clean[12], 10);
}

export function extractAndValidateIsbn(text: string): string | null {
  if (!text) return null;
  const westernText = normalizeEasternDigits(text);

  // Look for ISBN-13 candidates first (978... or 979...)
  const isbn13Matches = westernText.matchAll(/\b(97[89][-\s]?\d{1,5}[-\s]?\d{1,7}[-\s]?\d{1,6}[-\s]?\d)\b/g);
  for (const m of isbn13Matches) {
    const raw = m[1];
    if (validateIsbn13Checksum(raw)) {
      return raw.replace(/[-\s]/g, '');
    }
  }

  // Look for ISBN-10 candidates
  const isbn10Matches = westernText.matchAll(/(?:ISBN(?:-10)?\s*[:#]?\s*)?(\b\d{1,5}[-\s]?\d{1,7}[-\s]?\d{1,6}[-\s]?[\dX]\b)/gi);
  for (const m of isbn10Matches) {
    const raw = m[1];
    if (validateIsbn10Checksum(raw)) {
      return raw.replace(/[-\s]/g, '').toUpperCase();
    }
  }

  return null;
}

/**
 * Resolves exact edition details from OpenLibrary via validated ISBN.
 */
export async function lookupIsbnEdition(isbn: string): Promise<{
  editionLabel?: string;
  publisher?: string;
  year?: number;
} | null> {
  try {
    const clean = isbn.replace(/[-\s]/g, '');
    const data = await Promise.race([
      openLibraryClient.getJson<any>(`/isbn/${clean}.json`),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
    if (!data) return null;

    let editionLabel: string | undefined = data.edition_name?.trim();
    let publisher: string | undefined =
      Array.isArray(data.publishers) && data.publishers.length > 0 ? data.publishers[0]?.trim() : undefined;
    let year: number | undefined;
    if (data.publish_date) {
      const match = String(data.publish_date).match(/\b(19\d\d|20\d\d)\b/);
      if (match) year = parseInt(match[1], 10);
    }
    return { editionLabel, publisher, year };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Vector 2: Imprint & CIP Page Locator
// ---------------------------------------------------------------------------

const ENGLISH_IMPRINT_ANCHORS = [
  'copyright',
  '©',
  'all rights reserved',
  'isbn',
  'cataloging-in-publication',
  'cataloguing in publication',
  'library of congress',
  'british library',
  'published by',
  'first published',
  'printed in',
  'publication data',
];

const ARABIC_IMPRINT_ANCHORS = [
  'جميع الحقوق',
  'حقوق الطبع',
  'حقوق النشر',
  'ردمك',
  'رقم الإيداع',
  'بطاقة فهرسة',
  'فهرسة مكتبة',
  'دار الكتب',
  'الناشر',
  'توزيع',
  'مطبعة',
  'الطبعة',
  'تحقيق:',
  'تحقيق -',
  'اعتنى به:',
  'سنة النشر',
  'خاتمة الطبع',
  'طبع في',
];

// Reversed variants of Arabic anchors (for visual RTL PDF character streams)
const ARABIC_REVERSED_ANCHORS = ARABIC_IMPRINT_ANCHORS.map((a) => a.split('').reverse().join(''));

export function scorePageForImprint(rawPageText: string): number {
  if (!rawPageText || rawPageText.trim().length === 0) return 0;

  const lower = rawPageText.toLowerCase();
  const normalized = normalizeArabicText(rawPageText);
  let score = 0;

  for (const anchor of ENGLISH_IMPRINT_ANCHORS) {
    if (lower.includes(anchor)) {
      score += 3;
    }
  }

  for (const anchor of ARABIC_IMPRINT_ANCHORS) {
    if (normalized.includes(anchor)) {
      score += 3;
    }
  }

  for (const revAnchor of ARABIC_REVERSED_ANCHORS) {
    if (rawPageText.includes(revAnchor) || normalized.includes(revAnchor)) {
      score += 3;
    }
  }

  return score;
}

// ---------------------------------------------------------------------------
// Vector 5: Smart Synthesis for Classical Islamic & Academic Works
// ---------------------------------------------------------------------------

export interface IslamicHeritageMetadata {
  publisher?: string;
  muhaqqiq?: string;
  year?: number;
}

export function extractIslamicHeritageMetadata(text: string): IslamicHeritageMetadata {
  const result: IslamicHeritageMetadata = {};
  if (!text) return result;

  const norm = normalizeArabicText(text);

  // 1. Publisher / Dar detection
  // e.g. "دار المنهاج", "دار ابن الجوزي", "مؤسسة الرسالة", "مكتبة المعارف", "الناشر: دار السلام"
  const pubMatch = norm.match(/(?:الناشر\s*[:\-]?\s*|(?:^|[\s\n]))(دار\s+[^\n\r,،\.\-—()\[\]]{3,35}|مؤسسة\s+[^\n\r,،\.\-—()\[\]]{3,35}|مكتبة\s+[^\n\r,،\.\-—()\[\]]{3,35}|المكتب\s+الإسلامي)/);
  if (pubMatch) {
    const rawPub = pubMatch[1].trim();
    if (!/^(دار\s+الكتب\s+والوثائق|دار\s+الإيداع)$/.test(rawPub)) {
      result.publisher = rawPub;
    }
  }

  // 2. Muhaqqiq / Investigator detection
  // e.g. "تحقيق: محمد عوامة", "دراسة وتحقيق: د. عبد الله التركي", "حققه: أحمد شاكر"
  const muhaqqiqMatch = norm.match(/(?:(?:دراسة\s+و)?تحقيق|حققه|اعتنى\s+به|تخريج|علق\s+عليه|تصحيح)\s*[:\-]\s*([^\n\r,،\.\-—()\[\]]{3,40})/);
  if (muhaqqiqMatch) {
    const rawM = muhaqqiqMatch[1].trim();
    if (rawM.length >= 3 && !/^(الكتاب|النص|المخطوط)$/.test(rawM)) {
      result.muhaqqiq = rawM;
    }
  }

  // 3. Year detection (Hijri or Gregorian)
  const western = normalizeEasternDigits(norm);
  const hijriMatch = western.match(/(?:عام|سنة|هـ|هـ\.)\s*([1-9][0-9]{3}|14[0-5][0-9]|13[0-9]{2})\s*هـ?/);
  const gregMatch = western.match(/(?:عام|سنة|م|م\.)\s*(19[0-9]{2}|20[0-2][0-9])\s*م?/);

  if (hijriMatch) {
    result.year = parseInt(hijriMatch[1], 10);
  } else if (gregMatch) {
    result.year = parseInt(gregMatch[1], 10);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Text and Line Parser (Shared across all tiers with Dual-Direction Scanning)
// ---------------------------------------------------------------------------

interface SingleLineMatch {
  editionLabel: string;
  editionNumber: number | null;
  isRevised: boolean;
  rawSnippet: string;
  confidence: number;
  isReversed: boolean;
}

function matchLineForEdition(rawLine: string): SingleLineMatch | null {
  if (isDisqualifiedLine(rawLine)) return null;

  // Candidate versions of this line to test:
  // 1. Forward normalized
  // 2. Character-reversed (for visual RTL layout where characters were emitted LTR)
  // 3. Word-reversed (for visual layout where words were reversed)
  const candidates: { line: string; isReversed: boolean }[] = [
    { line: rawLine, isReversed: false },
  ];

  if (containsArabic(rawLine)) {
    const charReversed = rawLine.split('').reverse().join('');
    candidates.push({ line: charReversed, isReversed: true });
    const wordReversed = rawLine.split(/\s+/).reverse().join(' ');
    if (wordReversed !== rawLine && wordReversed !== charReversed) {
      candidates.push({ line: wordReversed, isReversed: true });
    }
  }

  for (const { line, isReversed } of candidates) {
    // Sanitize printing vs edition clause
    let sanitized = line.replace(
      /(?:,\s*|\s*[-–]\s*|\s+)(?:[0-9]+(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:printing|impression)[^,\n]*/gi,
      ''
    );
    sanitized = sanitized.replace(/\b(?:printing|impression)\s+[:#]?\s*\d+\b/gi, '');

    // -----------------------------------------------------------------------
    // A. Arabic Patterns (Vector 1 & Vector 5)
    // -----------------------------------------------------------------------
    const normArabic = normalizeArabicText(sanitized);
    const hasArabicKeywords =
      /(?:الطبعة|طبعة)/.test(normArabic) ||
      /(?:^|[\s\-_(\[])ط\.?\s*([0-9٠-٩]+|[أإا]ولى|ثانية|ثالثة|رابعة|خامسة)/.test(normArabic);

    if (hasArabicKeywords) {
      const hasMezeeda = /مزيدة/.test(normArabic);
      const hasMunaqqaha = /منقحة/.test(normArabic);
      const hasMusahhaha = /مصححة/.test(normArabic);
      const hasMuhaqqaqa = /محققة/.test(normArabic);
      const hasJadeeda = /جديدة/.test(normArabic);
      const hasKhassa = /خاصة/.test(normArabic);
      const isRevised = hasMezeeda || hasMunaqqaha || hasMusahhaha || hasMuhaqqaqa || hasJadeeda;

      let qualifierStr = '';
      if (hasMezeeda && hasMunaqqaha) {
        qualifierStr = ' (مزيدة ومنقحة)';
      } else if (hasMunaqqaha && hasMezeeda) {
        qualifierStr = ' (منقحة ومزيدة)';
      } else if (hasMunaqqaha) {
        qualifierStr = ' (منقحة)';
      } else if (hasMezeeda) {
        qualifierStr = ' (مزيدة)';
      } else if (hasMusahhaha) {
        qualifierStr = ' (مصححة)';
      } else if (hasMuhaqqaqa) {
        qualifierStr = ' (محققة)';
      } else if (hasKhassa) {
        qualifierStr = ' (خاصة)';
      } else if (hasJadeeda) {
        qualifierStr = ' (جديدة)';
      }

      // 1. Explicit ordinal words: "الطبعة الأولى", "الطبعة الثانية", etc.
      const wordOrdinalMatch = normArabic.match(
        /(?:الطبعة|طبعة)\s*[:\-_]?\s*(الأولى|الاولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة|السابعة|الثامنة|التاسعة|العاشرة|الحادية\s+عشرة|الثانية\s+عشرة|الثالثة\s+عشرة|الرابعة\s+عشرة|الخامسة\s+عشرة|العشرون|العشرين)/
      );

      if (wordOrdinalMatch) {
        const wordKey = wordOrdinalMatch[1].replace(/\s+/g, ' ');
        const num = ARABIC_WORD_TO_NUMBER[wordKey] || null;
        const canonicalOrdinal = num ? NUMBER_TO_ARABIC_ORDINAL[num] || wordKey : wordKey;
        const editionLabel = `الطبعة ${canonicalOrdinal}${qualifierStr}`;

        return {
          editionLabel,
          editionNumber: num,
          isRevised,
          rawSnippet: rawLine.trim(),
          confidence: 0.95,
          isReversed,
        };
      }

      // 2. Numeric format: "الطبعة: 2", "الطبعة (٢)", "طبعة 3"
      const numericMatch = normArabic.match(/(?:الطبعة|طبعة)\s*[:\-_]?\s*\(?([0-9٠-٩]+)\)?/);
      if (numericMatch) {
        const westernNumStr = normalizeEasternDigits(numericMatch[1]);
        const num = parseInt(westernNumStr, 10);
        if (!isNaN(num) && num > 0 && num <= 100) {
          const canonicalOrdinal = NUMBER_TO_ARABIC_ORDINAL[num];
          const editionLabel = canonicalOrdinal
            ? `الطبعة ${canonicalOrdinal}${qualifierStr}`
            : `الطبعة ${num}${qualifierStr}`;

          return {
            editionLabel,
            editionNumber: num,
            isRevised,
            rawSnippet: rawLine.trim(),
            confidence: 0.95,
            isReversed,
          };
        }
      }

      // 3. Abbreviated Arabic format: "ط1", "ط 2", "ط. ٣", "ط هجر - ط1"
      const abbrevMatch = normArabic.match(
        /(?:^|[\s\-_(\[])ط\.?\s*([0-9٠-٩]+|[أإا]ولى|ثانية|ثالثة|رابعة|خامسة)(?:[\s\-_)\]]|$)/
      );
      if (abbrevMatch) {
        const rawToken = abbrevMatch[1];
        let num: number | null = null;

        if (/^[0-9٠-٩]+$/.test(rawToken)) {
          num = parseInt(normalizeEasternDigits(rawToken), 10);
        } else {
          num = ARABIC_WORD_TO_NUMBER[rawToken] || null;
        }

        if (num !== null && num > 0 && num <= 100) {
          const canonicalOrdinal = NUMBER_TO_ARABIC_ORDINAL[num] || String(num);
          const editionLabel = `الطبعة ${canonicalOrdinal}${qualifierStr}`;

          return {
            editionLabel,
            editionNumber: num,
            isRevised,
            rawSnippet: rawLine.trim(),
            confidence: 0.9,
            isReversed,
          };
        }
      }
    }

    // -----------------------------------------------------------------------
    // B. English & Academic Patterns (Vector 5)
    // -----------------------------------------------------------------------
    const englishLine = sanitized;
    const isRevisedEng = /\b(?:revised|expanded|updated)\b/i.test(englishLine);

    // B.1: Comprehensive English Ordinals with optional qualifiers:
    // e.g. "Fourth Revised and Expanded Edition", "3rd Edition", "2nd Revised Edition", "(3rd ed.)"
    const engOrdinalRegex =
      /\b(?:(\d+)(?:st|nd|rd|th)?|(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth))\s*(?:,\s*)?((?:(?:revised|expanded|updated|annotated|critical|international|centenary|special|standard|student|global|definitive|anniversary)\s*(?:and|&)?\s*)+)?\s*(?:edition|ed\.?)\b/i;

    const engMatch = englishLine.match(engOrdinalRegex);
    if (engMatch) {
      let num: number | null = null;
      if (engMatch[1]) {
        num = parseInt(engMatch[1], 10);
      } else if (engMatch[2]) {
        num = ENGLISH_WORD_TO_NUMBER[engMatch[2].toLowerCase()] || null;
      }

      if (num !== null && num > 0 && num <= 100) {
        const ordSuffix = getEnglishOrdinal(num);
        const rawQualifier = engMatch[3]?.trim();

        let qualifierClean = '';
        if (rawQualifier) {
          qualifierClean = rawQualifier
            .split(/\s+/)
            .map((w) => {
              const lower = w.toLowerCase();
              if (lower === 'and' || lower === '&') return 'and';
              return lower.charAt(0).toUpperCase() + lower.slice(1);
            })
            .join(' ');
        }

        const editionLabel = qualifierClean
          ? `${ordSuffix} ${qualifierClean} Edition`
          : `${ordSuffix} Edition`;

        return {
          editionLabel,
          editionNumber: num,
          isRevised: isRevisedEng,
          rawSnippet: rawLine.trim(),
          confidence: 0.95,
          isReversed: false,
        };
      }
    }

    // B.2: Standalone Qualifiers without ordinal number:
    // e.g. "Revised Edition", "Expanded Edition", "International Edition"
    const standaloneQualifierMatch = englishLine.match(
      /\b((?:revised|expanded|updated|annotated|critical|international|centenary|special|standard|student|global|definitive)\s*(?:and|&)?\s*(?:revised|expanded|updated)?)\s+edition\b/i
    );
    if (standaloneQualifierMatch) {
      const q = standaloneQualifierMatch[1].trim();
      const titleCased = q
        .split(/\s+/)
        .map((w) => {
          const lower = w.toLowerCase();
          if (lower === 'and' || lower === '&') return 'and';
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(' ');

      return {
        editionLabel: `${titleCased} Edition`,
        editionNumber: null,
        isRevised: isRevisedEng,
        rawSnippet: rawLine.trim(),
        confidence: 0.85,
        isReversed: false,
      };
    }

    // B.3: Key-value imprint lines: e.g. "Edition: 4", "Edition statement: Second edition"
    const kvMatch = englishLine.match(/\bEdition\s*(?:statement)?\s*[:=]\s*([^\n\r,;]+)/i);
    if (kvMatch) {
      const val = kvMatch[1].trim();
      const valNumMatch = val.match(/^(\d+)(?:st|nd|rd|th)?/i);
      const valWordMatch = val.match(/^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)/i);

      let num: number | null = null;
      if (valNumMatch) {
        num = parseInt(valNumMatch[1], 10);
      } else if (valWordMatch) {
        num = ENGLISH_WORD_TO_NUMBER[valWordMatch[1].toLowerCase()] || null;
      }

      if (num !== null && num > 0) {
        return {
          editionLabel: `${getEnglishOrdinal(num)} Edition`,
          editionNumber: num,
          isRevised: isRevisedEng,
          rawSnippet: rawLine.trim(),
          confidence: 0.9,
          isReversed: false,
        };
      }
    }

    // B.4: First published expressions (UK / Commonwealth / Verso imprint convention):
    // e.g. "First published by Verso 2024", "First published 2024"
    const firstPubMatch = englishLine.match(/\b(?:first|1st)\s+published\b/i);
    if (firstPubMatch) {
      return {
        editionLabel: '1st Edition',
        editionNumber: 1,
        isRevised: false,
        rawSnippet: rawLine.trim(),
        confidence: 0.9,
        isReversed: false,
      };
    }
  }

  return null;
}

/**
 * Parses raw text or multiline front-matter using dual-direction scanning and synthesis.
 */
export function parseEditionFromText(
  rawText: string,
  options?: {
    isFilename?: boolean;
    detectedLanguage?: 'ar' | 'en' | string;
  }
): ExtractedEditionResult {
  if (!rawText || typeof rawText !== 'string') {
    return {
      editionLabel: null,
      editionNumber: null,
      extractedIsbn: null,
      extractedPublisher: null,
      extractedYear: null,
      vectorUsed: 'none',
      rawSnippet: null,
      confidence: 0,
      isRevised: false,
      source: 'none',
    };
  }

  const lines = rawText
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const validLines = lines.filter((l) => !isDisqualifiedLine(l));
  if (validLines.length === 0) {
    return {
      editionLabel: null,
      editionNumber: null,
      extractedIsbn: null,
      extractedPublisher: null,
      extractedYear: null,
      vectorUsed: 'none',
      rawSnippet: null,
      confidence: 0,
      isRevised: false,
      source: 'none',
    };
  }

  const validText = validLines.join('\n');
  const extractedIsbn = extractAndValidateIsbn(validText);
  const islamicMeta = extractIslamicHeritageMetadata(validText);

  let bestMatch: SingleLineMatch | null = null;

  for (const line of validLines) {
    const match = matchLineForEdition(line);
    if (match) {
      bestMatch = match;
      break;
    }
  }

  if (bestMatch) {
    let finalLabel = bestMatch.editionLabel;

    // Vector 5 composite enhancement: If Arabic book has Dar / Publisher detected, synthesize scholar-friendly label
    if (containsArabic(rawText) && islamicMeta.publisher && !finalLabel.includes(islamicMeta.publisher)) {
      if (islamicMeta.muhaqqiq) {
        finalLabel = `${finalLabel} - ${islamicMeta.publisher} - تحقيق: ${islamicMeta.muhaqqiq}`;
      } else {
        finalLabel = `${finalLabel} - ${islamicMeta.publisher}`;
      }
    }

    const vector = options?.isFilename
      ? 'filename'
      : bestMatch.isReversed
      ? 'reversed_rtl_imprint'
      : 'imprint_page';

    return {
      editionLabel: finalLabel,
      editionNumber: bestMatch.editionNumber,
      extractedIsbn,
      extractedPublisher: islamicMeta.publisher || null,
      extractedYear: islamicMeta.year || null,
      vectorUsed: vector,
      rawSnippet: bestMatch.rawSnippet,
      confidence: bestMatch.confidence,
      isRevised: bestMatch.isRevised,
      source: options?.isFilename ? 'filename' : 'front_matter',
      rawMatch: bestMatch.rawSnippet,
    };
  }

  // Vector 5 Fallback: Classical Islamic Heritage Composite when ordinal edition is absent
  if (containsArabic(rawText) && (islamicMeta.publisher || islamicMeta.muhaqqiq)) {
    let compositeLabel = '';
    if (islamicMeta.publisher && islamicMeta.muhaqqiq) {
      compositeLabel = `ط. ${islamicMeta.publisher} - تحقيق: ${islamicMeta.muhaqqiq}`;
    } else if (islamicMeta.publisher) {
      compositeLabel = `ط. ${islamicMeta.publisher}`;
    } else if (islamicMeta.muhaqqiq) {
      compositeLabel = `ط. بتحقيق: ${islamicMeta.muhaqqiq}`;
    }

    if (compositeLabel) {
      return {
        editionLabel: compositeLabel,
        editionNumber: null,
        extractedIsbn,
        extractedPublisher: islamicMeta.publisher || null,
        extractedYear: islamicMeta.year || null,
        vectorUsed: 'imprint_page',
        rawSnippet: compositeLabel,
        confidence: 0.75,
        isRevised: false,
        source: 'front_matter',
        rawMatch: compositeLabel,
      };
    }
  }

  return {
    editionLabel: null,
    editionNumber: null,
    extractedIsbn,
    extractedPublisher: islamicMeta.publisher || null,
    extractedYear: islamicMeta.year || null,
    vectorUsed: 'none',
    rawSnippet: null,
    confidence: 0,
    isRevised: false,
    source: 'none',
  };
}

// ---------------------------------------------------------------------------
// Filename & Path Parser
// ---------------------------------------------------------------------------

export function parseEditionFromFilename(filePathOrName: string): ExtractedEditionResult {
  if (!filePathOrName) {
    return {
      editionLabel: null,
      editionNumber: null,
      extractedIsbn: null,
      extractedPublisher: null,
      extractedYear: null,
      vectorUsed: 'none',
      rawSnippet: null,
      confidence: 0,
      isRevised: false,
      source: 'none',
    };
  }

  const baseName = path.basename(filePathOrName, path.extname(filePathOrName));
  const parsed = parseEditionFromText(baseName, { isFilename: true });

  if (parsed.editionLabel) {
    return {
      ...parsed,
      vectorUsed: 'filename',
      source: 'filename',
      confidence: Math.max(0.7, parsed.confidence),
    };
  }

  return {
    editionLabel: null,
    editionNumber: null,
    extractedIsbn: null,
    extractedPublisher: null,
    extractedYear: null,
    vectorUsed: 'none',
    rawSnippet: null,
    confidence: 0,
    isRevised: false,
    source: 'none',
  };
}

// ---------------------------------------------------------------------------
// Vector 2 & Vector 4: PDF Imprint Scanner & Container Inspector
// ---------------------------------------------------------------------------

async function scanPdfForEdition(filePath: string): Promise<ExtractedEditionResult> {
  const fileBuffer = await fs.promises.readFile(filePath);
  const pdfFn = typeof pdfParse === 'function' ? pdfParse : pdfParse.default || pdfParse.PDF;

  try {
    const scoredPages: { pageNum: number; text: string; score: number }[] = [];
    let totalPages = 0;

    const pagerender = async (pageData: any) => {
      const pageNum =
        pageData.pageNumber || (pageData.pageIndex !== undefined ? pageData.pageIndex + 1 : 1);
      // Scan first 8 pages
      if (pageNum > 8) return '';

      const textContent = await pageData.getTextContent();
      const pageStr = extractTextWithLines(textContent);
      const score = scorePageForImprint(pageStr);
      scoredPages.push({ pageNum, text: pageStr, score });
      return pageStr;
    };

    const parsed = await pdfFn(new Uint8Array(fileBuffer), { pagerender, max: 8 });
    totalPages = parsed.numpages || scoredPages.length;

    // Vector 4: Inspect PDF metadata / XMP info
    const meta = parsed.metadata?._metadata || {};
    const pdfInfo = parsed.info || {};
    const xmpEdition = meta['pdfx:edition'] || meta['xmp:edition'] || meta['prism:edition'];
    const xmpPublisher = meta['pdfx:publisher'] || meta['dc:publisher'] || pdfInfo.Publisher;
    const xmpYear = meta['pdfx:year'] || meta['prism:publicationdate'];

    let containerEditionCandidate: EditionExtractionResult | null = null;
    if (xmpEdition) {
      const parsedXmp = parseEditionFromText(String(xmpEdition));
      if (parsedXmp.editionLabel) {
        containerEditionCandidate = {
          ...parsedXmp,
          extractedPublisher: xmpPublisher ? String(xmpPublisher) : null,
          extractedYear: xmpYear ? parseInt(String(xmpYear), 10) || null : null,
          vectorUsed: 'epub_opf', // container metadata
          source: 'embedded_metadata',
          confidence: 0.95,
        };
      }
    }

    // Sort scored front pages by imprint score descending (Vector 2)
    scoredPages.sort((a, b) => b.score - a.score);

    let collectedIsbn: string | null = null;
    let collectedPublisher: string | null = null;
    let collectedYear: number | null = null;

    for (const page of scoredPages) {
      if (!page.text || page.text.trim().length === 0) continue;

      const pageRes = parseEditionFromText(page.text);
      if (pageRes.extractedIsbn && !collectedIsbn) collectedIsbn = pageRes.extractedIsbn;
      if (pageRes.extractedPublisher && !collectedPublisher) collectedPublisher = pageRes.extractedPublisher;
      if (pageRes.extractedYear && !collectedYear) collectedYear = pageRes.extractedYear;

      if (pageRes.editionLabel) {
        return {
          ...pageRes,
          extractedIsbn: collectedIsbn || pageRes.extractedIsbn,
          extractedPublisher: collectedPublisher || pageRes.extractedPublisher,
          extractedYear: collectedYear || pageRes.extractedYear,
          source: 'front_matter',
          rawSnippet: `Detected from PDF Imprint Page ${page.pageNum}: ${pageRes.rawSnippet}`,
          confidence: 0.95,
        };
      }
    }

    // Also scan last 4 colophon pages for classical works / Arabic prints (only if front pages did not match)
    if (totalPages > 8) {
      const backCutoff = Math.max(9, totalPages - 3);
      const backPages: { pageNum: number; text: string; score: number }[] = [];

      const colophonRenderer = async (pageData: any) => {
        const pageNum =
          pageData.pageNumber || (pageData.pageIndex !== undefined ? pageData.pageIndex + 1 : 1);
        if (pageNum < backCutoff) return '';

        const textContent = await pageData.getTextContent();
        const pageStr = extractTextWithLines(textContent);
        const score = scorePageForImprint(pageStr);
        backPages.push({ pageNum, text: pageStr, score });
        return pageStr;
      };

      await pdfFn(new Uint8Array(fileBuffer), { pagerender: colophonRenderer, max: 0 });
      backPages.sort((a, b) => b.score - a.score);

      for (const page of backPages) {
        if (!page.text || page.text.trim().length === 0) continue;
        const pageRes = parseEditionFromText(page.text);
        if (pageRes.extractedIsbn && !collectedIsbn) collectedIsbn = pageRes.extractedIsbn;
        if (pageRes.extractedPublisher && !collectedPublisher) collectedPublisher = pageRes.extractedPublisher;
        if (pageRes.extractedYear && !collectedYear) collectedYear = pageRes.extractedYear;

        if (pageRes.editionLabel) {
          return {
            ...pageRes,
            extractedIsbn: collectedIsbn || pageRes.extractedIsbn,
            extractedPublisher: collectedPublisher || pageRes.extractedPublisher,
            extractedYear: collectedYear || pageRes.extractedYear,
            source: 'back_matter',
            rawSnippet: `Detected from PDF Colophon Page ${page.pageNum}: ${pageRes.rawSnippet}`,
            confidence: 0.9,
          };
        }
      }
    }

    // Vector 3: Checksum-Validated ISBN -> OpenLibrary Resolution
    if (collectedIsbn) {
      const olResult = await lookupIsbnEdition(collectedIsbn);
      if (olResult?.editionLabel) {
        return {
          editionLabel: olResult.editionLabel,
          editionNumber: null,
          extractedIsbn: collectedIsbn,
          extractedPublisher: olResult.publisher || collectedPublisher,
          extractedYear: olResult.year || collectedYear,
          vectorUsed: 'isbn_lookup',
          rawSnippet: `Resolved from Open Library via ISBN ${collectedIsbn}`,
          confidence: 0.85,
          isRevised: false,
          source: 'embedded_metadata',
        };
      }
    }

    // If container metadata gave an edition
    if (containerEditionCandidate) {
      return {
        ...containerEditionCandidate,
        extractedIsbn: collectedIsbn || containerEditionCandidate.extractedIsbn,
        extractedPublisher: collectedPublisher || containerEditionCandidate.extractedPublisher,
        extractedYear: collectedYear || containerEditionCandidate.extractedYear,
      };
    }

    // Return collected metadata even if explicit edition was not found
    return {
      editionLabel: null,
      editionNumber: null,
      extractedIsbn: collectedIsbn,
      extractedPublisher: collectedPublisher,
      extractedYear: collectedYear,
      vectorUsed: 'none',
      rawSnippet: null,
      confidence: 0,
      isRevised: false,
      source: 'none',
    };
  } catch (err: any) {
    console.warn('[editionExtractor] PDF page scan error:', err?.message || err);
    return {
      editionLabel: null,
      editionNumber: null,
      extractedIsbn: null,
      extractedPublisher: null,
      extractedYear: null,
      vectorUsed: 'none',
      rawSnippet: null,
      confidence: 0,
      isRevised: false,
      source: 'none',
    };
  }
}

// ---------------------------------------------------------------------------
// Vector 4: EPUB Package & Spine Inspection
// ---------------------------------------------------------------------------

function getZipEntryBuffer(filePath: string, targetFile: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    yauzl.open(filePath, { lazyEntries: true }, (err: any, zip: any) => {
      if (err || !zip) return resolve(null);
      zip.readEntry();
      zip.on('entry', (e: any) => {
        const matches =
          e.fileName === targetFile ||
          e.fileName.toLowerCase() === targetFile.toLowerCase() ||
          e.fileName.endsWith('/' + targetFile) ||
          e.fileName.toLowerCase().endsWith('/' + targetFile.toLowerCase());
        if (matches) {
          zip.openReadStream(e, (streamErr: any, stream: any) => {
            if (streamErr || !stream) {
              try { zip.close(); } catch (_) {}
              return resolve(null);
            }
            const chunks: Buffer[] = [];
            stream.on('data', (c: Buffer) => chunks.push(c));
            stream.on('end', () => {
              try { zip.close(); } catch (_) {}
              resolve(Buffer.concat(chunks));
            });
            stream.on('error', () => {
              try { zip.close(); } catch (_) {}
              resolve(null);
            });
          });
        } else {
          zip.readEntry();
        }
      });
      zip.on('end', () => resolve(null));
      zip.on('error', () => resolve(null));
    });
  });
}

function listZipEntries(filePath: string): Promise<string[]> {
  return new Promise((resolve) => {
    yauzl.open(filePath, { lazyEntries: true }, (err: any, zip: any) => {
      if (err || !zip) return resolve([]);
      const fileNames: string[] = [];
      zip.readEntry();
      zip.on('entry', (e: any) => {
        fileNames.push(e.fileName);
        zip.readEntry();
      });
      zip.on('end', () => resolve(fileNames));
      zip.on('error', () => resolve(fileNames));
    });
  });
}

async function scanEpubForEdition(filePath: string): Promise<ExtractedEditionResult> {
  try {
    const fileNames = await listZipEntries(filePath);
    if (!fileNames || fileNames.length === 0) {
      return {
        editionLabel: null,
        editionNumber: null,
        extractedIsbn: null,
        extractedPublisher: null,
        extractedYear: null,
        vectorUsed: 'none',
        rawSnippet: null,
        confidence: 0,
        isRevised: false,
        source: 'none',
      };
    }

    const opfPath = fileNames.find((f) => f.endsWith('.opf')) || 'content.opf';
    const opfBuf = await getZipEntryBuffer(filePath, opfPath);
    let opfEdition: string | null = null;
    let opfPublisher: string | null = null;
    let opfYear: number | null = null;
    let opfIsbn: string | null = null;

    if (opfBuf) {
      const opfXml = opfBuf.toString('utf8');
      const schemaEdMatch = opfXml.match(/<meta\s+[^>]*property="schema:bookEdition"[^>]*>([^<]+)<\/meta>/i);
      if (schemaEdMatch) opfEdition = schemaEdMatch[1].trim();

      const pubMatch = opfXml.match(/<dc:publisher[^>]*>([^<]+)<\/dc:publisher>/i);
      if (pubMatch) opfPublisher = pubMatch[1].trim();

      const dateMatch = opfXml.match(/<dc:date[^>]*>([0-9]{4})/i);
      if (dateMatch) opfYear = parseInt(dateMatch[1], 10);

      const isbnMatches = Array.from(opfXml.matchAll(/<dc:identifier[^>]*>([^<]+)<\/dc:identifier>/gi));
      for (const im of isbnMatches) {
        const candidate = extractAndValidateIsbn(im[1]);
        if (candidate) {
          opfIsbn = candidate;
          break;
        }
      }

      if (opfEdition) {
        const parsedOpf = parseEditionFromText(opfEdition);
        if (parsedOpf.editionLabel) {
          return {
            ...parsedOpf,
            extractedIsbn: opfIsbn,
            extractedPublisher: opfPublisher,
            extractedYear: opfYear,
            vectorUsed: 'epub_opf',
            source: 'embedded_metadata',
            confidence: 0.95,
          };
        }
      }
    }

    // Find candidate imprint / copyright / title files in the EPUB zip
    const candidateFiles = fileNames.filter((f) =>
      /\.(?:xhtml|html|htm)$/i.test(f) &&
      /copyright|imprint|title|colophon|legal|frontmatter|fm0/i.test(f)
    );
    // If none found by regex, fallback to the first 4 xhtml files
    if (candidateFiles.length === 0) {
      candidateFiles.push(...fileNames.filter((f) => /\.(?:xhtml|html|htm)$/i.test(f)).slice(0, 4));
    }

    for (const cf of candidateFiles) {
      const entryBuf = await getZipEntryBuffer(filePath, cf);
      if (!entryBuf) continue;
      const text = entryBuf.toString('utf8').replace(/<[^>]+>/g, '\n');
      const parsed = parseEditionFromText(text);

      if (parsed.extractedIsbn && !opfIsbn) opfIsbn = parsed.extractedIsbn;
      if (parsed.extractedPublisher && !opfPublisher) opfPublisher = parsed.extractedPublisher;
      if (parsed.extractedYear && !opfYear) opfYear = parsed.extractedYear;

      if (parsed.editionLabel) {
        return {
          ...parsed,
          extractedIsbn: opfIsbn || parsed.extractedIsbn,
          extractedPublisher: opfPublisher || parsed.extractedPublisher,
          extractedYear: opfYear || parsed.extractedYear,
          vectorUsed: parsed.vectorUsed === 'reversed_rtl_imprint' ? 'reversed_rtl_imprint' : 'imprint_page',
          source: 'front_matter',
          rawSnippet: `Detected from EPUB (${path.basename(cf)}): ${parsed.rawSnippet}`,
          confidence: 0.95,
        };
      }
    }

    // Vector 3: OpenLibrary lookup via EPUB ISBN
    if (opfIsbn) {
      const ol = await lookupIsbnEdition(opfIsbn);
      if (ol?.editionLabel) {
        return {
          editionLabel: ol.editionLabel,
          editionNumber: null,
          extractedIsbn: opfIsbn,
          extractedPublisher: ol.publisher || opfPublisher,
          extractedYear: ol.year || opfYear,
          vectorUsed: 'isbn_lookup',
          rawSnippet: `Resolved from Open Library via ISBN ${opfIsbn}`,
          confidence: 0.85,
          isRevised: false,
          source: 'embedded_metadata',
        };
      }
    }

    return {
      editionLabel: null,
      editionNumber: null,
      extractedIsbn: opfIsbn,
      extractedPublisher: opfPublisher,
      extractedYear: opfYear,
      vectorUsed: 'none',
      rawSnippet: null,
      confidence: 0,
      isRevised: false,
      source: 'none',
    };
  } catch {
    return {
      editionLabel: null,
      editionNumber: null,
      extractedIsbn: null,
      extractedPublisher: null,
      extractedYear: null,
      vectorUsed: 'none',
      rawSnippet: null,
      confidence: 0,
      isRevised: false,
      source: 'none',
    };
  }
}

async function scanTextFileForEdition(filePath: string, ext: string): Promise<ExtractedEditionResult> {
  try {
    const rawContent = await fs.promises.readFile(filePath, 'utf8');
    let text = rawContent;
    if (ext === '.html' || ext === '.htm') {
      text = text.replace(/<style[^<]*<\/style>/gi, ' ');
      text = text.replace(/<script[^<]*<\/script>/gi, ' ');
      text = text.replace(/<[^>]+>/g, ' ');
    }

    const lines = text.split(/[\r\n]+/).slice(0, 300).join('\n');
    const parsed = parseEditionFromText(lines);
    if (parsed.editionLabel) {
      return {
        ...parsed,
        source: 'front_matter',
        confidence: 0.9,
      };
    }
  } catch {
    // Proceed
  }

  return {
    editionLabel: null,
    editionNumber: null,
    extractedIsbn: null,
    extractedPublisher: null,
    extractedYear: null,
    vectorUsed: 'none',
    rawSnippet: null,
    confidence: 0,
    isRevised: false,
    source: 'none',
  };
}

function readZipEntry(zipfile: any, entry: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err: any, stream: any) => {
      if (err || !stream) {
        reject(err || new Error('Stream unavailable'));
        return;
      }
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', (streamErr: any) => reject(streamErr));
    });
  });
}

// ---------------------------------------------------------------------------
// Main Public Engine Entry Point
// ---------------------------------------------------------------------------

/**
 * 5-Vector Edition Intelligence Engine
 * 1. Vector 1: Unicode Normalization & Visual-Order Reversal (Fixes Broken Arabic PDFs)
 * 2. Vector 2: Imprint & CIP Page Locator (Find the "Needle" Page First)
 * 3. Vector 3: Checksum-Validated ISBN Extraction -> Edition Resolution
 * 4. Vector 4: PDF Outline (Bookmarks) & EPUB Package Spine Inspection
 * 5. Vector 5: Smart Synthesis for Classical Islamic & Academic Works
 */
export async function extractEditionFromEbook(
  filePathOrText: string,
  options?: {
    extractedTitle?: string;
    detectedLanguage?: 'ar' | 'en' | string;
    forceDeepScan?: boolean;
    openLibraryLookup?: boolean;
  }
): Promise<EditionExtractionResult> {
  if (!filePathOrText) {
    return {
      editionLabel: null,
      editionNumber: null,
      extractedIsbn: null,
      extractedPublisher: null,
      extractedYear: null,
      vectorUsed: 'none',
      rawSnippet: null,
      confidence: 0,
      isRevised: false,
      source: 'none',
    };
  }

  const ext = path.extname(filePathOrText).toLowerCase();
  const isBookExtension = ['.pdf', '.epub', '.mobi', '.azw3', '.azw', '.prc', '.html', '.htm', '.txt'].includes(ext);
  const existsOnDisk = fs.existsSync(filePathOrText);

  // If input is raw multiline text or a text snippet without book extension that doesn't exist on disk
  if (filePathOrText.includes('\n') || filePathOrText.includes('\r') || (!isBookExtension && !existsOnDisk)) {
    const textRes = parseEditionFromText(filePathOrText, options);
    if (textRes.editionLabel) {
      return {
        ...textRes,
        source: 'front_matter',
      };
    }
    return textRes;
  }

  // Vector: Filename & Path Parsing
  const filenameResult = parseEditionFromFilename(filePathOrText);
  if (filenameResult.editionLabel && !options?.forceDeepScan && !existsOnDisk) {
    return filenameResult;
  }

  // If the file does not exist on disk, return filename result
  if (!existsOnDisk) {
    return filenameResult;
  }

  // If file exists on disk, run in-file deep scan vectors
  let fileResult: EditionExtractionResult = {
    editionLabel: null,
    editionNumber: null,
    extractedIsbn: null,
    extractedPublisher: null,
    extractedYear: null,
    vectorUsed: 'none',
    rawSnippet: null,
    confidence: 0,
    isRevised: false,
    source: 'none',
  };

  if (ext === '.pdf') {
    fileResult = await scanPdfForEdition(filePathOrText);
  } else if (ext === '.epub') {
    fileResult = await scanEpubForEdition(filePathOrText);
  } else if (['.txt', '.html', '.htm'].includes(ext)) {
    fileResult = await scanTextFileForEdition(filePathOrText, ext);
  }

  // If in-file deep scan yielded an edition label with high confidence
  if (fileResult.editionLabel && fileResult.confidence >= 0.7) {
    return fileResult;
  }

  // If filename had an edition label, merge it with extracted metadata from the imprint page
  if (filenameResult.editionLabel) {
    return {
      ...filenameResult,
      extractedIsbn: fileResult.extractedIsbn || filenameResult.extractedIsbn,
      extractedPublisher: fileResult.extractedPublisher || filenameResult.extractedPublisher,
      extractedYear: fileResult.extractedYear || filenameResult.extractedYear,
      vectorUsed: 'filename',
      source: 'filename',
    };
  }

  // If in-file deep scan yielded a synthesized Islamic composite edition
  if (fileResult.editionLabel) {
    return fileResult;
  }

  return fileResult;
}

/**
 * Public Alias for backwards compatibility.
 */
export async function extractEditionInfo(
  filePathOrText: string,
  options?: {
    extractedTitle?: string;
    detectedLanguage?: 'ar' | 'en' | string;
    forceDeepScan?: boolean;
    openLibraryLookup?: boolean;
  }
): Promise<EditionExtractionResult> {
  return extractEditionFromEbook(filePathOrText, options);
}
