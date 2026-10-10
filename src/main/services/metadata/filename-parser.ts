/**
 * Baglib — Robust Filename Metadata Parser
 *
 * Extracts bibliographic candidates (title, author, translator, publisher, year, edition, ISBN)
 * from local book filenames across English, Arabic, and mixed text.
 *
 * Core principles:
 * - Non-destructive: Preserves canonical Arabic diacritics and exact original spelling.
 * - Layered extraction: Strips extensions, removes piracy/tracker tags, extracts ISBNs with checksum verification,
 *   detects explicit role labels, and scores field confidence.
 */

import path from 'path';
import { isValidIsbn10, isValidIsbn13, isValidIsbn } from '../../../shared/validators/metadata-validator';

export interface ParsedFilenameMetadata {
  originalFilename: string;
  cleanedFilename: string;
  title?: string;
  titleConfidence: number;
  authors: string[];
  authorConfidence: number;
  translators: string[];
  translatorConfidence: number;
  publisher?: string;
  publisherConfidence: number;
  publicationYear?: number;
  yearConfidence: number;
  edition?: string;
  editionConfidence: number;
  isbn?: string;
  isbn10?: string;
  isbn13?: string;
  isbnConfidence: number;
  language?: 'ar' | 'en' | 'mixed';
  overallConfidence: number;
}

// Common irrelevant sharing/tracker tokens to strip out cleanly
const TRACKER_TAG_PATTERNS = [
  /\b(?:z-lib(?:\.org|\.is|\.li)?|b-ok(?:\.org)?|libgen(?:\.li|\.rs|\.is|\.lc)?|oceanofpdf(?:\.com)?|annas-archive(?:\.org|\.li|\.gl)?)\b/gi,
  /\[\s*(?:z-lib|libgen|annas-archive|oceanofpdf|vk|pdfdrive)[^\]]*\]/gi,
  /\(\s*(?:z-lib|libgen|annas-archive|oceanofpdf|vk|pdfdrive)[^\)]*\)/gi,
  /\s*\(\s*\d{1,2}\s*\)\s*(?=\.[^.]+$|$)/g, // e.g. " (1)" duplicate download indicator
  /\s*\[\s*\d{1,2}\s*\]\s*(?=\.[^.]+$|$)/g, // e.g. " [1]"
  /\s*-\s*copy\b/gi,
];

// Arabic role markers
const ARABIC_TRANSLATOR_PREFIX = /(?:^|\s)(?:ترجمة|المترجم|نقل|تعريب)(?::|\s)\s*/i;
const ARABIC_AUTHOR_PREFIX = /(?:^|\s)(?:بقلم|تأليف|لـ|للمؤلف|المؤلف)(?::|\s)\s*/i;
const ARABIC_PUBLISHER_PREFIX = /(?:^|\s)(?:دار\s+النشر|دار|منشورات|مؤسسة|مطبعة|مركز|مكتبة)(?::|\s)\s*/i;
const ARABIC_EDITION_PATTERN = /(?:الطبعة\s+[^\s\-\(\)\[\]]+|ط\s*\d+)/i;

// English role markers
const ENGLISH_TRANSLATOR_PREFIX = /(?:^|\s)(?:translated\s+by|translator:?)\s+/i;
const ENGLISH_AUTHOR_PREFIX = /(?:^|\s)(?:written\s+by|by|author:?)\s+/i;
const ENGLISH_PUBLISHER_PREFIX = /(?:^|\s)(?:published\s+by|publisher:?)\s+/i;
const ENGLISH_EDITION_PATTERN = /(?:\b\d+(?:st|nd|rd|th)?\s+(?:ed\.?|edition)\b|\b(?:first|second|third|fourth|fifth|revised|anniversary)\s+edition\b)/i;

export class FilenameParser {
  /**
   * Main entry point: Parses a file path or filename into candidate bibliographic fields with confidence scores.
   */
  static parse(filePathOrName: string): ParsedFilenameMetadata {
    if (!filePathOrName || typeof filePathOrName !== 'string') {
      return this.createEmptyResult(filePathOrName || '');
    }

    // 1. Extract base name without directory path
    const rawBaseName = path.basename(filePathOrName);

    // 2. Remove file extension
    const extMatch = rawBaseName.match(/\.([a-zA-Z0-9]{2,6})$/);
    let nameWithoutExt = extMatch ? rawBaseName.slice(0, extMatch.index) : rawBaseName;

    // 3. Remove irrelevant file-management / site tracker tags
    let workingString = nameWithoutExt;
    for (const tagPattern of TRACKER_TAG_PATTERNS) {
      workingString = workingString.replace(tagPattern, ' ');
    }
    workingString = workingString.replace(/\s+/g, ' ').trim();

    // Determine language affinity
    const hasArabic = /[\u0600-\u06FF]/.test(workingString);
    const hasLatin = /[a-zA-Z]/.test(workingString);
    const language: 'ar' | 'en' | 'mixed' | undefined =
      hasArabic && hasLatin ? 'mixed' : hasArabic ? 'ar' : hasLatin ? 'en' : undefined;

    // 4. Detect and extract ISBN (with checksum verification)
    const isbnResult = this.extractAndRemoveIsbn(workingString);
    workingString = isbnResult.remainingText;

    // 5. Detect and extract Publication Year
    const yearResult = this.extractAndRemoveYear(workingString);
    workingString = yearResult.remainingText;

    // 6. Detect and extract Edition
    const editionResult = this.extractAndRemoveEdition(workingString);
    workingString = editionResult.remainingText;

    // 7. Parse remaining segments & parentheticals for Title, Author, Translator, Publisher
    const semanticResult = this.extractSemanticFields(workingString, {
      hasYear: !!yearResult.year,
      hasEdition: !!editionResult.edition,
    });

    // 8. Calculate overall confidence
    const overallConfidence = this.calculateOverallConfidence({
      titleConfidence: semanticResult.titleConfidence,
      authorConfidence: semanticResult.authorConfidence,
      isbnConfidence: isbnResult.confidence,
      yearConfidence: yearResult.confidence,
      publisherConfidence: semanticResult.publisherConfidence,
      translatorConfidence: semanticResult.translatorConfidence,
    });

    return {
      originalFilename: rawBaseName,
      cleanedFilename: workingString,
      title: semanticResult.title,
      titleConfidence: semanticResult.titleConfidence,
      authors: semanticResult.authors,
      authorConfidence: semanticResult.authorConfidence,
      translators: semanticResult.translators,
      translatorConfidence: semanticResult.translatorConfidence,
      publisher: semanticResult.publisher,
      publisherConfidence: semanticResult.publisherConfidence,
      publicationYear: yearResult.year,
      yearConfidence: yearResult.confidence,
      edition: editionResult.edition,
      editionConfidence: editionResult.confidence,
      isbn: isbnResult.isbn,
      isbn10: isbnResult.isbn10,
      isbn13: isbnResult.isbn13,
      isbnConfidence: isbnResult.confidence,
      language,
      overallConfidence,
    };
  }

  /**
   * Extracts ISBN from filename and verifies checksum.
   */
  private static extractAndRemoveIsbn(text: string): {
    isbn?: string;
    isbn10?: string;
    isbn13?: string;
    confidence: number;
    remainingText: string;
  } {
    // Look for ISBN in brackets, parentheses, or labeled strings
    // Matches ISBN 978..., ISBN-13: 978..., [978...], or isolated 10/13 digit strings
    const isbnRegex = /(?:\[|\(|\b)(?:ISBN(?:-?1[03])?:?\s*)?(97[89][-\s]?[0-9]{1,5}[-\s]?[0-9]+[-\s]?[0-9]+[-\s]?[0-9]|[0-9]{1,5}[-\s]?[0-9]+[-\s]?[0-9]+[-\s]?[0-9X])(?:\]|\)|\b)/i;
    const match = text.match(isbnRegex);

    if (match) {
      const candidateRaw = match[1];
      const cleanCandidate = candidateRaw.replace(/[-\s]/g, '').toUpperCase();

      if (cleanCandidate.length === 13 && isValidIsbn13(cleanCandidate)) {
        const remaining = text.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
        return {
          isbn: cleanCandidate,
          isbn13: cleanCandidate,
          confidence: 1.0,
          remainingText: remaining,
        };
      } else if (cleanCandidate.length === 10 && isValidIsbn10(cleanCandidate)) {
        const remaining = text.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
        return {
          isbn: cleanCandidate,
          isbn10: cleanCandidate,
          confidence: 1.0,
          remainingText: remaining,
        };
      }
    }

    return { confidence: 0, remainingText: text };
  }

  /**
   * Extracts 4-digit publication year (1800-2099) from parentheses, brackets, or isolated tokens.
   */
  private static extractAndRemoveYear(text: string): {
    year?: number;
    confidence: number;
    remainingText: string;
  } {
    // 1. First check explicit in parentheses/brackets e.g. (2022) or [1999]
    const bracketYearRegex = /[\(\[]\s*(18\d{2}|19\d{2}|20\d{2})\s*[\)\]]/;
    const bracketMatch = text.match(bracketYearRegex);
    if (bracketMatch) {
      const year = parseInt(bracketMatch[1], 10);
      const remaining = text.replace(bracketMatch[0], ' ').replace(/\s+/g, ' ').trim();
      return { year, confidence: 0.95, remainingText: remaining };
    }

    // 2. Check year separated by hyphens or at the very end: e.g. " - 2022" or "- 2022 -"
    const isolatedYearRegex = /(?:^|\s*[-–—]\s*)(18\d{2}|19\d{2}|20\d{2})(?:\s*[-–—]|\s*$)/;
    const isolatedMatch = text.match(isolatedYearRegex);
    if (isolatedMatch) {
      const year = parseInt(isolatedMatch[1], 10);
      const remaining = text.replace(isolatedMatch[0], ' ').replace(/\s+/g, ' ').trim();
      return { year, confidence: 0.85, remainingText: remaining };
    }

    return { confidence: 0, remainingText: text };
  }

  /**
   * Extracts edition phrases in English and Arabic.
   */
  private static extractAndRemoveEdition(text: string): {
    edition?: string;
    confidence: number;
    remainingText: string;
  } {
    // 1. English edition patterns
    const enMatch = text.match(ENGLISH_EDITION_PATTERN);
    if (enMatch) {
      const edition = enMatch[0].trim();
      // Clean brackets if enclosed
      const fullToken = text.match(new RegExp(`[\\(\\[]?\\s*${this.escapeRegex(edition)}\\s*[\\)\\]]?`, 'i'));
      const toRemove = fullToken ? fullToken[0] : enMatch[0];
      const remaining = text.replace(toRemove, ' ').replace(/\s+/g, ' ').trim();
      return { edition, confidence: 0.9, remainingText: remaining };
    }

    // 2. Arabic edition patterns
    const arMatch = text.match(ARABIC_EDITION_PATTERN);
    if (arMatch) {
      const edition = arMatch[0].trim();
      const fullToken = text.match(new RegExp(`[\\(\\[]?\\s*${this.escapeRegex(edition)}\\s*[\\)\\]]?`, 'i'));
      const toRemove = fullToken ? fullToken[0] : arMatch[0];
      const remaining = text.replace(toRemove, ' ').replace(/\s+/g, ' ').trim();
      return { edition, confidence: 0.9, remainingText: remaining };
    }

    return { confidence: 0, remainingText: text };
  }

  /**
   * Extracts Title, Author, Translator, Publisher from remaining text segments and labels.
   */
  private static extractSemanticFields(
    text: string,
    context: { hasYear: boolean; hasEdition: boolean }
  ): {
    title?: string;
    titleConfidence: number;
    authors: string[];
    authorConfidence: number;
    translators: string[];
    translatorConfidence: number;
    publisher?: string;
    publisherConfidence: number;
  } {
    const authors: string[] = [];
    const translators: string[] = [];
    let publisher: string | undefined;
    let authorConfidence = 0;
    let translatorConfidence = 0;
    let publisherConfidence = 0;

    // Check parenthetical authors first: e.g. "The Pragmatic Programmer (Andrew Hunt, David Thomas)"
    let working = text;
    const parenAuthorMatch = working.match(/^([^\(\[]+)\s*[\(\[]([^\)\]]+)[\)\]]\s*$/);
    if (parenAuthorMatch) {
      const candidateInside = parenAuthorMatch[2].trim();
      // If the parenthetical is not a year, edition, or publisher label, it's very often authors
      if (!/\d{4}/.test(candidateInside) && !ENGLISH_EDITION_PATTERN.test(candidateInside) && !ARABIC_EDITION_PATTERN.test(candidateInside)) {
        // Check if inside contains labeled publisher or translator
        if (ARABIC_PUBLISHER_PREFIX.test(candidateInside) || ENGLISH_PUBLISHER_PREFIX.test(candidateInside)) {
          publisher = candidateInside.replace(ARABIC_PUBLISHER_PREFIX, '').replace(ENGLISH_PUBLISHER_PREFIX, '').trim();
          publisherConfidence = 0.9;
        } else if (ARABIC_TRANSLATOR_PREFIX.test(candidateInside) || ENGLISH_TRANSLATOR_PREFIX.test(candidateInside)) {
          const transName = candidateInside.replace(ARABIC_TRANSLATOR_PREFIX, '').replace(ENGLISH_TRANSLATOR_PREFIX, '').trim();
          translators.push(...this.splitMultiAuthors(transName));
          translatorConfidence = 0.95;
        } else {
          // It's authors!
          authors.push(...this.splitMultiAuthors(candidateInside));
          authorConfidence = 0.85;
        }
        working = parenAuthorMatch[1].trim();
      }
    }

    // Split by major separators: " - ", " – ", " — ", " _ "
    // Also handle hyphen without spaces if clearly between segments
    const segments = working
      .split(/\s+[-–—_]\s+|\s+[-–—]\s*|\s*[-–—]\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    // If only one segment and no separator was found, check for inline labels
    const unassignedSegments: string[] = [];

    for (const seg of segments) {
      // 1. Translator label
      if (ENGLISH_TRANSLATOR_PREFIX.test(seg) || ARABIC_TRANSLATOR_PREFIX.test(seg)) {
        const cleaned = seg.replace(ENGLISH_TRANSLATOR_PREFIX, '').replace(ARABIC_TRANSLATOR_PREFIX, '').trim();
        translators.push(...this.splitMultiAuthors(cleaned));
        translatorConfidence = 0.95;
        continue;
      }

      // 2. Author label
      if (ENGLISH_AUTHOR_PREFIX.test(seg) || ARABIC_AUTHOR_PREFIX.test(seg)) {
        const cleaned = seg.replace(ENGLISH_AUTHOR_PREFIX, '').replace(ARABIC_AUTHOR_PREFIX, '').trim();
        authors.push(...this.splitMultiAuthors(cleaned));
        authorConfidence = 0.95;
        continue;
      }

      // 3. Publisher label
      if (ENGLISH_PUBLISHER_PREFIX.test(seg) || ARABIC_PUBLISHER_PREFIX.test(seg)) {
        const cleaned = seg.replace(ENGLISH_PUBLISHER_PREFIX, '').replace(ARABIC_PUBLISHER_PREFIX, '').trim();
        // In Arabic, if prefix was "دار", keep the word "دار" as part of publisher name (e.g. "دار النشر" or "دار الشروق")
        if (/^دار(?:\s|$)/.test(seg)) {
          publisher = seg.trim();
        } else {
          publisher = cleaned || seg.trim();
        }
        publisherConfidence = 0.9;
        continue;
      }

      unassignedSegments.push(seg);
    }

    // Now resolve Title and unassigned Authors/Publisher from unassignedSegments
    let title: string | undefined;
    let titleConfidence = 0;

    if (unassignedSegments.length === 1) {
      title = unassignedSegments[0];
      titleConfidence = authors.length > 0 ? 0.9 : 0.6;
    } else if (unassignedSegments.length === 2) {
      if (authors.length > 0) {
        // We already have an author via label or parens, so 1st is title, 2nd is likely publisher or subtitle
        title = unassignedSegments[0];
        titleConfidence = 0.85;
        if (!publisher) {
          publisher = unassignedSegments[1];
          publisherConfidence = 0.7;
        }
      } else {
        // Standard 2-segment pattern: e.g. "Clean Code - Robert C. Martin"
        // In the overwhelming majority of book naming conventions, Segment 1 is Title, Segment 2 is Author
        // Or "Author Name - Book Title". Segment 1 as title with 0.8 confidence.
        title = unassignedSegments[0];
        titleConfidence = 0.8;
        authors.push(...this.splitMultiAuthors(unassignedSegments[1]));
        authorConfidence = 0.75;
      }
    } else if (unassignedSegments.length >= 3) {
      // e.g. "اسم الكتاب - اسم المؤلف - دار النشر" or "Title - Author - Publisher"
      title = unassignedSegments[0];
      titleConfidence = 0.8;

      if (authors.length === 0) {
        authors.push(...this.splitMultiAuthors(unassignedSegments[1]));
        authorConfidence = 0.75;
      }

      if (!publisher && unassignedSegments[2]) {
        publisher = unassignedSegments[2];
        publisherConfidence = 0.7;
      }
    } else if (unassignedSegments.length === 0 && text) {
      // Fallback
      title = text;
      titleConfidence = 0.5;
    }

    return {
      title,
      titleConfidence,
      authors,
      authorConfidence,
      translators,
      translatorConfidence,
      publisher,
      publisherConfidence,
    };
  }

  /**
   * Splits multi-author strings by comma, 'and', '&', or Arabic 'و'.
   */
  public static splitMultiAuthors(raw: string): string[] {
    if (!raw) return [];
    // Protect words starting with 'و' like "وليد" or "وسيم" by requiring whitespace: " و "
    return raw
      .split(/,\s*|\s+(?:and|&)\s+|\s+و\s+/i)
      .map((a) => a.trim())
      .filter((a) => a.length > 1);
  }

  private static calculateOverallConfidence(c: {
    titleConfidence: number;
    authorConfidence: number;
    isbnConfidence: number;
    yearConfidence: number;
    publisherConfidence: number;
    translatorConfidence: number;
  }): number {
    if (c.isbnConfidence === 1.0) {
      return 0.95; // Validated ISBN provides very high certainty
    }

    let score = c.titleConfidence * 0.45 + c.authorConfidence * 0.35;
    if (c.yearConfidence > 0) score += c.yearConfidence * 0.1;
    if (c.publisherConfidence > 0) score += c.publisherConfidence * 0.1;

    return Math.min(1.0, Math.round(score * 100) / 100);
  }

  private static createEmptyResult(originalFilename: string): ParsedFilenameMetadata {
    return {
      originalFilename,
      cleanedFilename: originalFilename,
      titleConfidence: 0,
      authors: [],
      authorConfidence: 0,
      translators: [],
      translatorConfidence: 0,
      publisherConfidence: 0,
      yearConfidence: 0,
      editionConfidence: 0,
      isbnConfidence: 0,
      overallConfidence: 0,
    };
  }

  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
