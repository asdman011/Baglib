/**
 * Baglib — Search Duplicate Detector
 *
 * Detects whether an incoming online search result already exists in the local user's library.
 * Performs dual-layer matching:
 * 1. Strict ISBN match (normalized ISBN-10 & ISBN-13).
 * 2. Fuzzy Title & Author similarity using Arabic/Latin normalization and Levenshtein/token distance.
 */

import { UnifiedSearchResult } from '../../../shared/types/search';
import { BookItem } from '../../../shared/types/work';
import {
  normalizeSearchString,
  calculateStringSimilarity,
  calculateTokenOverlap,
} from '../../../shared/utils/text-normalizer';
import { isValidIsbn, isbn10ToIsbn13 } from '../../../shared/validators/metadata-validator';

export interface DuplicateMatchResult {
  inLibrary: boolean;
  localWorkId?: string;
  matchedEditionId?: string;
  matchReason?: 'isbn' | 'title_author';
  matchedBook?: BookItem;
}

export class DuplicateDetector {
  /**
   * Normalizes an ISBN string to pure digits/X for comparison.
   * If valid ISBN-10, converts to canonical ISBN-13 to ensure 10-vs-13 equivalence.
   */
  public static normalizeIsbn(isbn?: string | null): string {
    if (!isbn) return '';
    const clean = isbn.replace(/[-\s]/g, '').toUpperCase();
    if (clean.length === 10 && isValidIsbn(clean)) {
      const converted = isbn10ToIsbn13(clean);
      if (converted) return converted;
    }
    return clean;
  }

  /**
   * Checks whether candidate result matches any book in the provided local library collection.
   */
  public static findMatch(
    candidate: UnifiedSearchResult,
    localBooks: BookItem[]
  ): DuplicateMatchResult {
    if (!localBooks || localBooks.length === 0) {
      return { inLibrary: false };
    }

    // 1. ISBN matching (Highest confidence)
    const candidateIsbnNorm = this.normalizeIsbn(candidate.isbn || candidate.isbn13 || candidate.isbn10);
    if (candidateIsbnNorm) {
      for (const book of localBooks) {
        const bookIsbnNorm = this.normalizeIsbn(book.isbn);
        if (bookIsbnNorm && bookIsbnNorm === candidateIsbnNorm) {
          return {
            inLibrary: true,
            localWorkId: book.id,
            matchedEditionId: book.edition,
            matchReason: 'isbn',
            matchedBook: book,
          };
        }
      }
    }

    // 2. Fuzzy Title & Author Matching
    const stripParentheses = (s: string) => s.replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim();

    const candTitleNorm = normalizeSearchString(candidate.title || '');
    const candTitleClean = normalizeSearchString(stripParentheses(candidate.title || ''));

    if (!candTitleNorm || candTitleNorm.length < 3) {
      return { inLibrary: false };
    }

    const candAuthorNorm = normalizeSearchString(candidate.author || (candidate.authors ? candidate.authors.join(' ') : ''));

    for (const book of localBooks) {
      const bookTitleNorm = normalizeSearchString(book.title || '');
      const bookTitleClean = normalizeSearchString(stripParentheses(book.title || ''));
      if (!bookTitleNorm) continue;

      // Exact normalized title match (full or clean of parentheticals)
      const exactTitleMatch =
        candTitleNorm === bookTitleNorm ||
        (candTitleClean.length >= 3 && candTitleClean === bookTitleClean) ||
        (candTitleClean.length >= 4 && (candTitleClean === bookTitleNorm || candTitleNorm === bookTitleClean));

      // Prefix containment (e.g. "مقدمة ابن خلدون" matches "مقدمة ابن خلدون (طبعة محققة)")
      const prefixMatch =
        (bookTitleNorm.length >= 6 && candTitleNorm.startsWith(bookTitleNorm)) ||
        (candTitleNorm.length >= 6 && bookTitleNorm.startsWith(candTitleNorm)) ||
        (bookTitleClean.length >= 6 && candTitleClean.startsWith(bookTitleClean)) ||
        (candTitleClean.length >= 6 && bookTitleClean.startsWith(candTitleClean));

      // Similarity score
      const titleSim = Math.max(
        calculateStringSimilarity(candTitleNorm, bookTitleNorm),
        calculateStringSimilarity(candTitleClean, bookTitleClean)
      );
      const titleOverlap = Math.max(
        calculateTokenOverlap(candTitleNorm, bookTitleNorm),
        calculateTokenOverlap(candTitleClean, bookTitleClean)
      );

      const strongTitleMatch = exactTitleMatch || prefixMatch || titleSim >= 0.85 || titleOverlap >= 0.75;

      if (strongTitleMatch) {
        // If author is present on either, check author compatibility
        const bookAuthorNorm = normalizeSearchString(book.author || '');

        if (!candAuthorNorm || !bookAuthorNorm) {
          // If neither or only one has author, match if title similarity is very high
          if (titleSim >= 0.92 || exactTitleMatch) {
            return {
              inLibrary: true,
              localWorkId: book.id,
              matchedEditionId: book.edition,
              matchReason: 'title_author',
              matchedBook: book,
            };
          }
        } else {
          // Normalize Arabic patronymic variants (بن <-> ابن)
          const normAuthor = (a: string) => a.replace(/\bبن\b/g, 'ابن').trim();
          const cAuth = normAuthor(candAuthorNorm);
          const bAuth = normAuthor(bookAuthorNorm);

          const authorSim = calculateStringSimilarity(cAuth, bAuth);
          const authorOverlap = calculateTokenOverlap(cAuth, bAuth);
          const authorSubstring = cAuth.includes(bAuth) || bAuth.includes(cAuth);

          // Check if any distinctive author surname/family name (>= 4 chars) matches
          const cTokens = new Set(cAuth.split(' ').filter((w) => w.length >= 4));
          const bTokens = new Set(bAuth.split(' ').filter((w) => w.length >= 4));
          let sharedSurname = false;
          for (const t of cTokens) {
            if (bTokens.has(t)) {
              sharedSurname = true;
              break;
            }
          }

          if (authorSim >= 0.70 || authorOverlap >= 0.50 || authorSubstring || sharedSurname) {
            return {
              inLibrary: true,
              localWorkId: book.id,
              matchedEditionId: book.edition,
              matchReason: 'title_author',
              matchedBook: book,
            };
          }
        }
      }
    }

    return { inLibrary: false };
  }
}
