/**
 * Baglib — Online Metadata Enrichment & Safe Merge Engine (Story 12 / KEY-124)
 *
 * Coordinates querying online providers for candidate editions matching an existing local book,
 * generates non-destructive field diffs, prevents accidental data loss on user-populated fields,
 * and executes atomic multi-field merges with optional local cover caching.
 */

import fs from 'fs';
import path from 'path';
import { BookItem, BookItemInput, DigitalFormat, MetadataProvenance } from '../../../shared/types/work';
import { IWorkRepository } from '../../../shared/types/repository';
import {
  EnrichmentCandidateEdition,
  EnrichmentFieldKey,
  EnrichmentFieldDiff,
  EnrichmentComparison,
  ApplyEnrichmentRequest,
  ApplyEnrichmentResult,
  CandidateEditionsQueryResult,
  TechnicalSearchDiagnostics,
} from '../../../shared/types/enrichment';
import { DuplicateDetector } from '../search/duplicate-detector';
import { OpenLibrarySearchProvider } from '../search/providers/open-library-search.provider';
import { InternetArchiveSearchProvider } from '../search/providers/internet-archive-search.provider';
import { GutenbergSearchProvider } from '../search/providers/gutenberg-search.provider';
import { ISearchProvider, UnifiedSearchResult } from '../../../shared/types/search';
import { CoverFetchService, coverFetchService as defaultCoverFetchService } from './cover-fetch.service';
import { normalizeSearchString } from '../../../shared/utils/text-normalizer';
import { FilenameParser } from './filename-parser';
import { EmbeddedMetadataExtractor } from './embedded-metadata.extractor';
import { PdfMetadataReconciler, calculateTokenOverlap } from './pdf-metadata-reconciler';
import { isPlaceholderAuthor, isPlaceholderTitle } from '../../../shared/validators/metadata-validator';

export class MetadataEnrichmentService {
  private providers: ISearchProvider[];
  private coverFetcher: CoverFetchService;

  constructor(options?: ISearchProvider[] | {
    providers?: ISearchProvider[];
    coverFetcher?: CoverFetchService;
  }) {
    const defaultProviders = [
      new OpenLibrarySearchProvider(),
      new InternetArchiveSearchProvider(),
      new GutenbergSearchProvider(),
    ];
    const rawProviders = Array.isArray(options) ? options : (options?.providers || defaultProviders);
    const isGoogleBooks = (p: ISearchProvider) =>
      p.id === 'googlebooks' || (p.id as string) === 'google-books' || p.name.toLowerCase().includes('google');
    this.providers = rawProviders.filter((p) => !isGoogleBooks(p));
    this.coverFetcher = Array.isArray(options) ? defaultCoverFetchService : (options?.coverFetcher || defaultCoverFetchService);
  }

  /**
   * Discovers candidate editions from online bibliographic catalogs for an existing library book.
   * Enforces that non-Google providers are queried first, and Google Books is strictly executed last.
   */
  public async findCandidateEditions(work: BookItem): Promise<CandidateEditionsQueryResult> {
    const cleanIsbn = work.isbn ? DuplicateDetector.normalizeIsbn(work.isbn) : undefined;
    const queryTitle = work.title?.trim() || '';
    const queryAuthor = work.author?.trim() || '';

    const candidates: EnrichmentCandidateEdition[] = [];
    const seenCandidateKeys = new Set<string>();

    const createTimeoutSignal = (ms: number): AbortSignal | undefined => {
      try {
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
          return AbortSignal.timeout(ms);
        }
      } catch {
        // Fallback if not available
      }
      return undefined;
    };

    const activeProviders = this.providers.filter((p) => p.isEnabled());

    const searchWithProvider = async (provider: ISearchProvider): Promise<UnifiedSearchResult[]> => {
      if (cleanIsbn && cleanIsbn.length >= 10) {
        try {
          const isbnResults = await provider.search({ isbn: cleanIsbn, query: cleanIsbn }, createTimeoutSignal(8000));
          if (isbnResults && isbnResults.length > 0) {
            return isbnResults;
          }
        } catch {
          // Ignore and proceed to title search
        }
      }

      if (queryTitle) {
        const textQuery = queryAuthor ? `${queryTitle} ${queryAuthor}` : queryTitle;
        try {
          return await provider.search(
            { query: textQuery, title: queryTitle, author: queryAuthor },
            createTimeoutSignal(8000)
          );
        } catch {
          return [];
        }
      }

      return [];
    };

    const processResults = (items: UnifiedSearchResult[]) => {
      for (const item of items) {
        // Skip local library results if returned
        if (item.providerId === 'local') continue;

        // Dedup by candidate unique key
        const itemIsbn = item.isbn ? DuplicateDetector.normalizeIsbn(item.isbn) : undefined;
        const dedupKey = itemIsbn
          ? `isbn:${itemIsbn}`
          : `${item.providerId}:${normalizeSearchString(item.title)}:${normalizeSearchString(item.author || '')}`;

        if (seenCandidateKeys.has(dedupKey)) continue;
        seenCandidateKeys.add(dedupKey);

        // Calculate match confidence between work and candidate
        const { confidence, reason, factors } = this.calculateMatchConfidence(work, item);

        // Determine downloadable digital format if available
        const downloadUrl: string | undefined = item.downloadUrl;
        let downloadFormat: DigitalFormat | undefined;

        if (item.availableFormats && item.availableFormats.length > 0) {
          if (item.availableFormats.includes('EPUB')) {
            downloadFormat = 'EPUB';
          } else if (item.availableFormats.includes('PDF')) {
            downloadFormat = 'PDF';
          }
        } else if (downloadUrl) {
          if (downloadUrl.toLowerCase().endsWith('.epub')) downloadFormat = 'EPUB';
          else if (downloadUrl.toLowerCase().endsWith('.pdf')) downloadFormat = 'PDF';
        }

        candidates.push({
          id: item.id,
          providerId: item.providerId,
          providerName: item.providerName,
          title: item.title,
          authors: item.authors && item.authors.length > 0 ? item.authors : (item.author ? [item.author] : []),
          publisher: item.publisher,
          publicationYear: item.publishYear,
          isbn: item.isbn,
          language: item.language,
          description: item.description,
          subjects: item.subjects,
          coverUrl: item.coverUrl,
          coverResolution: item.coverUrl ? 'high' : undefined,
          downloadUrl,
          downloadFormat,
          sourceUrl: item.sourceUrl,
          matchConfidence: confidence,
          matchReason: reason,
          matchFactors: factors,
        });
      }
    };

    // Execute all active providers in parallel
    const searchPromises = activeProviders.map((p) => searchWithProvider(p));
    const searchSettled = await Promise.allSettled(searchPromises);
    for (const res of searchSettled) {
      if (res.status === 'fulfilled') {
        processResults(res.value);
      }
    }

    // Sort candidates by match confidence descending
    candidates.sort((a, b) => (b.matchConfidence || 0) - (a.matchConfidence || 0));

    // Assemble rich Technical Diagnostics for transparency
    let technicalDiagnostics: TechnicalSearchDiagnostics | undefined;
    try {
      const filePath = work.filePath || '';
      const fileFormat = filePath.includes('.')
        ? path.extname(filePath).replace('.', '').toUpperCase()
        : 'PDF';
      let fileSizeBytes: number | undefined;
      let fileSizeFormatted = work.fileSize ? String(work.fileSize) : undefined;
      let embeddedDocInfo: TechnicalSearchDiagnostics['embeddedDocInfo'];
      let discardedArtifacts: Array<{ field: string; value: string; reason: string }> = [];

      if (filePath) {
        try {
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            fileSizeBytes = stats.size;
            fileSizeFormatted = `${(stats.size / (1024 * 1024)).toFixed(1)} MB`;
          }
        } catch {
          // ignore stat errors
        }

        try {
          const embedded = await EmbeddedMetadataExtractor.extract(filePath);
          if (embedded) {
            embeddedDocInfo = {
              title: embedded.title,
              author: embedded.authors?.join(', '),
              publisher: embedded.publisher,
              publicationYear: embedded.publicationYear,
              pagesCount: embedded.pagesCount,
            };
          }

          const parsed = FilenameParser.parse(filePath);
          const reconciled = PdfMetadataReconciler.reconcile({
            embeddedMeta: embedded,
            parsedFilename: parsed,
            rawFilename: filePath,
          });
          discardedArtifacts = reconciled.discardedArtifacts || [];
        } catch {
          // ignore extraction errors
        }
      }

      const parsedFilename = filePath ? FilenameParser.parse(filePath) : undefined;
      const providersQueried = this.providers.filter((p) => p.isEnabled()).map((p) => p.name);

      technicalDiagnostics = {
        filePath: filePath || undefined,
        fileFormat: fileFormat || 'PDF',
        fileSizeBytes,
        fileSizeFormatted,
        embeddedDocInfo,
        filenameBreakdown: {
          rawFilename: filePath ? path.basename(filePath) : (work.title || ''),
          parsedTitle: parsedFilename?.title || work.title,
          parsedAuthor: parsedFilename?.authors?.join(', ') || work.author,
          parsedYear: parsedFilename?.publicationYear || work.publicationYear,
          parsedPublisher: parsedFilename?.publisher || work.publisher,
          discardedArtifacts,
        },
        activeQuery: {
          normalizedTitle: queryTitle,
          normalizedAuthor: queryAuthor,
          detectedIsbn: cleanIsbn,
          detectedDoi: undefined,
          queryString: cleanIsbn ? `isbn:${cleanIsbn}` : (queryAuthor ? `${queryTitle} ${queryAuthor}` : queryTitle),
          providersQueried,
        },
      };
    } catch (e) {
      console.warn('[MetadataEnrichmentService] Could not assemble technical diagnostics:', e);
    }

    return {
      workId: work.id,
      candidates,
      queryUsed: {
        isbn: cleanIsbn,
        title: queryTitle,
        author: queryAuthor,
      },
      totalFound: candidates.length,
      technicalDiagnostics,
    };
  }

  /**
   * Calculates similarity and match confidence between a local book and an online candidate.
   */
  private calculateMatchConfidence(
    work: BookItem,
    candidate: UnifiedSearchResult
  ): {
    confidence: number;
    reason: string;
    factors: {
      isbnMatched?: boolean;
      titleSimilarity?: number;
      authorMatched?: boolean;
      summary?: string;
    };
  } {
    const workIsbn = work.isbn ? DuplicateDetector.normalizeIsbn(work.isbn) : undefined;
    const candIsbn = candidate.isbn ? DuplicateDetector.normalizeIsbn(candidate.isbn) : undefined;

    if (workIsbn && candIsbn && workIsbn === candIsbn) {
      return {
        confidence: 1.0,
        reason: 'Exact ISBN Match',
        factors: {
          isbnMatched: true,
          titleSimilarity: 1.0,
          authorMatched: true,
          summary: 'Exact ISBN Match (100%)',
        },
      };
    }

    const normWorkTitle = normalizeSearchString(work.title || '');
    const normCandTitle = normalizeSearchString(candidate.title || '');

    const workAuthorStr =
      work.author ||
      (Array.isArray((work as BookItem & { authors?: string[] }).authors) && (work as BookItem & { authors: string[] }).authors.length > 0
        ? (work as BookItem & { authors: string[] }).authors.join(', ')
        : '');
    const candAuthorStr =
      candidate.author ||
      (candidate.authors && candidate.authors.length > 0
        ? candidate.authors.join(', ')
        : '');
    const normWorkAuthor = normalizeSearchString(workAuthorStr);
    const normCandAuthor = normalizeSearchString(candAuthorStr);

    const titleOverlap = calculateTokenOverlap(normWorkTitle, normCandTitle);
    const titlesExactOrPrefix =
      normWorkTitle === normCandTitle ||
      (normWorkTitle.length > 3 && normCandTitle.startsWith(normWorkTitle)) ||
      (normCandTitle.length > 3 && normWorkTitle.startsWith(normCandTitle));

    const authorsMatch = Boolean(
      normWorkAuthor &&
      normCandAuthor &&
      (normWorkAuthor === normCandAuthor ||
        normWorkAuthor.includes(normCandAuthor) ||
        normCandAuthor.includes(normWorkAuthor))
    );

    let confidence = 0.3;
    let reason = 'Partial Keyword Match';

    if (titlesExactOrPrefix && authorsMatch) {
      confidence = 0.95;
      reason = 'Title & Author Match';
    } else if (titleOverlap >= 0.8 && authorsMatch) {
      confidence = Math.round((0.80 + titleOverlap * 0.15) * 100) / 100;
      reason = `Title Token Similarity (${Math.round(titleOverlap * 100)}%) & Author Match`;
    } else if (titlesExactOrPrefix) {
      confidence = 0.80;
      reason = 'Exact Title Match';
    } else if (titleOverlap >= 0.5) {
      confidence = Math.round((0.50 + titleOverlap * 0.30) * 100) / 100;
      reason = `Title Token Similarity (${Math.round(titleOverlap * 100)}%)`;
    } else if (authorsMatch) {
      confidence = 0.50;
      reason = 'Author Alignment Only';
    }

    return {
      confidence,
      reason,
      factors: {
        isbnMatched: false,
        titleSimilarity: Math.round(titleOverlap * 100) / 100,
        authorMatched: authorsMatch,
        summary: reason,
      },
    };
  }

  /**
   * Computes a field-by-field diff between current book attributes and candidate edition metadata.
   */
  public computeFieldDiffs(
    currentBook: BookItem,
    candidate: EnrichmentCandidateEdition
  ): EnrichmentComparison {
    const diffs = {} as Record<EnrichmentFieldKey, EnrichmentFieldDiff>;

    const checkField = (
      field: EnrichmentFieldKey,
      labelKey: string,
      currentVal: unknown,
      incomingVal: unknown
    ) => {
      let hasCurrent = this.isPopulated(currentVal);
      if (field === 'title' && hasCurrent && isPlaceholderTitle(typeof currentVal === 'string' ? currentVal : undefined)) {
        hasCurrent = false;
      }
      if (field === 'author' && hasCurrent && isPlaceholderAuthor(typeof currentVal === 'string' ? currentVal : undefined)) {
        hasCurrent = false;
      }
      const hasIncoming = this.isPopulated(incomingVal);
      const isDiff = this.areValuesDifferent(currentVal, incomingVal);
      const isOverwriting = Boolean(hasCurrent && isDiff && hasIncoming);

      diffs[field] = {
        field,
        labelKey,
        currentValue: currentVal,
        incomingValue: incomingVal,
        hasCurrent,
        hasIncoming,
        isDifferent: isDiff,
        isOverwriting,
      };
    };

    checkField('title', 'titleLabel', currentBook.title, candidate.title);
    checkField('author', 'authorLabel', currentBook.author, candidate.authors?.join(', '));
    checkField('publisher', 'publisherLabel', currentBook.publisher, candidate.publisher);
    checkField('publicationYear', 'publishedYearLabel', currentBook.publicationYear, candidate.publicationYear);
    checkField('isbn', 'isbnLabel', currentBook.isbn, candidate.isbn);
    checkField('language', 'languageLabel', currentBook.language, candidate.language);
    checkField('description', 'descriptionLabel', currentBook.description, candidate.description);
    checkField('coverImage', 'coverImageLabel', currentBook.coverImage, candidate.coverUrl);
    checkField(
      'categories',
      'subjectsLabel',
      currentBook.categories?.length ? currentBook.categories : undefined,
      candidate.subjects?.length ? candidate.subjects : undefined
    );
    checkField('pagesCount', 'pagesLabel', currentBook.pagesCount, candidate.pageCount);

    let newFieldsCount = 0;
    let overwritingCount = 0;
    let identicalCount = 0;

    for (const d of Object.values(diffs)) {
      if (d.isOverwriting) {
        overwritingCount++;
      } else if (!d.hasCurrent && d.hasIncoming) {
        newFieldsCount++;
      } else if (!d.isDifferent) {
        identicalCount++;
      }
    }

    return {
      workId: currentBook.id,
      currentBook,
      candidate,
      diffs,
      summary: {
        totalFields: Object.keys(diffs).length,
        newFieldsCount,
        overwritingCount,
        identicalCount,
      },
    };
  }

  private isPopulated(val: unknown): boolean {
    if (val === undefined || val === null) return false;
    if (typeof val === 'string') return val.trim().length > 0;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'number') return !isNaN(val);
    return true;
  }

  private areValuesDifferent(a: unknown, b: unknown): boolean {
    if (!this.isPopulated(a) && !this.isPopulated(b)) return false;
    if (this.isPopulated(a) !== this.isPopulated(b)) return true;

    if (typeof a === 'string' && typeof b === 'string') {
      return a.trim() !== b.trim();
    }
    if (typeof a === 'number' && typeof b === 'number') {
      return a !== b;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      return JSON.stringify(a.sort()) !== JSON.stringify(b.sort());
    }
    return String(a) !== String(b);
  }

  /**
   * Atomically applies approved enrichment fields to an existing book with overwrite guards.
   */
  public async applyEnrichment(
    request: ApplyEnrichmentRequest,
    repository: IWorkRepository
  ): Promise<ApplyEnrichmentResult> {
    const existingBook = repository.getById
      ? await repository.getById(request.workId)
      : (await repository.getAllWorks()).find((b) => b.id === request.workId);

    if (!existingBook) {
      throw new Error(`Book with ID "${request.workId}" not found in library.`);
    }

    const appliedFields: EnrichmentFieldKey[] = [];
    const skippedFields: EnrichmentFieldKey[] = [];

    // Clone existing attributes as baseline
    const updatedInput: BookItemInput = {
      id: existingBook.id,
      title: existingBook.title,
      author: existingBook.author,
      edition: existingBook.edition,
      publisher: existingBook.publisher,
      publicationYear: existingBook.publicationYear,
      isbn: existingBook.isbn,
      coverImage: existingBook.coverImage,
      description: existingBook.description,
      language: existingBook.language,
      pagesCount: existingBook.pagesCount,
      readingStatus: existingBook.readingStatus,
      readingProgress: existingBook.readingProgress,
      bookType: existingBook.bookType,
      categories: [...(existingBook.categories || [])],
      tags: [...(existingBook.tags || [])],
      lendingHistory: existingBook.lendingHistory || [],
    };

    let downloadedCoverPath: string | undefined;

    // Process selected fields
    for (const field of request.selectedFields) {
      const incomingVal = request.incomingValues[field];
      if (!this.isPopulated(incomingVal)) {
        skippedFields.push(field);
        continue;
      }

      const currentVal = (existingBook)[field];
      let hasCurrent = this.isPopulated(currentVal);
      if (field === 'title' && hasCurrent && isPlaceholderTitle(typeof currentVal === 'string' ? currentVal : undefined)) {
        hasCurrent = false;
      }
      if (field === 'author' && hasCurrent && isPlaceholderAuthor(typeof currentVal === 'string' ? currentVal : undefined)) {
        hasCurrent = false;
      }

      // Overwrite protection: if field is already populated and overwritePopulatedFields is NOT true, skip!
      if (hasCurrent && !request.overwritePopulatedFields) {
        skippedFields.push(field);
        continue;
      }

      // Handle Cover download locally if requested
      if (field === 'coverImage' && typeof incomingVal === 'string') {
        if (request.downloadCoverLocally) {
          const coverRes = await this.coverFetcher.fetchAndCacheCover({
            workId: existingBook.id,
            coverUrl: incomingVal,
          });
          if (coverRes.success && coverRes.localPath) {
            updatedInput.coverImage = coverRes.localPath;
            downloadedCoverPath = coverRes.localPath;
            appliedFields.push('coverImage');
            continue;
          }
        }
      }

      // Apply field update
      Object.assign(updatedInput, { [field]: incomingVal });
      appliedFields.push(field);
    }

    // Build and attach rich Geek Provenance for the enriched book
    const candidate = (request as ApplyEnrichmentRequest & { candidate?: EnrichmentCandidateEdition }).candidate;
    const providerName = candidate?.providerName || candidate?.providerId || 'Online API';
    const fieldSources: NonNullable<MetadataProvenance['fieldSources']> = {
      ...(existingBook.metadataProvenance?.fieldSources || {}),
    };

    for (const f of appliedFields) {
      fieldSources[f] = {
        source: providerName,
        status: 'verified',
        value: (updatedInput)[f],
        confidence: candidate?.matchConfidence ?? 0.95,
      };
    }

    const auditTrace: string[] = [
      ...(existingBook.metadataProvenance?.auditTrace || []),
      `[${new Date().toLocaleTimeString()}] Applied enrichment from ${providerName} (Candidate ID: ${request.candidateId})`,
      `[Updated Fields] ${appliedFields.join(', ')}`,
      `[Match Confidence] ${Math.round((candidate?.matchConfidence ?? 0.95) * 100)}% (${candidate?.matchReason || 'Online Verified'})`,
    ];

    updatedInput.metadataProvenance = {
      primaryProvider: providerName,
      providerId: request.candidateId,
      sourceUrl: candidate?.sourceUrl,
      discoveredAt: new Date().toISOString(),
      method: 'online_api',
      confidence: candidate?.matchConfidence ?? 0.95,
      fieldSources,
      auditTrace,
      rawBibliographic: candidate || request.incomingValues,
    };

    // Persist changes to database
    await repository.updateBook(updatedInput);

    // Fetch refreshed book item
    const refreshedBook = repository.getById
      ? (await repository.getById(request.workId)) || existingBook
      : (await repository.getAllWorks()).find((b) => b.id === request.workId) || existingBook;

    return {
      success: true,
      workId: request.workId,
      updatedBook: refreshedBook,
      appliedFields,
      skippedFields,
      downloadedCoverPath,
    };
  }
}

export const metadataEnrichmentService = new MetadataEnrichmentService();
