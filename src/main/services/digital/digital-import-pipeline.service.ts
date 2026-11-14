import { LECTURE_EXTENSIONS } from '../../../shared/lectures';
import { cancelledImport, summarizeImports } from '../../../shared/import-batch';
import { errorCode } from '../../../shared/errors';
import path from 'path';
import { hashImportFile } from './import-files';
import { app } from 'electron';
import { getPdfPageCoverService } from '../metadata/pdf-page-cover.service';
import type { DigitalFormat } from '../../../shared/types/work';
import { DigitalFileValidatorService } from './digital-file-validator.service';
import { EbookMetadataExtractorService } from './ebook-metadata-extractor.service';
import { getDatabase } from '../../database/connection';
import { WorkRepository } from '../../database/repositories/work.repository';
import { DuplicateDetectorService } from './duplicate-detector.service';
import type {
  DigitalImportOptions,
  DigitalImportResult,
  BatchImportSummary,
  ImportProgressEvent,
} from '../../../shared/types/digital-file';
import type { BookItemInput } from '../../../shared/types/work';
import { isPlaceholderAuthor, isPlaceholderTitle } from '../../../shared/validators/metadata-validator';

import { QuotaTracker, quotaTracker as defaultQuotaTracker } from '../metadata/quotaTracker';

export class DigitalImportPipelineService {
  private static instance: DigitalImportPipelineService;
  private validator: DigitalFileValidatorService;
  private extractor: EbookMetadataExtractorService;
  private workRepository?: WorkRepository;
  private duplicateDetector?: DuplicateDetectorService;
  private quotaTracker: QuotaTracker;

  constructor(
    workRepository?: WorkRepository,
    validator?: DigitalFileValidatorService,
    extractor?: EbookMetadataExtractorService,
    quotaTracker: QuotaTracker = defaultQuotaTracker,
    duplicateDetector?: DuplicateDetectorService,
    private readonly pdfCoverRenderer?: (filePath: string) => Promise<{ coverUrl: string }>
  ) {
    this.validator = validator || DigitalFileValidatorService.getInstance();
    this.extractor = extractor || EbookMetadataExtractorService.getInstance();
    this.workRepository = workRepository;
    this.quotaTracker = quotaTracker;
    this.duplicateDetector = duplicateDetector;
  }

  public static getInstance(workRepository?: WorkRepository, quotaTracker?: QuotaTracker): DigitalImportPipelineService {
    if (!this.instance || workRepository || quotaTracker) {
      this.instance = new DigitalImportPipelineService(workRepository, undefined, undefined, quotaTracker);
    }
    return this.instance;
  }

  private getDuplicateDetector(): DuplicateDetectorService {
    if (this.duplicateDetector) return this.duplicateDetector;
    return new DuplicateDetectorService(this.getRepository(), this.extractor);
  }

  private getRepository(): WorkRepository {
    if (this.workRepository) {
      return this.workRepository;
    }
    const db = getDatabase();
    return new WorkRepository(db);
  }

  private async extractForImport(filePath: string, format: DigitalFormat) {
    const metadata = await this.extractor.extract(filePath, format);
    if (format === 'PDF' && (this.pdfCoverRenderer || app?.isReady?.())) {
      try {
        const cover = this.pdfCoverRenderer ? await this.pdfCoverRenderer(filePath) : await getPdfPageCoverService().render(filePath, 1);
        return { ...metadata, coverBuffer: undefined, coverDataUrl: undefined, coverPath: cover.coverUrl };
      } catch (error) { throw Object.assign(new Error(`PDF cover rendering failed: ${String(error)}`), { code: 'METADATA_ERROR' }); }
    }
    return metadata;
  }

  /**
   * Imports a single digital e-book file into the library:
   * 1. Validates magic bytes and format integrity.
   * 2. Extracts embedded metadata (OPF, XMP, EXTH, Info) with graceful fallback to file basename.
   * 3. Computes SHA-256 content hash.
   * 4. Orchestrates atomic database transaction: creates work, author, edition, source, and file_source_detail.
   */
  public async importFile(options: DigitalImportOptions, onCreated?: (workId: string) => void): Promise<DigitalImportResult> {
    const { filePath } = options;
    const fileName = path.basename(filePath);

    // 1. Validation Stage (Task 6.1)
    const validation = await this.validator.validateFile(filePath);
    if (!validation.isValid) {
      return {
        success: false,
        filePath,
        fileName,
        fileSizeBytes: validation.fileSizeBytes,
        errorCode: validation.errorCode,
        error: validation.errorCode || 'IMPORT_ERROR',
      };
    }

    try {
      // 2. Read file buffer & compute SHA-256 hash for deduplication
      const fileHash = await hashImportFile(filePath);

      // Check duplicates if requested
      if (options.duplicateAction === 'skip') {
        const dup = await this.getDuplicateDetector().checkDuplicate({
          filePath,
          fileHash,
          fileSizeBytes: validation.fileSizeBytes,
        }, undefined, options.skipExactDuplicatesOnly);

        if (dup.matchType !== 'none') {
          return {
            success: true,
            skipped: true,
            filePath,
            fileName,
            format: validation.format || options.targetFormat || 'PDF',
            fileHash,
            fileSizeBytes: validation.fileSizeBytes,
            workId: dup.existingWork?.id,
            duplicateMatchType: dup.matchType,
            duplicateReason: dup.reason,
            extractedMetadata: dup.existingWork
              ? {
                  title: dup.existingWork.title,
                  author: dup.existingWork.author,
                  publisher: dup.existingWork.publisher,
                  publicationYear:
                    typeof dup.existingWork.publicationYear === 'number'
                      ? dup.existingWork.publicationYear
                      : parseInt(String(dup.existingWork.publicationYear), 10) || undefined,
                  isbn: dup.existingWork.isbn,
                  hasCover: Boolean(dup.existingWork.coverImage),
                }
              : undefined,
          };
        }
      } else if (options.duplicateAction === 'replace') {
        const dup = await this.getDuplicateDetector().checkDuplicate({
          filePath,
          fileHash,
          fileSizeBytes: validation.fileSizeBytes,
        });
        const targetId = options.existingWorkId || dup.existingWork?.id;
        if (targetId) {
          const format = validation.format || options.targetFormat || 'PDF';
          const extracted = await this.extractForImport(filePath, format);
          const existingWork = (this.getRepository().getById(targetId)) || dup.existingWork;

          // Non-Destructive Merge Policy: Existing curated metadata wins!
          const hasCuratedTitle = Boolean(
            existingWork?.title && existingWork.title.trim() !== '' && !isPlaceholderTitle(existingWork.title)
          );
          const finalTitle = hasCuratedTitle && existingWork ? existingWork.title : (extracted.title || fileName);

          const hasCuratedAuthor = Boolean(
            existingWork?.author &&
            existingWork.author.trim() !== '' &&
            existingWork.author !== 'Unknown Author' &&
            existingWork.author !== 'غير معروف' &&
            !isPlaceholderAuthor(existingWork.author)
          );
          const finalAuthor = hasCuratedAuthor
            ? existingWork!.author
            : (extracted.authors?.[0] || existingWork?.author || 'Unknown Author');

          const finalPublisher =
            existingWork?.publisher && existingWork.publisher.trim() !== ''
              ? existingWork.publisher
              : (extracted.publisher || existingWork?.publisher);

          const finalYear =
            existingWork?.publicationYear && Number(existingWork.publicationYear) > 0
              ? existingWork.publicationYear
              : (extracted.publicationYear || existingWork?.publicationYear);

          const finalIsbn =
            existingWork?.isbn && existingWork.isbn.trim() !== ''
              ? existingWork.isbn
              : (extracted.isbn || existingWork?.isbn);

          const finalCover =
            existingWork?.coverImage && existingWork.coverImage.trim() !== ''
              ? existingWork.coverImage
            : (extracted.coverPath || extracted.coverDataUrl || existingWork?.coverImage);

          const finalDescription =
            existingWork?.description && existingWork.description.trim() !== ''
              ? existingWork.description
              : (extracted.description || existingWork?.description);

          const finalEdition =
            existingWork?.edition && existingWork.edition.trim() !== ''
              ? existingWork.edition
              : (extracted.edition || existingWork?.edition);

          this.getRepository().updateBook({
            id: targetId,
            title: finalTitle,
            author: finalAuthor,
            publisher: finalPublisher,
            publicationYear: finalYear,
            isbn: finalIsbn,
            edition: finalEdition,
            editionRawMatch: extracted.editionDetails?.rawMatch,
            editionSource: extracted.editionDetails?.source,
            editionConfidence: extracted.editionDetails?.confidence,
            coverImage: finalCover,
            description: finalDescription,
            filePath: path.resolve(filePath),
            fileHash,
            fileSize: this.formatBytes(validation.fileSizeBytes),
            digitalFormat: format,
            pagesCount: extracted.pagesCount || existingWork?.pagesCount,
            bookType: existingWork?.bookType === 'physical' ? 'hybrid' : 'digital',
          });

          return {
            success: true,
            filePath,
            fileName,
            format,
            workId: targetId,
            fileHash,
            fileSizeBytes: validation.fileSizeBytes,
            extractedMetadata: {
              title: finalTitle,
              author: finalAuthor,
              publisher: finalPublisher,
              publicationYear:
                typeof finalYear === 'number'
                  ? finalYear
                  : finalYear
                  ? parseInt(String(finalYear), 10)
                  : undefined,
              isbn: finalIsbn,
              edition: finalEdition,
              editionDetails: extracted.editionDetails,
              hasCover: Boolean(finalCover),
              coverDataUrl: finalCover,
            },
          };
        }
      } else if (options.duplicateAction === 'add_new_edition') {
        const dup = await this.getDuplicateDetector().checkDuplicate({
          filePath,
          fileHash,
          fileSizeBytes: validation.fileSizeBytes,
        });
        const targetId = options.existingWorkId || dup.existingWork?.id;
        if (targetId && this.getRepository().addEditionToWork) {
          const format = validation.format || options.targetFormat || 'PDF';
          const extracted = await this.extractForImport(filePath, format);
          this.getRepository().addEditionToWork(targetId, {
            edition: options.customTitle ? undefined : extracted.title,
            publisher: extracted.publisher,
            publicationYear: extracted.publicationYear,
            isbn: extracted.isbn,
            language: extracted.language || undefined,
            filePath: path.resolve(filePath),
            fileHash,
            digitalFormat: format,
            fileSize: this.formatBytes(validation.fileSizeBytes),
          });

          return {
            success: true,
            filePath,
            fileName,
            format,
            workId: targetId,
            fileHash,
            fileSizeBytes: validation.fileSizeBytes,
            extractedMetadata: {
              title: extracted.title || fileName,
              author: extracted.authors?.[0] || 'Unknown Author',
              publisher: extracted.publisher,
              publicationYear: extracted.publicationYear,
              isbn: extracted.isbn,
              hasCover: Boolean(extracted.coverPath || extracted.coverDataUrl),
              coverDataUrl: extracted.coverDataUrl,
            },
          };
        }
      }

      // 3. Extract Embedded Metadata & Cover
      const format = validation.format || options.targetFormat || 'PDF';
      const extracted = await this.extractForImport(filePath, format);

      // 4. Resolve Final Bibliographic Fields (User override > Extracted > Fallback)
      const title = (options.customTitle || extracted.title || fileName).trim();
      const isArabic =
        extracted.language?.toLowerCase().startsWith('ar') ||
        extracted.language === 'العربية' ||
        /[\u0600-\u06FF]/.test(title);
      const defaultUnknownAuthor = isArabic ? 'غير معروف' : 'Unknown Author';

      const authorList = options.customAuthor
        ? [options.customAuthor.trim()]
        : (extracted.authors && extracted.authors.length > 0 ? extracted.authors : [defaultUnknownAuthor]);

      const primaryAuthor = authorList[0];
      const mediaImport = (LECTURE_EXTENSIONS as readonly string[]).includes(path.extname(filePath).toLowerCase());
      const contributors = authorList.map((name) => ({
        name,
        role: mediaImport ? 'speaker' as const : 'author' as const,
      }));

      // Merge tags
      const mergedTags = Array.from(new Set([...(extracted.tags || []), ...(options.tags || [])]));

      let initialProvenance: import('../../../shared/types/work').MetadataProvenance | undefined = undefined;
      if (extracted.editionDetails?.rawMatch || extracted.edition) {
        initialProvenance = {
          primaryProvider: 'Local Container Extractor',
          discoveredAt: new Date().toISOString(),
          method: 'offline_embedded',
          confidence: extracted.editionDetails?.confidence || 0.85,
          fieldSources: {
            edition: {
              source: extracted.editionDetails?.rawMatch
                ? extracted.editionDetails.rawMatch
                : (extracted.editionDetails?.source ? `Tier: ${extracted.editionDetails.source}` : 'Local Container Extractor'),
              status: 'extracted',
              value: extracted.edition,
              confidence: extracted.editionDetails?.confidence || 0.85,
              rawMatch: extracted.editionDetails?.rawMatch,
            },
          },
          auditTrace: [
            `[Digital Import] Imported file "${fileName}"`,
            extracted.editionDetails?.rawMatch
              ? `[Edition Engine] ${extracted.editionDetails.rawMatch} -> "${extracted.edition}"`
              : `[Edition Engine] Edition registered on record: "${extracted.edition}"`,
          ],
        };
      }

      // 5. Build database payload for atomic insertion
      const bookInput: BookItemInput = {
        title,
        author: primaryAuthor,
        contributors: contributors.length > 0 ? contributors : undefined,
        publisher: extracted.publisher,
        publicationYear: extracted.publicationYear,
        isbn: extracted.isbn,
        abstract: extracted.description,
        edition: extracted.edition,
        editionRawMatch: extracted.editionDetails?.rawMatch,
        editionSource: extracted.editionDetails?.source,
        editionConfidence: extracted.editionDetails?.confidence,
        metadataProvenance: initialProvenance,
        pagesCount: extracted.pagesCount,
        language: extracted.language || undefined,
        categories: mergedTags,
        tags: mergedTags,
        primaryCategoryId: options.primaryCategoryId || null,
        readingStatus: options.readingStatus || 'unread',
        readingProgress: 0,
        bookType: 'digital',
        digitalFormat: format,
        filePath: path.resolve(filePath),
        fileHash,
        fileSize: this.formatBytes(validation.fileSizeBytes),
        coverImage: extracted.coverPath || extracted.coverDataUrl,
        workType: mediaImport ? 'lecture' : 'book',
        workTypeId: mediaImport ? 'wt-lecture' : 'wt-book',
        speaker: mediaImport ? primaryAuthor : undefined,
        recordingDate: extracted.recordingDate,
      };

      // 6. Execute atomic insertion via repository
      const createdBook = this.getRepository().addBook(bookInput);
      onCreated?.(createdBook.id);

      return {
        success: true,
        filePath,
        fileName,
        format,
        workId: createdBook.id,
        fileHash,
        fileSizeBytes: validation.fileSizeBytes,
        extractedMetadata: {
          title,
          author: primaryAuthor,
          publisher: extracted.publisher,
          publicationYear: extracted.publicationYear,
          edition: extracted.edition,
          editionDetails: extracted.editionDetails,
          pagesCount: extracted.pagesCount,
          isbn: extracted.isbn,
          description: extracted.description,
          language: extracted.language,
          tags: mergedTags,
          hasCover: Boolean(extracted.coverPath || extracted.coverDataUrl),
          coverDataUrl: extracted.coverDataUrl,
          identifiers: extracted.identifiers,
        },
      };
    } catch (err: unknown) {
      console.error(`[DigitalImportPipeline] Import failed for ${filePath}:`, err);
      return {
        success: false,
        filePath,
        fileName,
        fileSizeBytes: validation.fileSizeBytes,
        format: validation.format,
        errorCode: errorCode(err) === 'METADATA_ERROR' ? 'METADATA_ERROR' : 'DB_ERROR',
        error: errorCode(err) === 'METADATA_ERROR' ? 'METADATA_ERROR' : 'DB_ERROR',
      };
    }
  }

  /**
   * Batch imports multiple files, collecting results without aborting on individual failures.
   * If in Quota-Saver mode (>= 750 requests), automated background Google Books queries are suppressed.
   * Books are imported with local/embedded metadata, requiring explicit single-item auto-fill.
   */
  public async importFiles(
    optionsList: DigitalImportOptions[],
    onProgress?: (progress: ImportProgressEvent) => void,
    signal?: AbortSignal,
    folders: string[] = []
  ): Promise<BatchImportSummary> {
    const results: DigitalImportResult[] = [];
    const created = new Set<string>();
    const totalFiles = optionsList.length;
    const isBatch = totalFiles > 1;
    const isConservation = this.quotaTracker.isConservationMode();

    if (isBatch && isConservation) {
      console.info(
        '[DigitalImportPipeline] Quota-Saver Mode active: Automated background Google Books queries disabled during bulk import. Materials imported with local file metadata; individual auto-fill available upon explicit user request.'
      );
    }

    for (let i = 0; i < totalFiles; i++) {
      await new Promise<void>(resolve => setImmediate(resolve));
      const opt = optionsList[i];
      const fileName = path.basename(opt.filePath);
      if (signal?.aborted) {
        results.push(cancelledImport(opt.filePath, fileName));
        continue;
      }

      onProgress?.({
        currentFileIndex: i + 1,
        totalFiles,
        currentFilename: fileName,
        status: 'validating',
        progressPercentage: Math.round((i / totalFiles) * 100),
      });

      try {
        onProgress?.({
          currentFileIndex: i + 1,
          totalFiles,
          currentFilename: fileName,
          status: 'extracting',
          progressPercentage: Math.round((i / totalFiles) * 100),
        });

        const result = await this.importFile(opt, id => created.add(id));
        results.push({ ...result, extractedMetadata: result.extractedMetadata ? { ...result.extractedMetadata, coverDataUrl: undefined } : undefined });

        const status = result.skipped ? 'skipped' : (result.success ? 'completed' : 'failed');
        onProgress?.({
          currentFileIndex: i + 1,
          totalFiles,
          currentFilename: fileName,
          status,
          progressPercentage: Math.round(((i + 1) / totalFiles) * 100),
          error: result.error,
        });
      } catch {
        const errResult: DigitalImportResult = {
          success: false,
          filePath: opt.filePath,
          fileName,
          fileSizeBytes: 0,
          errorCode: 'IMPORT_ERROR',
          error: 'IMPORT_ERROR',
        };
        results.push(errResult);

        onProgress?.({
          currentFileIndex: i + 1,
          totalFiles,
          currentFilename: fileName,
          status: 'failed',
          progressPercentage: Math.round(((i + 1) / totalFiles) * 100),
          error: errResult.error,
        });
      }
    }

    const imported = results.filter(result =>
      result.success && result.workId && created.has(result.workId)
      && (LECTURE_EXTENSIONS as readonly string[]).includes(path.extname(result.filePath).toLowerCase()))
      .map(result => ({ path: result.filePath, workId: result.workId! }));
    if (imported.length) this.getRepository().assignImportedLectureSeries(optionsList.map(option => option.filePath), imported, folders);
    return summarizeImports(results, isBatch && isConservation);
  }

  /**
   * Formats raw bytes to human-readable string (e.g. "1.68 MB")
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}
