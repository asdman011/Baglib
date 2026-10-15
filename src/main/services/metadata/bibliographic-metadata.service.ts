import { MetadataProvider, SearchQuery } from './providers/provider.interface';
import { OpenLibraryProvider } from './providers/open-library.provider';
import { InternetArchiveProvider } from './providers/internet-archive.provider';
import { GoogleBooksProvider } from './providers/google-books.provider';
import { BibliographicWork, BibliographicEdition } from '../../../shared/types/bibliographic';
import { FilenameParser, ParsedFilenameMetadata } from './filename-parser';
import { CandidateMatcher, CandidateEvaluation, TargetBookEvidence } from './candidate-matcher';
import { EmbeddedMetadataExtractor, EmbeddedBookMetadata } from './embedded-metadata.extractor';
import { coverResolverService, CoverResolutionResult } from './cover-resolver.service';
import { isValidIsbn, isPlaceholderTitle, isPlaceholderAuthor, isbn10ToIsbn13 } from '../../../shared/validators/metadata-validator';
import { QuotaTracker, quotaTracker as defaultQuotaTracker } from './quotaTracker';
import { ProviderConfigService, providerConfigService as defaultProviderConfigService } from './provider-config.service';
import { authorBioService } from './author-bio.service';
import { languageDetectorService } from './language-detector.service';
import { textIsbnScannerService } from './text-isbn-scanner.service';

export interface DiscoveredCandidateItem {
  work: BibliographicWork;
  score: number;
  confidence: number;
  isCertainMatch: boolean;
  isSuggestion: boolean;
  matchType: 'exact' | 'high' | 'alternative';
  matchedEdition?: BibliographicEdition;
  discoveredIsbn?: string;
  providerName?: string;
}

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
  authorBio?: string;
  coverUrl?: string;
  coverSource?: string;
  confidence: number;
  isVerifiedMatch: boolean;
  matchedWork?: BibliographicWork;
  matchedEdition?: BibliographicEdition;
  candidates: BibliographicWork[];
  rankedEvaluations?: DiscoveredCandidateItem[];
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
  private quotaTracker: QuotaTracker;
  private providerConfigService: ProviderConfigService;

  constructor(
    customProviders?: MetadataProvider[],
    quotaTracker: QuotaTracker = defaultQuotaTracker,
    configService: ProviderConfigService = defaultProviderConfigService
  ) {
    this.quotaTracker = quotaTracker;
    this.providerConfigService = configService;
    this.providers = customProviders || [
      new OpenLibraryProvider(),
      new InternetArchiveProvider(),
      new GoogleBooksProvider(this.quotaTracker),
    ];
  }

  /**
   * Returns active/enabled providers in user priority order.
   */
  getOrderedActiveProviders(): MetadataProvider[] {
    const configs = this.providerConfigService.getProviderConfigs();
    const enabledConfigs = configs.filter((c) => c.enabled);
    const ordered: MetadataProvider[] = [];

    for (const conf of enabledConfigs) {
      const match = this.providers.find((p) => {
        if (conf.id === 'google-books') return p.name === 'Google Books';
        if (conf.id === 'open-library') return p.name === 'Open Library';
        if (conf.id === 'internet-archive') return p.name === 'Internet Archive';
        return p.name.toLowerCase() === conf.name.toLowerCase();
      });
      if (match) ordered.push(match);
    }

    // Include custom providers that might be registered directly
    for (const p of this.providers) {
      if (!ordered.includes(p)) {
        const conf = configs.find((c) => {
          if (c.id === 'google-books' && p.name === 'Google Books') return true;
          if (c.id === 'open-library' && p.name === 'Open Library') return true;
          if (c.id === 'internet-archive' && p.name === 'Internet Archive') return true;
          return c.name.toLowerCase() === p.name.toLowerCase();
        });
        if (!conf || conf.enabled) {
          ordered.push(p);
        }
      }
    }

    return ordered;
  }

  /**
   * Search across all active providers respecting user priority order.
   * Aggregates and deduplicates results into a unified candidate pool.
   */
  async search(query: string | SearchQuery, maxResults = 10): Promise<BibliographicWork[]> {
    const isDepleted = this.quotaTracker.isDepleted();
    const orderedProviders = this.getOrderedActiveProviders();

    for (const provider of orderedProviders) {
      if (isDepleted && provider.name === 'Google Books') {
        continue;
      }

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
      if (this.quotaTracker.isDepleted()) return null;
      const gbProvider = this.providers.find((p) => p.name === 'Google Books');
      if (gbProvider) return gbProvider.getWorkDetails(workId);
    }

    for (const provider of this.providers) {
      if (this.quotaTracker.isDepleted() && provider.name === 'Google Books') continue;
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
   * Search by ISBN with prioritized fallback across active providers.
   * Merges matching editions if multiple providers succeed.
   */
  async searchByIsbn(isbn: string): Promise<BibliographicWork | null> {
    const cleanIsbn = isbn.replace(/[-\s]/g, '');
    const isDepleted = this.quotaTracker.isDepleted();
    const orderedProviders = this.getOrderedActiveProviders();

    for (const provider of orderedProviders) {
      if (isDepleted && provider.name === 'Google Books') continue;
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
   * Phase 1: Extracts strictly local/offline metadata from the uploaded file (EPUB/PDF embedded or filename)
   * without contacting any online metadata providers.
   */
  async extractOfflineMetadata(params: {
    filePath?: string;
    filename?: string;
  }): Promise<DiscoveredBookResult> {
    return this.discoverBook({
      ...params,
      offlineOnly: true,
    });
  }

  /**
   * Progressive Discovery & Enrichment Pipeline:
   * 1. Extract local filename information and embedded metadata (EPUB/PDF).
   * 2. Query enabled providers according to user priority order.
   *    Google Books is NOT short-circuited when Open Library returns results,
   *    allowing rich metadata aggregation across both sources.
   * 3. Evaluate, merge, and rank candidates using deterministic multi-factor scoring.
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
    page?: number;
    deeper?: boolean;
    offlineOnly?: boolean;
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
      rawTitle = '';
    }
    if (!rawTitle) {
      const embeddedTitle = embeddedMeta?.title?.trim();
      const filenameTitle = parsedFilename?.title?.trim();
      if (embeddedTitle && !isPlaceholderTitle(embeddedTitle)) {
        rawTitle = embeddedTitle;
      } else if (filenameTitle && !isPlaceholderTitle(filenameTitle)) {
        rawTitle = filenameTitle;
      }
    }
    const targetTitle = rawTitle;

    // Calibre smart_update resolution for authors:
    // User override (if non-placeholder) > Valid embedded file metadata > Valid filename parsed metadata
    const validUserAuthors: string[] = params.author?.trim()
      ? FilenameParser.splitMultiAuthors(params.author.trim()).filter((a) => !isPlaceholderAuthor(a))
      : [];

    const validEmbeddedAuthors: string[] = (embeddedMeta?.authors || []).filter(
      (a) => !isPlaceholderAuthor(a)
    );

    const validFilenameAuthors: string[] = (parsedFilename?.authors || []).filter(
      (a) => !isPlaceholderAuthor(a)
    );

    let targetAuthors: string[] = [];
    if (validUserAuthors.length > 0) {
      targetAuthors = validUserAuthors;
    } else if (validEmbeddedAuthors.length > 0) {
      targetAuthors = validEmbeddedAuthors;
    } else if (validFilenameAuthors.length > 0) {
      targetAuthors = validFilenameAuthors;
    }

    const targetTranslators: string[] = parsedFilename?.translators || [];
    const targetPublisher = embeddedMeta?.publisher || parsedFilename?.publisher;
    const targetYear = embeddedMeta?.publicationYear || parsedFilename?.publicationYear;
    const targetEdition = parsedFilename?.edition;

    // Resolve language reliably without assigning arbitrary defaults
    let targetLanguage: string | undefined = embeddedMeta?.language;
    if (!targetLanguage && parsedFilename?.language) {
      const norm = languageDetectorService.normalizeLanguageCode(parsedFilename.language);
      if (norm) {
        targetLanguage = norm.name;
      }
    }
    if (!targetLanguage && (targetTitle || embeddedMeta?.description)) {
      const detectResult = languageDetectorService.detectLanguage({
        title: targetTitle,
        description: embeddedMeta?.description,
        author: targetAuthors[0],
      });
      if (detectResult.isReliable) {
        targetLanguage = detectResult.language;
      }
    }

    let targetIsbn = params.isbn?.trim() || embeddedMeta?.isbn || parsedFilename?.isbn;
    let targetIsbn10 = parsedFilename?.isbn10 || embeddedMeta?.isbn10;
    let targetIsbn13 = parsedFilename?.isbn13 || embeddedMeta?.isbn13;

    // Auto-acquire ISBN from file content (PDF/EPUB/TXT/HTML) if not already found in headers/filename
    if (!targetIsbn && params.filePath) {
      try {
        const scanned = await textIsbnScannerService.scanFile(params.filePath);
        if (scanned?.isbn) {
          targetIsbn = scanned.isbn;
          targetIsbn10 = scanned.isbn10;
          targetIsbn13 = scanned.isbn13;
        }
      } catch (scanErr) {
        console.warn('[BibliographicMetadataService] Text ISBN scanning failed:', scanErr);
      }
    }

    if (targetIsbn) {
      targetIsbn = targetIsbn.replace(/[-\s]/g, '').toUpperCase();
      if (!isValidIsbn(targetIsbn)) {
        targetIsbn = undefined;
      } else {
        if (!targetIsbn13 && targetIsbn.length === 13) targetIsbn13 = targetIsbn;
        if (!targetIsbn10 && targetIsbn.length === 10) targetIsbn10 = targetIsbn;
        if (targetIsbn.length === 10 && !targetIsbn13) {
          targetIsbn13 = isbn10ToIsbn13(targetIsbn) || undefined;
        }
      }
    }

    // Phase 1 (Local Upload / Offline Mode):
    // If offlineOnly is requested, return purely local evidence and extracted covers without contacting external APIs
    if (params.offlineOnly) {
      let localCoverUrl: string | undefined;
      let localCoverSource: CoverResolutionResult['source'] = 'none';

      if (embeddedMeta?.coverBuffer) {
        const mime = embeddedMeta.coverMimeType || 'image/jpeg';
        localCoverUrl = `data:${mime};base64,${embeddedMeta.coverBuffer.toString('base64')}`;
        localCoverSource = 'embedded';
      } else if (params.filePath && params.filePath.toLowerCase().endsWith('.pdf')) {
        try {
          const directPdfCover = await coverResolverService.extractPdfCover(params.filePath);
          if (directPdfCover?.coverUrl) {
            localCoverUrl = directPdfCover.coverUrl;
            localCoverSource = 'embedded';
          }
        } catch (pdfErr) {
          console.warn('[BibliographicMetadataService] Direct PDF cover fallback failed in offline mode:', pdfErr);
        }
      }

      const finalTitle = targetTitle || (identifierPath ? identifierPath.replace(/\.[^.]+$/, '') : 'Untitled');
      const isArabic =
        targetLanguage?.toLowerCase().startsWith('ar') ||
        targetLanguage === 'العربية' ||
        /[\u0600-\u06FF]/.test(finalTitle);
      const defaultUnknownAuthor = isArabic ? 'غير معروف' : 'Unknown Author';
      const resolvedAuthors = targetAuthors.length > 0 ? targetAuthors : [defaultUnknownAuthor];

      return {
        title: finalTitle,
        authors: resolvedAuthors,
        translators: targetTranslators,
        publisher: targetPublisher,
        publicationYear: targetYear,
        edition: targetEdition,
        isbn: targetIsbn,
        isbn10: targetIsbn10,
        isbn13: targetIsbn13,
        language: targetLanguage,
        description: embeddedMeta?.description,
        coverUrl: localCoverUrl,
        coverSource: localCoverSource,
        confidence: targetIsbn ? 0.95 : (embeddedMeta ? 0.85 : (parsedFilename?.overallConfidence || 0.5)),
        isVerifiedMatch: false,
        candidates: [],
        rankedEvaluations: [],
        parsedFilename,
        provenance: {
          localParsed: !!parsedFilename,
          embeddedFound: !!embeddedMeta,
          providerUsed: undefined,
          isbnDiscovered: !!targetIsbn && !params.isbn,
        },
      };
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

    // Stage B: Multi-Provider Online Search respecting user priority order
    let candidates: BibliographicWork[] = [];
    let providerUsed: string | undefined;

    const activeProviders = this.getOrderedActiveProviders();
    const isDepleted = this.quotaTracker.isDepleted();

    try {
      // 1. If ISBN is known, search by ISBN across active providers
      if (targetIsbn) {
        for (const provider of activeProviders) {
          if (isDepleted && provider.name === 'Google Books') continue;

          try {
            const work = await provider.searchByIsbn(targetIsbn);
            if (work) {
              candidates.push(work);
              if (!providerUsed) providerUsed = provider.name;
            }
          } catch (err) {
            console.warn(`[BibliographicMetadataService] Provider ${provider.name} failed during searchByIsbn:`, err);
          }
        }
      }

      // 2. Search by Title and Author across all active providers (no Google Books short-circuiting)
      if (targetTitle) {
        const primaryAuthor = targetAuthors.length > 0 ? targetAuthors[0] : undefined;
        const page = params.page || 1;
        const deeper = params.deeper || false;
        const maxPerProvider = deeper ? 8 : 5;

        for (const provider of activeProviders) {
          if (isDepleted && provider.name === 'Google Books') continue;

          try {
            let results = await provider.search(
              {
                title: targetTitle,
                author: primaryAuthor,
                general: targetTitle,
                page,
                deeper,
              },
              maxPerProvider
            );
            // If search with author returned 0 results, retry with title only
            if ((!results || results.length === 0) && primaryAuthor) {
              results = await provider.search(
                {
                  title: targetTitle,
                  general: targetTitle,
                  page,
                  deeper,
                },
                maxPerProvider
              );
            }
            if (results && results.length > 0) {
              candidates.push(...results);
              if (!providerUsed) providerUsed = provider.name;
            }
          } catch (err) {
            console.warn(`[BibliographicMetadataService] Provider ${provider.name} failed during search:`, err);
          }
        }
      }
    } catch (netErr) {
      console.warn('[BibliographicMetadataService] Online discovery network failure:', netErr);
    }

    // Stage C: Candidate Evaluation & Ranking
    let rankedCandidates: BibliographicWork[] = [];
    let rankedEvaluations: DiscoveredCandidateItem[] = [];
    let bestEvaluation: CandidateEvaluation | undefined;
    let matchedWork: BibliographicWork | undefined;
    let matchedEdition: BibliographicEdition | undefined;
    let discoveredIsbn: string | undefined;

    if (candidates.length > 0) {
      const ranked = CandidateMatcher.rankCandidates(evidence, candidates);
      if (ranked.length > 0) {
        bestEvaluation = ranked[0];
        rankedCandidates = ranked.map((r) => r.candidate);
        rankedEvaluations = ranked.map((r) => ({
          work: r.candidate,
          score: r.score,
          confidence: r.confidence,
          isCertainMatch: r.isCertainMatch,
          isSuggestion: r.isSuggestion,
          matchType: r.matchType,
          matchedEdition: r.matchedEdition,
          discoveredIsbn: r.discoveredIsbn,
          providerName: r.providerName,
        }));

        if (bestEvaluation.isCertainMatch || bestEvaluation.score >= 20) {
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
    const finalDescription = matchedWork?.description || embeddedMeta?.description;

    let finalLanguage = matchedEdition?.language || targetLanguage;
    if (finalLanguage) {
      const norm = languageDetectorService.normalizeLanguageCode(finalLanguage);
      if (norm) {
        finalLanguage = norm.name;
      }
    } else if (finalTitle || finalDescription) {
      const detectResult = languageDetectorService.detectLanguage({
        title: finalTitle,
        description: finalDescription,
        author: finalAuthors[0],
      });
      if (detectResult.isReliable) {
        finalLanguage = detectResult.language;
      }
    }

    let finalAuthorBio: string | undefined = matchedWork?.authorBio;
    if (!finalAuthorBio && finalAuthors.length > 0 && !isPlaceholderAuthor(finalAuthors[0])) {
      try {
        finalAuthorBio = await authorBioService.resolveAuthorBio(finalAuthors[0], finalLanguage);
      } catch (bioErr) {
        console.warn('[BibliographicMetadataService] Author bio resolution error:', bioErr);
      }
    }

    if (matchedWork && finalAuthorBio && !matchedWork.authorBio) {
      matchedWork.authorBio = finalAuthorBio;
    }

    const outputCandidates = rankedCandidates.length > 0 ? rankedCandidates : candidates;
    for (const cand of outputCandidates) {
      if (finalAuthorBio && !cand.authorBio) {
        cand.authorBio = finalAuthorBio;
      }
    }

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

    const isArabic =
      finalLanguage?.toLowerCase().startsWith('ar') ||
      finalLanguage === 'العربية' ||
      /[\u0600-\u06FF]/.test(finalTitle);
    const defaultUnknownAuthor = isArabic ? 'غير معروف' : 'Unknown Author';
    const resolvedFinalAuthors = finalAuthors.length > 0 ? finalAuthors : [defaultUnknownAuthor];

    return {
      title: finalTitle,
      authors: resolvedFinalAuthors,
      translators: targetTranslators,
      publisher: finalPublisher,
      publicationYear: finalYear,
      edition: targetEdition,
      isbn: finalIsbn,
      isbn10: matchedEdition?.isbn10 || targetIsbn10 || parsedFilename?.isbn10,
      isbn13: matchedEdition?.isbn13 || targetIsbn13 || parsedFilename?.isbn13,
      language: finalLanguage,
      description: finalDescription,
      authorBio: finalAuthorBio,
      coverUrl: coverResolution.coverUrl,
      coverSource: coverResolution.source,
      confidence,
      isVerifiedMatch: !!bestEvaluation?.isCertainMatch,
      matchedWork,
      candidates: outputCandidates,
      rankedEvaluations,
      parsedFilename,
      provenance: {
        localParsed: !!parsedFilename,
        embeddedFound: !!embeddedMeta,
        providerUsed,
        isbnDiscovered: !!(discoveredIsbn || (targetIsbn && !params.isbn)),
      },
    };
  }

  private deduplicateCandidates(candidates: BibliographicWork[]): BibliographicWork[] {
    const seen = new Set<string>();
    const result: BibliographicWork[] = [];

    for (const cand of candidates) {
      if (!cand) continue;
      const primaryIsbn = (cand.editions?.[0]?.isbn13 || cand.editions?.[0]?.isbn || cand.editions?.[0]?.isbn10 || '')
        .replace(/[-\s]/g, '')
        .toUpperCase();
      const normTitle = (cand.title || '').toLowerCase().replace(/[^\w\u0600-\u06FF]/g, '');
      const normAuthor = (cand.authors?.[0] || '').toLowerCase().replace(/[^\w\u0600-\u06FF]/g, '');

      const key = primaryIsbn
        ? `isbn:${primaryIsbn}`
        : cand.workId
        ? `id:${cand.workId}`
        : `ta:${normTitle}::${normAuthor}`;

      if (!seen.has(key)) {
        seen.add(key);
        result.push(cand);
      }
    }
    return result;
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
