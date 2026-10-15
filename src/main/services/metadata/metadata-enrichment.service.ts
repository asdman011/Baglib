/**
 * Baglib — Online Metadata Enrichment & Safe Merge Engine (Story 12 / KEY-124)
 *
 * Coordinates querying online providers for candidate editions matching an existing local book,
 * generates non-destructive field diffs, prevents accidental data loss on user-populated fields,
 * and executes atomic multi-field merges with optional local cover caching.
 */

import { BookItem, BookItemInput, DigitalFormat } from '../../../shared/types/work';
import { IWorkRepository } from '../../../shared/types/repository';
import {
  EnrichmentCandidateEdition,
  EnrichmentFieldKey,
  EnrichmentFieldDiff,
  EnrichmentComparison,
  ApplyEnrichmentRequest,
  ApplyEnrichmentResult,
  CandidateEditionsQueryResult,
} from '../../../shared/types/enrichment';
import { DuplicateDetector } from '../search/duplicate-detector';
import { OpenLibrarySearchProvider } from '../search/providers/open-library-search.provider';
import { GoogleBooksSearchProvider } from '../search/providers/google-books-search.provider';
import { InternetArchiveSearchProvider } from '../search/providers/internet-archive-search.provider';
import { GutenbergSearchProvider } from '../search/providers/gutenberg-search.provider';
import { ISearchProvider, UnifiedSearchResult } from '../../../shared/types/search';
import { CoverFetchService, coverFetchService as defaultCoverFetchService } from './cover-fetch.service';
import { normalizeSearchString } from '../../../shared/utils/text-normalizer';

export class MetadataEnrichmentService {
  private providers: ISearchProvider[];
  private coverFetcher: CoverFetchService;

  constructor(options?: ISearchProvider[] | {
    providers?: ISearchProvider[];
    coverFetcher?: CoverFetchService;
  }) {
    if (Array.isArray(options)) {
      this.providers = options;
      this.coverFetcher = defaultCoverFetchService;
    } else {
      this.coverFetcher = options?.coverFetcher || defaultCoverFetchService;
      this.providers = options?.providers || [
        new OpenLibrarySearchProvider(),
        new GoogleBooksSearchProvider(),
        new InternetArchiveSearchProvider(),
        new GutenbergSearchProvider(),
      ];
    }
  }

  /**
   * Discovers candidate editions from online bibliographic catalogs for an existing library book.
   */
  public async findCandidateEditions(work: BookItem): Promise<CandidateEditionsQueryResult> {
    const cleanIsbn = work.isbn ? DuplicateDetector.normalizeIsbn(work.isbn) : undefined;
    const queryTitle = work.title?.trim() || '';
    const queryAuthor = work.author?.trim() || '';

    const candidates: EnrichmentCandidateEdition[] = [];
    const seenCandidateKeys = new Set<string>();

    // 1. Prepare search queries: prioritize ISBN if available, with Title/Author as fallback or companion
    const searchPromises: Promise<UnifiedSearchResult[]>[] = [];

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

    for (const provider of this.providers) {
      if (!provider.isEnabled()) continue;

      // Primary query: search by ISBN if valid, else by Title + Author
      if (cleanIsbn && cleanIsbn.length >= 10) {
        searchPromises.push(
          provider.search({ isbn: cleanIsbn, query: cleanIsbn }, createTimeoutSignal(8000)).catch(() => [])
        );
      }

      if (queryTitle) {
        const textQuery = queryAuthor ? `${queryTitle} ${queryAuthor}` : queryTitle;
        searchPromises.push(
          provider.search(
            { query: textQuery, title: queryTitle, author: queryAuthor },
            createTimeoutSignal(8000)
          ).catch(() => [])
        );
      }
    }

    const settledResults = await Promise.allSettled(searchPromises);

    for (const res of settledResults) {
      if (res.status !== 'fulfilled') continue;

      for (const item of res.value) {
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
        const { confidence, reason } = this.calculateMatchConfidence(work, item);

        // Determine downloadable digital format if available
        let downloadUrl: string | undefined = item.downloadUrl;
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
        });
      }
    }

    // Sort candidates by match confidence descending
    candidates.sort((a, b) => (b.matchConfidence || 0) - (a.matchConfidence || 0));

    return {
      workId: work.id,
      candidates,
      queryUsed: {
        isbn: cleanIsbn,
        title: queryTitle,
        author: queryAuthor,
      },
      totalFound: candidates.length,
    };
  }

  /**
   * Calculates similarity and match confidence between a local book and an online candidate.
   */
  private calculateMatchConfidence(
    work: BookItem,
    candidate: UnifiedSearchResult
  ): { confidence: number; reason: string } {
    const workIsbn = work.isbn ? DuplicateDetector.normalizeIsbn(work.isbn) : undefined;
    const candIsbn = candidate.isbn ? DuplicateDetector.normalizeIsbn(candidate.isbn) : undefined;

    if (workIsbn && candIsbn && workIsbn === candIsbn) {
      return { confidence: 1.0, reason: 'Exact ISBN Match' };
    }

    const normWorkTitle = normalizeSearchString(work.title || '');
    const normCandTitle = normalizeSearchString(candidate.title || '');

    const workAuthorStr =
      work.author ||
      (Array.isArray((work as any).authors) && (work as any).authors.length > 0
        ? (work as any).authors.join(', ')
        : '');
    const candAuthorStr =
      candidate.author ||
      (candidate.authors && candidate.authors.length > 0
        ? candidate.authors.join(', ')
        : '');
    const normWorkAuthor = normalizeSearchString(workAuthorStr);
    const normCandAuthor = normalizeSearchString(candAuthorStr);

    const titlesMatch =
      normWorkTitle === normCandTitle ||
      normWorkTitle.startsWith(normCandTitle) ||
      normCandTitle.startsWith(normWorkTitle);

    const authorsMatch =
      normWorkAuthor &&
      normCandAuthor &&
      (normWorkAuthor === normCandAuthor ||
        normWorkAuthor.includes(normCandAuthor) ||
        normCandAuthor.includes(normWorkAuthor));

    if (titlesMatch && authorsMatch) {
      return { confidence: 0.95, reason: 'Title & Author Match' };
    }

    if (titlesMatch) {
      return { confidence: 0.75, reason: 'Title Match' };
    }

    if (authorsMatch) {
      return { confidence: 0.5, reason: 'Author Match' };
    }

    return { confidence: 0.3, reason: 'Partial Keyword Match' };
  }

  /**
   * Computes a field-by-field diff between current book attributes and candidate edition metadata.
   */
  public computeFieldDiffs(
    currentBook: BookItem,
    candidate: EnrichmentCandidateEdition
  ): EnrichmentComparison {
    const diffs: Record<EnrichmentFieldKey, EnrichmentFieldDiff> = {} as any;

    const checkField = (
      field: EnrichmentFieldKey,
      labelKey: string,
      currentVal: any,
      incomingVal: any
    ) => {
      const hasCurrent = this.isPopulated(currentVal);
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

  private isPopulated(val: any): boolean {
    if (val === undefined || val === null) return false;
    if (typeof val === 'string') return val.trim().length > 0;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'number') return !isNaN(val);
    return true;
  }

  private areValuesDifferent(a: any, b: any): boolean {
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
    } as any;

    let downloadedCoverPath: string | undefined;

    // Process selected fields
    for (const field of request.selectedFields) {
      const incomingVal = request.incomingValues[field];
      if (!this.isPopulated(incomingVal)) {
        skippedFields.push(field);
        continue;
      }

      const currentVal = (existingBook as any)[field];
      const hasCurrent = this.isPopulated(currentVal);

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
      (updatedInput as any)[field] = incomingVal;
      appliedFields.push(field);
    }

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
