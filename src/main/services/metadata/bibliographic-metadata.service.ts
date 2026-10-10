import { MetadataProvider, SearchQuery } from './providers/provider.interface';
import { OpenLibraryProvider } from './providers/open-library.provider';
import { InternetArchiveProvider } from './providers/internet-archive.provider';
import { GoogleBooksProvider } from './providers/google-books.provider';
import { BibliographicWork, BibliographicEdition } from '../../../shared/types/bibliographic';
import { FilenameParser, ParsedFilenameMetadata } from './filename-parser';
import { CandidateMatcher, CandidateEvaluation, TargetBookEvidence } from './candidate-matcher';
import { EmbeddedMetadataExtractor, EmbeddedBookMetadata } from './embedded-metadata.extractor';
import { coverResolverService, CoverResolutionResult } from './cover-resolver.service';
import { isValidIsbn, isPlaceholderTitle, isPlaceholderAuthor } from '../../../shared/validators/metadata-validator';

export interface DiscoveredBookResult {
  title: string;
  authors: string[];
  translators: string[];
  publisher?: string;
  publicationYear?: number;
  edition?: string;
  isbn?: string;
  isbn10?: string;
  isbn13?: string;
  language?: string;
  description?: string;
  coverUrl?: string;
  coverSource?: string;
  confidence: number;
  isVerifiedMatch: boolean;
  matchedWork?: BibliographicWork;
  matchedEdition?: BibliographicEdition;
  candidates: BibliographicWork[];
  parsedFilename?: ParsedFilenameMetadata;
  provenance: {
    localParsed: boolean;
    embeddedFound: boolean;
    providerUsed?: string;
    isbnDiscovered: boolean;
  };
}

export class BibliographicMetadataService {
  private providers: MetadataProvider[];

  constructor(customProviders?: MetadataProvider[]) {
    this.providers = customProviders || [
      new OpenLibraryProvider(),
      new InternetArchiveProvider(),
      new GoogleBooksProvider(),
    ];
  }

  /**
   * Search across all providers using a waterfall fallback approach.
   * If the primary provider returns results, they are returned.
   * If it fails or returns empty, it falls back to the next provider.
   */
  async search(query: string | SearchQuery, maxResults = 10): Promise<BibliographicWork[]> {
    for (const provider of this.providers) {
      try {
        const results = await provider.search(query, maxResults);
        if (results && results.length > 0) {
          return results;
        }
      } catch (err) {
        console.warn(`[BibliographicMetadataService] Provider ${provider.name} failed during search:`, err);
      }
    }
    return [];
  }

  /**
   * Fetch work details by iterating through providers.
   */
  async getWorkDetails(workId: string): Promise<BibliographicWork | null> {
    if (workId.startsWith('ia-')) {
      const iaProvider = this.providers.find((p) => p.name === 'Internet Archive');
      if (iaProvider) return iaProvider.getWorkDetails(workId);
    }

    if (workId.startsWith('gb-')) {
      const gbProvider = this.providers.find((p) => p.name === 'Google Books');
      if (gbProvider) return gbProvider.getWorkDetails(workId);
    }

    for (const provider of this.providers) {
      try {
        const details = await provider.getWorkDetails(workId);
        if (details) return details;
      } catch (err) {
        console.warn(`[BibliographicMetadataService] Provider ${provider.name} failed during getWorkDetails:`, err);
      }
    }
    return null;
  }

  /**
   * Search by ISBN with fallback logic across providers.
   */
  async searchByIsbn(isbn: string): Promise<BibliographicWork | null> {
    const cleanIsbn = isbn.replace(/[-\s]/g, '');
    for (const provider of this.providers) {
      try {
        const result = await provider.searchByIsbn(cleanIsbn);
        if (result) return result;
      } catch (err) {
        console.warn(`[BibliographicMetadataService] Provider ${provider.name} failed during searchByIsbn:`, err);
      }
    }
    return null;
  }

  /**
   * Progressive Discovery & Enrichment Pipeline:
   * 1. Extract local filename information and embedded metadata (EPUB/PDF).
   * 2. Formulate search queries and query providers progressively.
   * 3. Evaluate and rank candidates using trustworthy evidence.
   * 4. Discover ISBN when missing.
   * 5. Resolve matching cover across multi-source waterfall.
   * 6. Function completely offline if network is unavailable.
   */
  async discoverBook(params: {
    filePath?: string;
    filename?: string;
    title?: string;
    author?: string;
    isbn?: string;
  }): Promise<DiscoveredBookResult> {
    const identifierPath = params.filePath || params.filename || '';

    // Stage A: Local Evidence Extraction
    let parsedFilename: ParsedFilenameMetadata | undefined;
    if (identifierPath) {
      parsedFilename = FilenameParser.parse(identifierPath);
    }

    let embeddedMeta: EmbeddedBookMetadata | null = null;
    if (params.filePath) {
      embeddedMeta = await EmbeddedMetadataExtractor.extract(params.filePath);
    }

    // Assemble local target evidence (user input > embedded > filename)
    let rawTitle = params.title?.trim() || '';
    if (isPlaceholderTitle(rawTitle)) {
      rawTitle = embeddedMeta?.title || parsedFilename?.title || '';
    } else if (!rawTitle) {
      rawTitle = embeddedMeta?.title || parsedFilename?.title || '';
    }
    const targetTitle = rawTitle;

    let rawAuthors: string[] = [];
    if (params.author?.trim()) {
      rawAuthors = FilenameParser.splitMultiAuthors(params.author.trim());
    } else if (embeddedMeta?.authors && embeddedMeta.authors.length > 0) {
      rawAuthors = embeddedMeta.authors;
    } else if (parsedFilename?.authors && parsedFilename.authors.length > 0) {
      rawAuthors = parsedFilename.authors;
    }

    const targetAuthors: string[] = rawAuthors.filter((a) => !isPlaceholderAuthor(a));

    const targetTranslators: string[] = parsedFilename?.translators || [];
    const targetPublisher = embeddedMeta?.publisher || parsedFilename?.publisher;
    const targetYear = embeddedMeta?.publicationYear || parsedFilename?.publicationYear;
    const targetEdition = parsedFilename?.edition;
    const targetLanguage = embeddedMeta?.language || parsedFilename?.language;

    let targetIsbn = params.isbn?.trim() || embeddedMeta?.isbn || parsedFilename?.isbn;
    if (targetIsbn) {
      targetIsbn = targetIsbn.replace(/[-\s]/g, '').toUpperCase();
      if (!isValidIsbn(targetIsbn)) targetIsbn = undefined;
    }

    const evidence: TargetBookEvidence = {
      title: targetTitle,
      authors: targetAuthors,
      publisher: targetPublisher,
      publicationYear: targetYear,
      edition: targetEdition,
      isbn: targetIsbn,
      language: targetLanguage,
    };

    // Stage B: Progressive Online Provider Search
    let candidates: BibliographicWork[] = [];
    let providerUsed: string | undefined;

    try {
      // 1. If ISBN is known, search by ISBN first
      if (targetIsbn) {
        for (const provider of this.providers) {
          try {
            const work = await provider.searchByIsbn(targetIsbn);
            if (work) {
              candidates.push(work);
              providerUsed = provider.name;
              break;
            }
          } catch {
            // continue
          }
        }
      }

      // 2. If no ISBN or ISBN yielded no results, search by Title and Author
      if (candidates.length === 0 && targetTitle) {
        const primaryAuthor = targetAuthors.length > 0 ? targetAuthors[0] : undefined;

        for (const provider of this.providers) {
          try {
            let results = await provider.search(
              {
                title: targetTitle,
                author: primaryAuthor,
                general: targetTitle,
              },
              5
            );
            // If search with author returned 0 results, retry with title only
            if ((!results || results.length === 0) && primaryAuthor) {
              results = await provider.search(
                {
                  title: targetTitle,
                  general: targetTitle,
                },
                5
              );
            }
            if (results && results.length > 0) {
              candidates = results;
              providerUsed = provider.name;
              break;
            }
          } catch {
            // continue
          }
        }
      }
    } catch (netErr) {
      console.warn('[BibliographicMetadataService] Online discovery network failure:', netErr);
    }

    // Stage C: Candidate Evaluation & Ranking
    let bestEvaluation: CandidateEvaluation | undefined;
    let matchedWork: BibliographicWork | undefined;
    let matchedEdition: BibliographicEdition | undefined;
    let discoveredIsbn: string | undefined;

    if (candidates.length > 0) {
      const ranked = CandidateMatcher.rankCandidates(evidence, candidates);
      if (ranked.length > 0) {
        bestEvaluation = ranked[0];
        if (bestEvaluation.isCertainMatch || bestEvaluation.score >= 25) {
          matchedWork = bestEvaluation.candidate;
          matchedEdition = bestEvaluation.matchedEdition;
          discoveredIsbn = bestEvaluation.discoveredIsbn;
        }
      }
    }

    // Final Field Consolidation
    const finalIsbn = targetIsbn || discoveredIsbn;
    const finalTitle = matchedWork?.title || targetTitle || (identifierPath ? identifierPath.replace(/\.[^.]+$/, '') : 'Untitled');
    const finalAuthors =
      matchedWork?.authors && matchedWork.authors.length > 0
        ? matchedWork.authors
        : targetAuthors;
    const finalPublisher = matchedEdition?.publisher || targetPublisher;
    const finalYear = matchedWork?.firstPublishYear || targetYear;
    const finalLanguage = matchedEdition?.language || targetLanguage;
    const finalDescription = matchedWork?.description || embeddedMeta?.description;

    // Stage D: Multi-Source Cover Resolution
    let coverResolution: CoverResolutionResult = {
      coverUrl: undefined,
      source: 'none',
      verified: false,
    };

    try {
      coverResolution = await coverResolverService.resolveCover({
        isbn: finalIsbn,
        providerCoverUrl: matchedEdition?.coverUrl,
        title: finalTitle,
        author: finalAuthors[0],
        embeddedCoverBuffer: embeddedMeta?.coverBuffer,
        embeddedCoverMime: embeddedMeta?.coverMimeType,
        internetArchiveId: matchedWork?.workId.startsWith('ia-') ? matchedWork.workId.substring(3) : undefined,
      });
    } catch (coverErr) {
      console.warn('[BibliographicMetadataService] Cover resolution failure:', coverErr);
    }

    if (!coverResolution.coverUrl && params.filePath && params.filePath.toLowerCase().endsWith('.pdf')) {
      try {
        const directPdfCover = await coverResolverService.extractPdfCover(params.filePath);
        if (directPdfCover && directPdfCover.coverUrl) {
          coverResolution = {
            coverUrl: directPdfCover.coverUrl,
            source: 'embedded',
            verified: true,
          };
        }
      } catch (directErr) {
        console.warn('[BibliographicMetadataService] Direct PDF cover fallback failed:', directErr);
      }
    }

    const confidence = bestEvaluation
      ? bestEvaluation.confidence
      : parsedFilename?.overallConfidence || (embeddedMeta ? 0.7 : 0.4);

    return {
      title: finalTitle,
      authors: finalAuthors,
      translators: targetTranslators,
      publisher: finalPublisher,
      publicationYear: finalYear,
      edition: targetEdition,
      isbn: finalIsbn,
      isbn10: matchedEdition?.isbn10 || parsedFilename?.isbn10,
      isbn13: matchedEdition?.isbn13 || parsedFilename?.isbn13,
      language: finalLanguage,
      description: finalDescription,
      coverUrl: coverResolution.coverUrl,
      coverSource: coverResolution.source,
      confidence,
      isVerifiedMatch: !!bestEvaluation?.isCertainMatch,
      matchedWork,
      matchedEdition,
      candidates,
      parsedFilename,
      provenance: {
        localParsed: !!parsedFilename,
        embeddedFound: !!embeddedMeta,
        providerUsed,
        isbnDiscovered: !!discoveredIsbn && !targetIsbn,
      },
    };
  }

  /**
   * Directly extracts an image of a PDF file to make it the book's cover image.
   * Supports pageIndex (1-based) to switch pages.
   */
  async extractPdfCover(filePath: string, pageIndex: number = 1): Promise<string | null> {
    const res = await coverResolverService.extractPdfCover(filePath, pageIndex);
    return res.coverUrl || null;
  }

  /**
   * Directly extracts an image with full pagination metadata.
   */
  async extractPdfCoverDetails(
    filePath: string,
    pageIndex: number = 1
  ): Promise<{ coverUrl: string | null; currentPage: number; totalPages: number; pageNumber?: number }> {
    const res = await coverResolverService.extractPdfCover(filePath, pageIndex);
    return {
      coverUrl: res.coverUrl || null,
      currentPage: res.currentPage || pageIndex,
      totalPages: res.totalPages || 0,
      pageNumber: res.pageNumber,
    };
  }
}

export const bibliographicMetadataService = new BibliographicMetadataService();
