/**
 * Baglib — Bibliographic Candidate Matcher & Evidence-Based Ranking Engine
 *
 * Evaluates candidate BibliographicWorks returned by providers against available evidence.
 *
 * Scoring weights:
 * - Exact validated ISBN match: +60 points (high certainty)
 * - Title similarity (normalized Arabic/English): up to +30 points
 * - Author agreement: up to +20 points
 * - Publisher agreement: up to +10 points
 * - Publication year agreement: up to +10 points
 * - Language match: up to +5 points
 * - Edition details agreement: up to +5 points
 *
 * Preserves Work -> Edition distinction:
 * Discriminates between different editions (paperback, hardcover, translation, year)
 * instead of collapsing them into a single record.
 */

import { BibliographicWork, BibliographicEdition } from '../../../shared/types/bibliographic';
import {
  calculateStringSimilarity,
  calculateTokenOverlap,
  normalizeSearchString,
} from '../../../shared/utils/text-normalizer';
import { isValidIsbn, isValidIsbn10, isValidIsbn13 } from '../../../shared/validators/metadata-validator';

export interface TargetBookEvidence {
  title?: string;
  authors?: string[];
  publisher?: string;
  publicationYear?: number;
  edition?: string;
  isbn?: string;
  isbn10?: string;
  isbn13?: string;
  language?: string;
}

export interface CandidateEvaluation {
  candidate: BibliographicWork;
  score: number; // 0 to 100
  confidence: number; // 0.0 to 1.0
  isCertainMatch: boolean; // >= 0.70
  isSuggestion: boolean; // 0.40 <= score < 0.70
  breakdown: {
    isbnMatch: boolean;
    titleScore: number;
    authorScore: number;
    publisherScore: number;
    yearScore: number;
    languageScore: number;
    editionScore: number;
  };
  matchedEdition?: BibliographicEdition;
  discoveredIsbn?: string;
}

export class CandidateMatcher {
  /**
   * Ranks an array of candidate works against target evidence in descending order of confidence.
   */
  static rankCandidates(
    target: TargetBookEvidence,
    candidates: BibliographicWork[]
  ): CandidateEvaluation[] {
    if (!candidates || candidates.length === 0) return [];

    const evaluations = candidates.map((cand) => this.evaluateCandidate(target, cand));
    // Sort descending by score
    return evaluations.sort((a, b) => b.score - a.score);
  }

  /**
   * Evaluates a single candidate work against target evidence.
   */
  static evaluateCandidate(
    target: TargetBookEvidence,
    candidate: BibliographicWork
  ): CandidateEvaluation {
    const cleanTargetIsbn = target.isbn
      ? target.isbn.replace(/[-\s]/g, '').toUpperCase()
      : undefined;

    let isbnMatched = false;
    let matchedEdition: BibliographicEdition | undefined;

    // 1. Check ISBN Match across all editions of candidate
    if (cleanTargetIsbn && candidate.editions && candidate.editions.length > 0) {
      for (const ed of candidate.editions) {
        const edIsbn = (ed.isbn || ed.isbn13 || ed.isbn10 || '')
          .replace(/[-\s]/g, '')
          .toUpperCase();
        if (edIsbn && (edIsbn === cleanTargetIsbn || edIsbn.includes(cleanTargetIsbn))) {
          isbnMatched = true;
          matchedEdition = ed;
          break;
        }
      }
    }

    // 2. Score Title Similarity (up to 30 points)
    let titleScore = 0;
    if (target.title && candidate.title) {
      const levenshteinSim = calculateStringSimilarity(target.title, candidate.title);
      const tokenSim = calculateTokenOverlap(target.title, candidate.title);

      const targetNorm = normalizeSearchString(target.title);
      const candNorm = normalizeSearchString(candidate.title);

      // Check if target title matches base title before colon/dash e.g. "Clean Code: A Handbook..." -> "Clean Code"
      const candBaseTitle = normalizeSearchString(candidate.title.split(/[:–—\-]/)[0]);
      const baseTitleSim = calculateStringSimilarity(targetNorm, candBaseTitle);

      const targetTokens = targetNorm.split(' ').filter(Boolean);
      const candTokens = new Set(candNorm.split(' ').filter(Boolean));
      const isSubset = targetTokens.length > 0 && targetTokens.every((t) => candTokens.has(t));

      const combinedSim = Math.max(levenshteinSim, tokenSim, baseTitleSim);

      if (combinedSim >= 0.9 || candNorm.startsWith(targetNorm) || (isSubset && targetTokens.length >= 2)) {
        titleScore = 30;
      } else if (combinedSim >= 0.8) {
        titleScore = 25;
      } else if (combinedSim >= 0.6) {
        titleScore = 18;
      } else if (combinedSim >= 0.4) {
        titleScore = 10;
      } else {
        titleScore = Math.round(combinedSim * 15);
      }
    }

    // 3. Score Author Agreement (up to 20 points)
    let authorScore = 0;
    if (target.authors && target.authors.length > 0 && candidate.authors && candidate.authors.length > 0) {
      const targetAuthorsNorm = target.authors.map(normalizeSearchString).filter(Boolean);
      const candidateAuthorsNorm = candidate.authors.map(normalizeSearchString).filter(Boolean);

      let maxAuthorSim = 0;
      for (const tAuthor of targetAuthorsNorm) {
        for (const cAuthor of candidateAuthorsNorm) {
          const sim = Math.max(
            calculateStringSimilarity(tAuthor, cAuthor),
            calculateTokenOverlap(tAuthor, cAuthor)
          );
          if (sim > maxAuthorSim) maxAuthorSim = sim;
        }
      }

      if (maxAuthorSim >= 0.9) authorScore = 20;
      else if (maxAuthorSim >= 0.7) authorScore = 15;
      else if (maxAuthorSim >= 0.5) authorScore = 10;
      else authorScore = Math.round(maxAuthorSim * 10);
    }

    // 4. Score Publisher Agreement (up to 10 points)
    let publisherScore = 0;
    if (target.publisher && candidate.editions && candidate.editions.length > 0) {
      const targetPubNorm = normalizeSearchString(target.publisher);
      for (const ed of candidate.editions) {
        if (ed.publisher) {
          const edPubNorm = normalizeSearchString(ed.publisher);
          const sim = Math.max(
            calculateStringSimilarity(targetPubNorm, edPubNorm),
            calculateTokenOverlap(targetPubNorm, edPubNorm)
          );
          if (sim >= 0.7) {
            publisherScore = 10;
            if (!matchedEdition) matchedEdition = ed;
            break;
          }
        }
      }
    }

    // 5. Score Year Agreement (up to 10 points)
    let yearScore = 0;
    if (target.publicationYear) {
      const candidateYear = candidate.firstPublishYear;
      if (candidateYear) {
        const diff = Math.abs(target.publicationYear - candidateYear);
        if (diff === 0) yearScore = 10;
        else if (diff <= 2) yearScore = 7;
        else if (diff <= 5) yearScore = 4;
      }
    }

    // 6. Language & Edition Bonus (up to 5 points each)
    let languageScore = 0;
    if (target.language && candidate.editions) {
      for (const ed of candidate.editions) {
        if (ed.language && normalizeSearchString(ed.language).includes(normalizeSearchString(target.language))) {
          languageScore = 5;
          break;
        }
      }
    }

    let editionScore = 0;
    if (target.edition && candidate.editions) {
      for (const ed of candidate.editions) {
        if (ed.title && normalizeSearchString(ed.title).includes(normalizeSearchString(target.edition))) {
          editionScore = 5;
          break;
        }
      }
    }

    // Base ISBN score is 60 points if exact match
    const isbnScore = isbnMatched ? 60 : 0;

    const totalScore = Math.min(
      100,
      isbnScore + titleScore + authorScore + publisherScore + yearScore + languageScore + editionScore
    );
    const confidence = Math.round((totalScore / 100) * 100) / 100;

    // Pick best matched edition if not already chosen
    if (!matchedEdition && candidate.editions && candidate.editions.length > 0) {
      matchedEdition = candidate.editions[0];
    }

    // Discover ISBN if input had no ISBN but candidate edition has a valid one
    let discoveredIsbn: string | undefined;
    if (!cleanTargetIsbn && matchedEdition) {
      const candidateIsbns = [
        matchedEdition.isbn13,
        matchedEdition.isbn,
        matchedEdition.isbn10,
      ].filter(Boolean) as string[];

      for (const candIsbn of candidateIsbns) {
        const clean = candIsbn.replace(/[-\s]/g, '').toUpperCase();
        if ((clean.length === 13 && isValidIsbn13(clean)) || (clean.length === 10 && isValidIsbn10(clean))) {
          discoveredIsbn = clean;
          break;
        }
      }
    }

    const isCertainMatch =
      totalScore >= 70 ||
      (titleScore >= 25 && authorScore >= 15) ||
      (titleScore >= 25 && !cleanTargetIsbn && (!target.authors || target.authors.length === 0));
    const isSuggestion = !isCertainMatch && totalScore >= 25;

    return {
      candidate,
      score: totalScore,
      confidence,
      isCertainMatch,
      isSuggestion,
      breakdown: {
        isbnMatch: isbnMatched,
        titleScore,
        authorScore,
        publisherScore,
        yearScore,
        languageScore,
        editionScore,
      },
      matchedEdition,
      discoveredIsbn,
    };
  }
}
