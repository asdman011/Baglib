import type { DigitalFormat } from './work';

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
