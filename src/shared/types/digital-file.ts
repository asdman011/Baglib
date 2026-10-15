import type { DigitalFormat } from './work';
export type { DigitalFormat };

export type DigitalFileErrorCode =
  | 'FILE_NOT_FOUND'
  | 'EMPTY_FILE'
  | 'UNSUPPORTED_FORMAT'
  | 'CORRUPTED_FILE'
  | 'SIGNATURE_MISMATCH'
  | 'READ_ERROR';

export interface DigitalFileValidationResult {
  /**
   * Indicates whether the file is a recognized, valid, and supported digital e-book format.
   */
  isValid: boolean;

  /**
   * Detected canonical format (PDF, EPUB, MOBI, AZW3, HTML, TXT).
   */
  format?: DigitalFormat;

  /**
   * Standard IANA MIME type for the validated format.
   */
  mimeType?: string;

  /**
   * Absolute path to the file on disk (if validated from disk).
   */
  filePath?: string;

  /**
   * Basename of the file including extension.
   */
  fileName: string;

  /**
   * Lowercase extension including dot (e.g. '.pdf', '.epub').
   */
  extension: string;

  /**
   * File size in bytes.
   */
  fileSizeBytes: number;

  /**
   * Human-readable description of the detected byte signature (e.g. '%PDF-1.4', 'PK/EPUB', 'BOOKMOBI').
   */
  signatureDetected?: string;

  /**
   * Human-readable error message (bilingual Arabic & English) when isValid is false.
   */
  error?: string;

  /**
   * Machine-readable error code for structured UI handling.
   */
  errorCode?: DigitalFileErrorCode;

  /**
   * Structural hints discovered during magic-byte inspection (e.g. PDF encryption, HTML title).
   */
  metadataHint?: {
    isEncrypted?: boolean;
    title?: string;
    charset?: string;
  };
}

export interface BatchValidationSummary {
  totalFiles: number;
  validFiles: number;
  invalidFiles: number;
  results: DigitalFileValidationResult[];
}

export interface ExtractedEbookMetadata {
  title?: string;
  authors: string[];
  publisher?: string;
  publicationYear?: number;
  isbn?: string;
  description?: string;
  language?: string;
  tags: string[];
  coverBuffer?: Buffer;
  coverMimeType?: string;
  coverDataUrl?: string;
  identifiers: Record<string, string>;
  format: DigitalFormat;
}

export type FileStorageStatus = 'available' | 'missing' | 'unmounted' | 'corrupted' | 'duplicate';

export interface FileHealthInfo {
  workId: string;
  sourceId?: string;
  editionId?: string;
  title: string;
  author?: string;
  filePath?: string;
  format?: DigitalFormat;
  status: FileStorageStatus;
  fileSizeBytes?: number;
  exists: boolean;
  lastVerified?: string;
  fileHash?: string;
  errorReason?: string;
  isDuplicate?: boolean;
  duplicateGroupHash?: string;
}

export interface StorageHealthSummary {
  totalDigitalWorks: number;
  totalFiles: number;
  availableFiles: number;
  missingFiles: number;
  unmountedFiles: number;
  corruptedFiles: number;
  duplicateFiles: number;
  totalSizeBytes: number;
  reclaimableSizeBytes: number;
  formatBreakdown: Record<string, { count: number; totalBytes: number }>;
  items: FileHealthInfo[];
}

export interface RelinkResult {
  success: boolean;
  workId: string;
  sourceId?: string;
  newFilePath: string;
  fileSizeBytes?: number;
  format?: DigitalFormat;
  error?: string;
}

export interface BatchRebindMatch {
  workId: string;
  sourceId?: string;
  title: string;
  oldPath: string;
  newPath: string;
  matchType: 'hash' | 'filename';
  confidence: number;
}

export interface BatchRebindResult {
  scannedFilesCount: number;
  resolvedCount: number;
  unresolvedCount: number;
  matches: BatchRebindMatch[];
  errors: string[];
}

export interface StorageDuplicateItem {
  workId: string;
  sourceId: string;
  title: string;
  author?: string;
  filePath: string;
  fileSizeBytes: number;
  isPrimary: boolean;
}

export interface StorageDuplicateGroup {
  hash: string;
  fileSizeBytes: number;
  format?: DigitalFormat;
  count: number;
  wastedBytes: number;
  items: StorageDuplicateItem[];
}

export interface StorageAnalytics {
  totalDigitalWorks: number;
  totalFiles: number;
  totalSizeBytes: number;
  reclaimableBytes: number;
  healthCounts: {
    available: number;
    missing: number;
    unmounted: number;
    corrupted: number;
    duplicate: number;
  };
  formatDistribution: Record<string, { count: number; totalBytes: number }>;
  duplicateGroups: StorageDuplicateGroup[];
}

export interface PruneDuplicateOptions {
  primaryWorkId: string;
  duplicateWorkId: string;
  deleteFileFromDisk?: boolean;
  deletePhysicalFile?: boolean;
}

export interface PruneDuplicateResult {
  success: boolean;
  deletedWorkId?: string;
  freedBytes: number;
  fileDeletedFromDisk: boolean;
  error?: string;
}

export type DuplicateMatchType = 'exact_file' | 'same_edition' | 'potential_duplicate' | 'none';

export type DuplicateResolutionAction = 'skip' | 'add_new_edition' | 'replace' | 'import_anyway';

export interface DuplicateDetectionResult {
  filePath: string;
  fileName: string;
  fileHash?: string;
  fileSizeBytes?: number;
  matchType: DuplicateMatchType;
  confidence: number;
  reason: string;
  existingWork?: import('./work').BookItem;
  candidateMetadata?: {
    title?: string;
    author?: string;
    isbn?: string;
    format?: DigitalFormat;
    publicationYear?: number;
  };
}

export type ImportProgressStatus =
  | 'validating'
  | 'extracting'
  | 'checking_duplicates'
  | 'saving'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface ImportProgressEvent {
  currentFileIndex: number;
  totalFiles: number;
  currentFilename: string;
  status: ImportProgressStatus;
  progressPercentage: number;
  error?: string;
}

export interface DigitalImportOptions {
  filePath: string;
  targetFormat?: DigitalFormat;
  customTitle?: string;
  customAuthor?: string;
  readingStatus?: 'unread' | 'reading' | 'completed' | 'paused' | 'abandoned';
  primaryCategoryId?: string | null;
  tags?: string[];
  duplicateAction?: DuplicateResolutionAction;
  existingWorkId?: string;
}

export interface DigitalImportResult {
  success: boolean;
  filePath: string;
  fileName: string;
  format?: DigitalFormat;
  workId?: string;
  editionId?: string;
  sourceId?: string;
  fileHash?: string;
  fileSizeBytes: number;
  skipped?: boolean;
  duplicateReason?: string;
  duplicateMatchType?: DuplicateMatchType;
  extractedMetadata?: {
    title: string;
    author: string;
    publisher?: string;
    publicationYear?: number;
    isbn?: string;
    description?: string;
    language?: string;
    tags?: string[];
    hasCover: boolean;
    coverDataUrl?: string;
    identifiers?: Record<string, string>;
  };
  error?: string;
  errorCode?: DigitalFileErrorCode | 'IMPORT_ERROR' | 'DB_ERROR';
}

export interface BatchImportSummary {
  totalFiles: number;
  successfulImports: number;
  failedImports: number;
  skippedImports: number;
  results: DigitalImportResult[];
  bulkAutoFillSuppressed?: boolean;
}

