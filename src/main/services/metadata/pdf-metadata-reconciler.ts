/**
 * Baglib — Intelligent PDF Metadata Reconciliation & Garbage-Detection Engine
 *
 * Distinguishes authentic bibliographic metadata from prepress/typesetting artifacts
 * (DocInfo/XMP publisher job numbers, typesetter OS usernames, printer spool codes)
 * and reconciles them with structured metadata extracted from sanitized filenames.
 */

import { isPlaceholderAuthor, isPlaceholderTitle } from '../../../shared/validators/metadata-validator';
import { ParsedFilenameMetadata, FilenameParser } from './filename-parser';
import { EmbeddedBookMetadata } from './embedded-metadata.extractor';

export interface ExtractedCandidate {
  title?: string;
  author?: string;
  year?: number;
  publisher?: string;
  confidence: number; // 0 to 1
  source: 'embedded_pdf' | 'filename' | 'merged';
}

export interface DiscardedArtifact {
  field: 'title' | 'author' | 'publisher' | 'year';
  value: string;
  reason: string;
}

export interface ReconciledMetadataResult {
  title: string;
  authors: string[];
  publisher?: string;
  publicationYear?: number;
  edition?: string;
  pagesCount?: number;
  isbn?: string;
  language?: string;
  description?: string;
  confidence: number;
  source: 'embedded_pdf' | 'filename' | 'merged';
  discardedArtifacts: DiscardedArtifact[];
  candidates: {
    embedded?: ExtractedCandidate;
    filename?: ExtractedCandidate;
    resolved: ExtractedCandidate;
  };
}

// Common publisher prepress job code prefixes
const PRODUCTION_JOB_CODE_REGEX =
  /^(?:mcgrawh|mcgraw[-_]?hill|wiley|springer|elsevier|pearson|tandf|taylor[-_]?francis|oxford|cup|oup|cambridge|job|prn|print|layout|doc|scan|book|proof|galley|typeset|ts)[-_ ]*\d+.*$/i;

// Common generic document, scanner, or DTP placeholder titles
const GENERIC_DOC_TITLES_REGEX =
  /^(?:untitled|document\d*|export\d*|scan\d*|pdf\s*document|microsoft\s*word|adobe\s*indesign|cover|fm|bm|prelims|frontmatter|backmatter|chapter\s*\d+|ch\d+|page\s*\d+|p\d+|unknown|untitled\s*document)$/i;

// File extensions appearing as titles
const EMBEDDED_FILE_EXT_REGEX = /^.*\.(?:pdf|indd|qxd|doc|docx|pmd|psd|eps|tif|tiff)$/i;

// Common single-token lowercase system handles / OS usernames frequently mistaken for author
const OS_SYSTEM_USERNAMES = new Set([
  'admin',
  'administrator',
  'user',
  'desktop',
  'laptop',
  'scanner',
  'root',
  'guest',
  'pc',
  'author',
  'writer',
  'staff',
  'editor',
  'typesetter',
  'operator',
  'student',
  'owner',
  'home',
  'workstation',
  'macbook',
  'windows',
  'jharding',
  'csmith',
  'asmith',
  'tbaker',
  'jdoe',
  'nobody',
  'default',
  'temp',
  'test',
]);

// Common desktop publishing, word processing, and scanner software
const SOFTWARE_NAMES_REGEX =
  /^(?:adobe\s+(?:indesign|acrobat|distiller|illustrator|photoshop|pdf\s+library)|acrobat\s+distiller|indesign|scansnap|fujitsu|abbyy\s+finereader|abbyy|canon|epson|hp\s+(?:scan|laserjet|deskjet)|pdfcreator|pdf24|latex\s+with\s+hyperref|canva|calibre|nitro\s+pro|foxit|quarkxpress|coreldraw|camscanner|distiller|microsoft\s+(?:word|office)|word)$/i;

// Stop words ignored during Jaccard token overlap calculation
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'about',
  'into',
  'through',
  'libgen',
  'pdf',
  'epub',
  'zlib',
  'book',
  'edition',
  'vol',
  'volume',
  'part',
]);

/**
 * Calculates Jaccard token overlap between two strings (0.0 to 1.0).
 */
export function calculateTokenOverlap(textA: string, textB: string): number {
  if (!textA || !textB) return 0;

  const extractTokens = (t: string): Set<string> => {
    return new Set(
      t
        .toLowerCase()
        .replace(/[^\p{L}\d\s]/gu, ' ')
        .split(/\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 3 && !STOP_WORDS.has(s))
    );
  };

  const setA = extractTokens(textA);
  const setB = extractTokens(textB);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersectionCount = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionCount++;
    }
  }

  const unionCount = new Set([...setA, ...setB]).size;
  return unionCount > 0 ? intersectionCount / unionCount : 0;
}

/**
 * Detects whether an embedded DocInfo/XMP Title is garbage or a prepress artifact.
 */
export function isGarbageTitle(title?: string | null, filenameHint?: string | null): boolean {
  if (!title) return true;
  const t = title.trim();
  if (t.length < 3) return true;

  // 1. Placeholder check
  if (isPlaceholderTitle(t)) return true;

  // 2. Purely numeric
  if (/^\d+$/.test(t)) return true;

  // 3. Hexadecimal hash / UUID
  if (/^[a-f0-9]{16,64}$/i.test(t)) return true;
  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(t)) return true;

  // 4. Prepress publisher job code (e.g. "mcgrawh 19768", "wiley_9872", "springer_12345")
  if (PRODUCTION_JOB_CODE_REGEX.test(t)) return true;

  // 5. Generic document strings
  if (GENERIC_DOC_TITLES_REGEX.test(t)) return true;

  // 6. Software generator
  if (SOFTWARE_NAMES_REGEX.test(t)) return true;

  // 7. Embedded file extension in title (e.g. "manual.pdf", "chapter1.indd")
  if (EMBEDDED_FILE_EXT_REGEX.test(t)) return true;

  // 8. Token Discrepancy & Jaccard Overlap against descriptive filename
  if (filenameHint) {
    const rawTokens = filenameHint
      .replace(/\.[^.]+$/, '')
      .replace(/[^\p{L}\d\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w.toLowerCase()));

    // If filename has >= 4 descriptive words and title has 0% token overlap
    if (rawTokens.length >= 4) {
      const overlap = calculateTokenOverlap(t, filenameHint);
      if (overlap === 0) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detects whether an embedded DocInfo/XMP Author is garbage, software name, or OS username.
 */
export function isGarbageAuthor(author?: string | null, filenameHint?: string | null): boolean {
  if (!author) return true;
  const a = author.trim();
  if (a.length < 2) return true;

  // 1. Validator placeholder check
  if (isPlaceholderAuthor(a)) return true;

  // 2. Purely numeric or hex hash
  if (/^\d+$/.test(a)) return true;
  if (/^[a-f0-9]{16,64}$/i.test(a)) return true;

  // 3. Known system accounts
  const lower = a.toLowerCase();
  if (OS_SYSTEM_USERNAMES.has(lower)) return true;

  // 4. Software generator / DTP application
  if (SOFTWARE_NAMES_REGEX.test(a)) return true;

  // 5. Single-token lowercase OS usernames (e.g. "jharding", "asmith", "typesetter1")
  // Real human author names in published literature are capitalized or contain multiple words
  if (/^[a-z][a-z0-9_-]{2,15}$/.test(a) && !/[\u0600-\u06FF]/.test(a)) {
    return true;
  }

  // 6. Token Discrepancy against filename hint
  if (filenameHint) {
    const fnLower = filenameHint.toLowerCase();
    // If filename explicitly contains author information that does not match this single-token handle
    if (!fnLower.includes(lower) && /^[a-z0-9_-]+$/i.test(a) && !a.includes(' ')) {
      return true;
    }
  }

  return false;
}

/**
 * Universal bogus / typesetting artifact detector.
 */
export function isGarbageMetadata(
  field: 'title' | 'author' | 'publisher',
  value?: string | null,
  filenameHint?: string | null
): boolean {
  if (!value) return true;
  if (field === 'title') return isGarbageTitle(value, filenameHint);
  if (field === 'author') return isGarbageAuthor(value, filenameHint);
  if (field === 'publisher') {
    const v = value.trim();
    if (v.length < 2) return true;
    if (isPlaceholderTitle(v)) return true;
    if (/^\d+$/.test(v) || /^[a-f0-9]{16,64}$/i.test(v)) return true;
    if (SOFTWARE_NAMES_REGEX.test(v)) return true;
    return false;
  }
  return false;
}

export class PdfMetadataReconciler {
  /**
   * Reconciles embedded PDF DocInfo/XMP metadata with metadata extracted from the filename,
   * detecting garbage/prepress codes and choosing the highest-confidence candidate fields.
   */
  static reconcile(params: {
    embeddedMeta: EmbeddedBookMetadata | null;
    parsedFilename: ParsedFilenameMetadata | null;
    rawFilename: string;
  }): ReconciledMetadataResult {
    const { embeddedMeta, parsedFilename, rawFilename } = params;
    const discardedArtifacts: DiscardedArtifact[] = [];

    // Track discarded download / repository domain tags from filename
    const domainMatch = rawFilename.match(
      /(?:[-_–—\s]+|\s*[\(\[])\s*(libgen\.(?:li|rs|is|lc|org)|z-lib\.(?:org|is|li|sk)|vdoc\.pub|1lib\.(?:domains|sk)|annas-archive\.(?:org|li|se|gl)|oceanofpdf\.(?:com)?|b-ok\.(?:org|cc|xyz))\s*[\)\]]?(?=\.[^.]+$|$)/i
    );
    if (domainMatch) {
      discardedArtifacts.push({
        field: 'publisher',
        value: domainMatch[0].trim(),
        reason: 'Repository / download domain tag removed from filename',
      });
    }

    // ------------------------------------------------------------------------
    // 1. Evaluate Title Candidates
    // ------------------------------------------------------------------------
    let embeddedTitleCandidate: string | undefined;
    let embeddedTitleConfidence = 0;

    if (embeddedMeta?.title) {
      const rawTitle = embeddedMeta.title.trim();
      if (isGarbageTitle(rawTitle, rawFilename)) {
        discardedArtifacts.push({
          field: 'title',
          value: rawTitle,
          reason: 'Typesetting / prepress artifact or publisher job code with 0% filename overlap',
        });
      } else {
        embeddedTitleCandidate = rawTitle;
        embeddedTitleConfidence = 0.85;
      }
    }

    const filenameTitleCandidate = parsedFilename?.title?.trim();
    const filenameTitleConfidence = parsedFilename?.titleConfidence || 0;

    let resolvedTitle = '';
    let titleSource: 'embedded_pdf' | 'filename' | 'merged' = 'filename';

    if (embeddedTitleCandidate) {
      const overlap = filenameTitleCandidate ? calculateTokenOverlap(embeddedTitleCandidate, filenameTitleCandidate) : 0;
      const containsSub = filenameTitleCandidate && embeddedTitleCandidate.toLowerCase().includes(filenameTitleCandidate.toLowerCase());

      if (
        embeddedTitleConfidence > filenameTitleConfidence ||
        (embeddedTitleConfidence >= 0.8 && (overlap > 0 || containsSub))
      ) {
        resolvedTitle = embeddedTitleCandidate;
        titleSource = 'embedded_pdf';
      } else if (filenameTitleCandidate) {
        resolvedTitle = filenameTitleCandidate;
        titleSource = 'filename';
      } else {
        resolvedTitle = embeddedTitleCandidate;
        titleSource = 'embedded_pdf';
      }
    } else if (filenameTitleCandidate) {
      resolvedTitle = filenameTitleCandidate;
      titleSource = 'filename';
    } else {
      resolvedTitle = parsedFilename?.cleanedFilename || rawFilename.replace(/\.[^.]+$/, '');
      titleSource = 'filename';
    }

    // ------------------------------------------------------------------------
    // 2. Evaluate Author Candidates
    // ------------------------------------------------------------------------
    const validEmbeddedAuthors: string[] = [];
    if (embeddedMeta?.authors && embeddedMeta.authors.length > 0) {
      for (const auth of embeddedMeta.authors) {
        if (isGarbageAuthor(auth, rawFilename)) {
          discardedArtifacts.push({
            field: 'author',
            value: auth,
            reason: 'Typesetter OS username or DTP application handle',
          });
        } else {
          validEmbeddedAuthors.push(auth);
        }
      }
    }

    const validFilenameAuthors: string[] = (parsedFilename?.authors || []).filter(
      (a) => !isGarbageAuthor(a, rawFilename)
    );

    let resolvedAuthors: string[] = [];
    let authorSource: 'embedded_pdf' | 'filename' | 'merged' = 'filename';

    const filenameAuthorConf = parsedFilename?.authorConfidence || 0;

    if (validEmbeddedAuthors.length > 0) {
      resolvedAuthors = validEmbeddedAuthors;
      authorSource = 'embedded_pdf';
    } else if (validFilenameAuthors.length > 0) {
      resolvedAuthors = validFilenameAuthors;
      authorSource = 'filename';
    } else {
      const isArabic =
        /[\u0600-\u06FF]/.test(resolvedTitle) || parsedFilename?.language === 'ar';
      resolvedAuthors = [isArabic ? 'غير معروف' : 'Unknown Author'];
    }

    // ------------------------------------------------------------------------
    // 3. Evaluate Publisher & Year Candidates
    // ------------------------------------------------------------------------
    let resolvedPublisher = embeddedMeta?.publisher || parsedFilename?.publisher;
    let resolvedYear = embeddedMeta?.publicationYear || parsedFilename?.publicationYear;

    // If filename has high-confidence parenthetical publisher and embedded is missing or identical
    if (parsedFilename?.publisher && (parsedFilename.publisherConfidence || 0) >= 0.8) {
      resolvedPublisher = parsedFilename.publisher;
    }

    if (parsedFilename?.publicationYear && (parsedFilename.yearConfidence || 0) >= 0.8) {
      resolvedYear = parsedFilename.publicationYear;
    }

    // ------------------------------------------------------------------------
    // 4. Determine Overall Source and Confidence
    // ------------------------------------------------------------------------
    let overallSource: 'embedded_pdf' | 'filename' | 'merged' = 'merged';
    if (titleSource === 'filename' && authorSource === 'filename') {
      overallSource = 'filename';
    } else if (titleSource === 'embedded_pdf' && authorSource === 'embedded_pdf') {
      overallSource = 'embedded_pdf';
    } else {
      overallSource = 'merged';
    }

    const titleConfidence = titleSource === 'filename' ? filenameTitleConfidence : embeddedTitleConfidence;
    const authorConfidence = authorSource === 'filename' ? filenameAuthorConf : 0.85;
    const overallConfidence = Math.min(1.0, Math.max(0.5, (titleConfidence + authorConfidence) / 2));

    const embeddedCandidate: ExtractedCandidate | undefined = embeddedMeta
      ? {
          title: embeddedTitleCandidate,
          author: validEmbeddedAuthors.join(', ') || undefined,
          year: embeddedMeta.publicationYear,
          publisher: embeddedMeta.publisher,
          confidence: embeddedTitleCandidate && validEmbeddedAuthors.length > 0 ? 0.85 : 0.4,
          source: 'embedded_pdf',
        }
      : undefined;

    const filenameCandidate: ExtractedCandidate | undefined = parsedFilename
      ? {
          title: parsedFilename.title,
          author: parsedFilename.authors.join(', ') || undefined,
          year: parsedFilename.publicationYear,
          publisher: parsedFilename.publisher,
          confidence: parsedFilename.overallConfidence || 0.85,
          source: 'filename',
        }
      : undefined;

    const resolvedCandidate: ExtractedCandidate = {
      title: resolvedTitle,
      author: resolvedAuthors.join(', '),
      year: resolvedYear,
      publisher: resolvedPublisher,
      confidence: overallConfidence,
      source: overallSource,
    };

    return {
      title: resolvedTitle,
      authors: resolvedAuthors,
      publisher: resolvedPublisher,
      publicationYear: resolvedYear,
      edition: embeddedMeta?.edition || parsedFilename?.edition,
      pagesCount: embeddedMeta?.pagesCount,
      isbn: embeddedMeta?.isbn || parsedFilename?.isbn,
      language: embeddedMeta?.language || (parsedFilename?.language === 'ar' ? 'العربية' : undefined),
      description: embeddedMeta?.description,
      confidence: overallConfidence,
      source: overallSource,
      discardedArtifacts,
      candidates: {
        embedded: embeddedCandidate,
        filename: filenameCandidate,
        resolved: resolvedCandidate,
      },
    };
  }
}
