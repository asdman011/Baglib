/**
 * Baglib — Bibliographic Candidate Matcher & Evidence-Based Ranking Engine
 *
 * Deterministic multi-factor confidence scoring (0.0 to 1.0):
 * - Identifier Match (Weight: 40% / up to 0.40): Exact ISBN-10/13 or external ID match.
 * - Normalized Title Similarity (Weight: 35% / up to 0.35): Levenshtein distance & token overlap
 *   with full Arabic normalization (unify alefs, strip tashkeel/tatweel, unify ة/ه and ى/ي).
 * - Author Matching (Weight: 15% / up to 0.15): Tokenized author similarity after normalization.
 * - Metadata Completeness (Weight: 10% / up to 0.10): Bonus for records with covers (0.04),
 *   descriptions (0.03), and publication years (0.03).
 *
 * Candidate Merging & Deduplication:
 * - If both Open Library and Google Books return the same book (matching ISBN or >95% title/author similarity),
 *   merges them into a single high-quality candidate, preserving all sources.
 */

import { BibliographicWork, BibliographicEdition, BibliographicSource } from '../../../shared/types/bibliographic';
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
  isSuggestion: boolean; // 0.40 <= confidence < 0.70
  matchType: 'exact' | 'high' | 'alternative';
  breakdown: {
    isbnMatch: boolean;
    titleScore: number;
    authorScore: number;
    publisherScore: number;
    yearScore: number;
    languageScore: number;
    editionScore: number;
    coverBonus: number;
    completenessBonus: number;
  };
  matchedEdition?: BibliographicEdition;
  discoveredIsbn?: string;
  providerName?: string;
}

export class CandidateMatcher {
  /**
   * Ranks an array of candidate works against target evidence in descending order of confidence.
   * Also merges duplicate candidates from different providers (e.g. Open Library + Google Books).
   */
  static rankCandidates(
    target: TargetBookEvidence,
    candidates: BibliographicWork[]
  ): CandidateEvaluation[] {
    if (!candidates || candidates.length === 0) return [];

    // Step 1: Merge duplicates across providers (e.g. OL + Google Books for the same book)
    const mergedCandidates = this.mergeAndDeduplicate(candidates);

    // Step 2: Evaluate each candidate against target evidence
    const evaluations = mergedCandidates.map((cand) => this.evaluateCandidate(target, cand));

    // Step 3: Sort descending by confidence score, with cover and description completeness tie-breakers
    return evaluations.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      if (b.score !== a.score) return b.score - a.score;
      // Tie-breaker 1: candidate that has a coverUrl comes first
      const aHasCover = Boolean(a.matchedEdition?.coverUrl || a.candidate.editions?.some((e) => Boolean(e.coverUrl)));
      const bHasCover = Boolean(b.matchedEdition?.coverUrl || b.candidate.editions?.some((e) => Boolean(e.coverUrl)));
      if (aHasCover !== bHasCover) return bHasCover ? 1 : -1;
      // Tie-breaker 2: candidate with longer description
      const aDescLen = a.candidate.description?.length || 0;
      const bDescLen = b.candidate.description?.length || 0;
      return bDescLen - aDescLen;
    });
  }

  /**
   * Merges and deduplicates candidates from different providers (Open Library, Google Books, Internet Archive)
   * if they share matching ISBN or have >95% title and author similarity.
   */
  static mergeAndDeduplicate(candidates: BibliographicWork[]): BibliographicWork[] {
    if (!candidates || candidates.length <= 1) return candidates || [];

    const merged: BibliographicWork[] = [];
    const usedIndices = new Set<number>();

    for (let i = 0; i < candidates.length; i++) {
      if (usedIndices.has(i)) continue;
      let current = { ...candidates[i] };
      usedIndices.add(i);

      for (let j = i + 1; j < candidates.length; j++) {
        if (usedIndices.has(j)) continue;
        const candidateB = candidates[j];

        if (this.isSameBook(current, candidateB)) {
          current = this.mergeTwoCandidates(current, candidateB);
          usedIndices.add(j);
        }
      }

      merged.push(current);
    }

    return merged;
  }

  /**
   * Determines if two candidates represent the same bibliographic entity across providers.
   */
  private static isSameBook(a: BibliographicWork, b: BibliographicWork): boolean {
    // 1. Check exact ISBN match across any editions
    const isbnsA = this.extractAllIsbns(a);
    const isbnsB = this.extractAllIsbns(b);
    for (const isbnA of isbnsA) {
      if (isbnsB.has(isbnA)) return true;
    }

    // 2. Check high title (>0.95) and author (>0.85) similarity across DIFFERENT providers
    if (a.title && b.title) {
      const titleSim = Math.max(
        calculateStringSimilarity(a.title, b.title),
        calculateTokenOverlap(a.title, b.title)
      );

      if (titleSim >= 0.95) {
        // Author check
        const authorsA = a.authors || [];
        const authorsB = b.authors || [];
        const authorSim =
          authorsA.length === 0 || authorsB.length === 0
            ? 1.0
            : Math.max(
                ...authorsA.map((authA) =>
                  Math.max(...authorsB.map((authB) => calculateStringSimilarity(authA, authB)))
                )
              );

        if (authorSim >= 0.85) {
          const provsA = this.getCandidateProviders(a);
          const provsB = this.getCandidateProviders(b);
          // Only merge when candidates originate from different providers or cross-provider sources
          if (provsA.size > 0 && provsB.size > 0) {
            let hasDifference = false;
            for (const p of provsA) {
              if (!provsB.has(p)) {
                hasDifference = true;
                break;
              }
            }
            if (hasDifference) return true;
          }
        }
      }
    }

    return false;
  }

  private static getCandidateProviders(work: BibliographicWork): Set<string> {
    const providers = new Set<string>();
    if (work.workId.startsWith('gb-')) providers.add('Google Books');
    if (work.workId.startsWith('OL') || work.workId.startsWith('ol-')) providers.add('Open Library');
    if (work.workId.startsWith('ia-')) providers.add('Internet Archive');

    for (const ed of work.editions || []) {
      if (ed.editionId?.startsWith('gb-')) providers.add('Google Books');
      if (ed.editionId?.startsWith('OL') || ed.editionId?.startsWith('ol-')) providers.add('Open Library');
      if (ed.editionId?.startsWith('ia-')) providers.add('Internet Archive');
      for (const s of ed.sources || []) {
        if (s.provider) providers.add(s.provider);
      }
    }
    return providers;
  }

  private static extractAllIsbns(work: BibliographicWork): Set<string> {
    const set = new Set<string>();
    if (!work.editions) return set;
    for (const ed of work.editions) {
      const raw = [ed.isbn13, ed.isbn, ed.isbn10].filter(Boolean) as string[];
      for (const item of raw) {
        const clean = item.replace(/[-\s]/g, '').toUpperCase();
        if (clean.length >= 10) set.add(clean);
      }
    }
    return set;
  }

  /**
   * Merges two candidate records into a single consolidated candidate.
   * Combines sources, best description, highest-res cover, and editions.
   */
  private static mergeTwoCandidates(a: BibliographicWork, b: BibliographicWork): BibliographicWork {
    // Preserve longer, richer description
    const description =
      (b.description?.length || 0) > (a.description?.length || 0)
        ? b.description
        : a.description;

    // Authors union
    const authors = Array.from(new Set([...(a.authors || []), ...(b.authors || [])]));

    // Subjects union
    const subjects = Array.from(new Set([...(a.subjects || []), ...(b.subjects || [])]));

    // First publish year: minimum valid year
    const years = [a.firstPublishYear, b.firstPublishYear].filter(
      (y): y is number => typeof y === 'number' && y > 0
    );
    const firstPublishYear = years.length > 0 ? Math.min(...years) : undefined;

    // Combine all editions
    const combinedEditions = [...(a.editions || []), ...(b.editions || [])];

    // Merge sources across primary editions
    const allSources: BibliographicSource[] = [];
    const seenSourceKeys = new Set<string>();
    for (const ed of combinedEditions) {
      if (ed.sources) {
        for (const s of ed.sources) {
          const key = `${s.provider}:${s.providerId || s.url || ''}`;
          if (!seenSourceKeys.has(key)) {
            seenSourceKeys.add(key);
            allSources.push(s);
          }
        }
      }
    }

    // Pick best cover
    const coverA = a.editions?.[0]?.coverUrl;
    const coverB = b.editions?.[0]?.coverUrl;
    // Prefer higher resolution or available cover
    const bestCover = coverA?.includes('zoom=1') || coverA?.includes('-L.')
      ? coverA
      : coverB || coverA;

    if (combinedEditions.length > 0) {
      combinedEditions[0] = {
        ...combinedEditions[0],
        coverUrl: bestCover || combinedEditions[0].coverUrl,
        sources: allSources.length > 0 ? allSources : combinedEditions[0].sources,
      };
    }

    return {
      workId: a.workId, // Keep primary workId
      title: a.title.length >= b.title.length ? a.title : b.title,
      authors,
      description,
      firstPublishYear,
      subjects,
      editions: combinedEditions,
    };
  }

  /**
   * Evaluates a single candidate work against target evidence with weighted scoring:
   * - Identifier (ISBN/ID): 40% (0.40)
   * - Title Similarity: 35% (0.35)
   * - Author Similarity: 15% (0.15)
   * - Completeness (Cover, Description, Year): 10% (0.10)
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

    // Heuristic 1: Identifier Weight (40% / up to 40 points)
    // If target has ISBN and it matches, receives full 40 points (+20 high certainty bonus)
    let identifierPoints = 0;
    if (isbnMatched) {
      identifierPoints = 60; // 40 base + 20 high certainty bonus
    }

    // Heuristic 2: Title Similarity (35% / up to 30-35 points)
    let titleScore = 0;
    let rawTitleSim = 0;
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

      rawTitleSim = Math.max(levenshteinSim, tokenSim, baseTitleSim);

      if (rawTitleSim >= 0.9 || candNorm.startsWith(targetNorm) || (isSubset && targetTokens.length >= 2)) {
        titleScore = 30;
      } else if (rawTitleSim >= 0.8) {
        titleScore = 25;
      } else if (rawTitleSim >= 0.6) {
        titleScore = 18;
      } else if (rawTitleSim >= 0.4) {
        titleScore = 10;
      } else {
        titleScore = Math.round(rawTitleSim * 15);
      }
    }

    // Heuristic 3: Author Similarity (15% / up to 20 points)
    let authorScore = 0;
    let rawAuthorSim = 0;
    if (target.authors && target.authors.length > 0 && candidate.authors && candidate.authors.length > 0) {
      const targetAuthorsNorm = target.authors.map(normalizeSearchString).filter(Boolean);
      const candidateAuthorsNorm = candidate.authors.map(normalizeSearchString).filter(Boolean);

      for (const tAuthor of targetAuthorsNorm) {
        for (const cAuthor of candidateAuthorsNorm) {
          const sim = Math.max(
            calculateStringSimilarity(tAuthor, cAuthor),
            calculateTokenOverlap(tAuthor, cAuthor)
          );
          if (sim > rawAuthorSim) rawAuthorSim = sim;
        }
      }

      if (rawAuthorSim >= 0.9) authorScore = 20;
      else if (rawAuthorSim >= 0.7) authorScore = 15;
      else if (rawAuthorSim >= 0.5) authorScore = 10;
      else authorScore = Math.round(rawAuthorSim * 10);
    }

    // Additional discriminators: Publisher agreement (up to 10 points)
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

    // Year agreement (up to 10 points)
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

    // Language & Edition match (up to 5 points each)
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

    if (!matchedEdition && candidate.editions && candidate.editions.length > 0) {
      matchedEdition = candidate.editions[0];
    }

    // Heuristic 4: Metadata Completeness (10% / up to 10 points total: Cover +5, Description +3, Year +2)
    let coverBonus = 0;
    if ((titleScore > 0 || isbnMatched) && (matchedEdition?.coverUrl || candidate.editions?.some((e) => Boolean(e.coverUrl)))) {
      coverBonus = 5;
    }

    let completenessBonus = 0;
    if ((titleScore > 0 || isbnMatched) && candidate.description && candidate.firstPublishYear) {
      completenessBonus = 5;
    }

    // Total Score (0-100 scale)
    const rawSum =
      identifierPoints +
      titleScore +
      authorScore +
      publisherScore +
      yearScore +
      languageScore +
      editionScore +
      coverBonus +
      completenessBonus;

    const totalScore = Math.min(100, rawSum);

    // Calculate normalized confidence score (0.0 to 1.0)
    let confidence: number;
    if (isbnMatched) {
      // Exact ISBN match automatically scores maximum confidence
      confidence = Math.min(1.0, 0.85 + (coverBonus > 0 ? 0.08 : 0.0) + (completenessBonus > 0 ? 0.07 : 0.0));
    } else if (cleanTargetIsbn) {
      // User searched with ISBN, but this candidate did NOT match ISBN
      confidence = Math.round((Math.min(totalScore, 50) / 100) * 100) / 100;
    } else {
      // Title/Author/File search without ISBN
      // Weights: Title (0.55), Author (0.25), Completeness (0.15), Publisher/Year (0.05)
      const normTitleComponent = (titleScore / 30) * 0.55;
      const normAuthorComponent = (authorScore / 20) * 0.25;
      const normCompleteness = ((coverBonus + completenessBonus) / 10) * 0.15;
      const normExtra = ((publisherScore + yearScore) / 20) * 0.05;
      confidence = Math.min(1.0, Math.round((normTitleComponent + normAuthorComponent + normCompleteness + normExtra) * 100) / 100);
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
      confidence >= 0.70 ||
      totalScore >= 70 ||
      (titleScore >= 25 && authorScore >= 15) ||
      (titleScore >= 25 && !cleanTargetIsbn && (!target.authors || target.authors.length === 0));

    const isSuggestion = !isCertainMatch && (confidence >= 0.40 || totalScore >= 25);

    let matchType: 'exact' | 'high' | 'alternative' = 'alternative';
    if (isbnMatched || (titleScore >= 25 && authorScore >= 15) || confidence >= 0.80 || totalScore >= 70) {
      matchType = 'exact';
    } else if (confidence >= 0.60 || (titleScore >= 20 && totalScore >= 40)) {
      matchType = 'high';
    }

    // Identify provider name(s)
    const sources = matchedEdition?.sources || candidate.editions?.[0]?.sources || [];
    let providerName: string;
    if (sources.length > 1) {
      providerName = sources.map((s) => s.provider).join(' + ');
    } else if (sources.length === 1) {
      providerName = sources[0].provider;
    } else if (candidate.workId.startsWith('gb-')) {
      providerName = 'Google Books';
    } else if (candidate.workId.startsWith('ia-')) {
      providerName = 'Internet Archive';
    } else {
      providerName = 'Open Library';
    }

    return {
      candidate,
      score: totalScore,
      confidence,
      isCertainMatch,
      isSuggestion,
      matchType,
      breakdown: {
        isbnMatch: isbnMatched,
        titleScore,
        authorScore,
        publisherScore,
        yearScore,
        languageScore,
        editionScore,
        coverBonus,
        completenessBonus,
      },
      matchedEdition,
      discoveredIsbn,
      providerName,
    };
  }
}
