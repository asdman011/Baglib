import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DigitalFileValidatorService } from './digital-file-validator.service';
import { EbookMetadataExtractorService } from './ebook-metadata-extractor.service';
import { getDatabase } from '../../database/connection';
import { WorkRepository } from '../../database/repositories/work.repository';
import type {
  DigitalImportOptions,
  DigitalImportResult,
  BatchImportSummary,
} from '../../../shared/types/digital-file';
import type { BookItemInput } from '../../../shared/types/work';

import { QuotaTracker, quotaTracker as defaultQuotaTracker } from '../metadata/quotaTracker';

export class DigitalImportPipelineService {
  private static instance: DigitalImportPipelineService;
  private validator: DigitalFileValidatorService;
  private extractor: EbookMetadataExtractorService;
  private workRepository?: WorkRepository;
  private quotaTracker: QuotaTracker;

  constructor(
    workRepository?: WorkRepository,
    validator?: DigitalFileValidatorService,
    extractor?: EbookMetadataExtractorService,
    quotaTracker: QuotaTracker = defaultQuotaTracker
  ) {
    this.validator = validator || DigitalFileValidatorService.getInstance();
    this.extractor = extractor || EbookMetadataExtractorService.getInstance();
    this.workRepository = workRepository;
    this.quotaTracker = quotaTracker;
  }

  public static getInstance(workRepository?: WorkRepository, quotaTracker?: QuotaTracker): DigitalImportPipelineService {
    if (!this.instance || workRepository || quotaTracker) {
      this.instance = new DigitalImportPipelineService(workRepository, undefined, undefined, quotaTracker);
    }
    return this.instance;
  }

  private getRepository(): WorkRepository {
    if (this.workRepository) {
      return this.workRepository;
    }
    const db = getDatabase();
    return new WorkRepository(db);
  }

  /**
   * Imports a single digital e-book file into the library:
   * 1. Validates magic bytes and format integrity.
   * 2. Extracts embedded metadata (OPF, XMP, EXTH, Info) with graceful fallback to file basename.
   * 3. Computes SHA-256 content hash.
   * 4. Orchestrates atomic database transaction: creates work, author, edition, source, and file_source_detail.
   */
  public async importFile(options: DigitalImportOptions): Promise<DigitalImportResult> {
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
        error: validation.error || `فشل التحقق من صحة الملف: ${fileName} / File validation failed: ${fileName}`,
      };
    }

    try {
      // 2. Read file buffer & compute SHA-256 hash for deduplication
      const fileBuffer = await fs.promises.readFile(filePath);
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      // 3. Extract Embedded Metadata & Cover
      const format = validation.format || options.targetFormat || 'PDF';
      const extracted = await this.extractor.extract(filePath, format);

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
      const contributors = authorList.map((name) => ({
        name,
        role: 'author' as const,
      }));

      // Merge tags
      const mergedTags = Array.from(new Set([...(extracted.tags || []), ...(options.tags || [])]));

      // 5. Build database payload for atomic insertion
      const bookInput: BookItemInput = {
        title,
        author: primaryAuthor,
        contributors: contributors.length > 0 ? contributors : undefined,
        publisher: extracted.publisher,
        publicationYear: extracted.publicationYear,
        isbn: extracted.isbn,
        abstract: extracted.description,
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
        coverImage: extracted.coverDataUrl,
        workType: 'book',
        workTypeId: 'wt-book',
      };

      // 6. Execute atomic insertion via repository
      const createdBook = this.getRepository().addBook(bookInput);

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
          isbn: extracted.isbn,
          description: extracted.description,
          language: extracted.language,
          tags: mergedTags,
          hasCover: Boolean(extracted.coverDataUrl),
          coverDataUrl: extracted.coverDataUrl,
          identifiers: extracted.identifiers,
        },
      };
    } catch (err: any) {
      console.error(`[DigitalImportPipeline] Database insertion failed for ${filePath}:`, err);
      return {
        success: false,
        filePath,
        fileName,
        fileSizeBytes: validation.fileSizeBytes,
        format: validation.format,
        errorCode: 'DB_ERROR',
        error: `خطأ أثناء تسجيل الكتاب في قاعدة البيانات: ${err?.message || err} / Database error registering digital book: ${err?.message || err}`,
      };
    }
  }

  /**
   * Batch imports multiple files, collecting results without aborting on individual failures.
   * If in Quota-Saver mode (>= 750 requests), automated background Google Books queries are suppressed.
   * Books are imported with local/embedded metadata, requiring explicit single-item auto-fill.
   */
  public async importFiles(optionsList: DigitalImportOptions[]): Promise<BatchImportSummary> {
    const results: DigitalImportResult[] = [];
    const isBatch = optionsList.length > 1;
    const isConservation = this.quotaTracker.isConservationMode();

    if (isBatch && isConservation) {
      console.info(
        '[DigitalImportPipeline] Quota-Saver Mode active: Automated background Google Books queries disabled during bulk import. Materials imported with local file metadata; individual auto-fill available upon explicit user request.'
      );
    }

    for (const opt of optionsList) {
      try {
        const result = await this.importFile(opt);
        results.push(result);
      } catch (err: any) {
        results.push({
          success: false,
          filePath: opt.filePath,
          fileName: path.basename(opt.filePath),
          fileSizeBytes: 0,
          errorCode: 'IMPORT_ERROR',
          error: err?.message || 'خطأ غير متوقع أثناء الاستيراد / Unexpected error during import',
        });
      }
    }

    const successfulImports = results.filter((r) => r.success).length;

    return {
      totalFiles: results.length,
      successfulImports,
      failedImports: results.length - successfulImports,
      results,
      bulkAutoFillSuppressed: isBatch && isConservation,
    };
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
