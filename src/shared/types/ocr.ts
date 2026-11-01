/**
 * OCR Engine Data Types & Interfaces for Baglib (Task 3.2 / KEY-141)
 */

export type OcrLanguage =
  | 'auto'
  | 'ar'
  | 'ar-SA'
  | 'en'
  | 'en-US'
  | 'fr'
  | 'fr-FR'
  | 'ja'
  | 'ja-JP'
  | string;

export interface OcrBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrWord {
  text: string;
  bbox: OcrBoundingBox;
  confidence?: number;
}

export interface OcrLine {
  text: string;
  words: OcrWord[];
  bbox: OcrBoundingBox;
}

/** The engines a reader can choose. Windows OCR is only ever a fallback. */
export type OcrEngineId = 'ocrmypdf' | 'paddleocr_vl';

export const DEFAULT_OCR_ENGINE: OcrEngineId = 'ocrmypdf';

export interface OcrPageResult {
  pageNumber: number;
  text: string;
  lines: OcrLine[];
  words: OcrWord[];
  width: number;
  height: number;
  /** The engine that actually produced this text. */
  engine: 'windows_media_ocr' | 'macos_vision' | 'fallback_ocr' | OcrEngineId;
  durationMs: number;
  markdown?: string;
  tables?: Array<{ headers: string[]; rows: string[][] }>;
  /** The chosen engine, and why the OS engine answered in its place. */
  requestedEngine?: OcrEngineId;
  fallbackReason?: OcrFallbackReason;
  missingPackages?: string[];
}

export type OcrFallbackReason = 'runtime-missing' | 'model-missing' | 'engine-failed' | 'empty-result';

export interface OcrEngineInfo {
  id: OcrEngineId;
  name: string;
  version: string;
  parameters: string;
  device: string;
  modelPath: string;
  isDownloaded: boolean;
  /** False until the engine's programs and Python packages are all present. */
  runtimeReady: boolean;
  missingPackages: string[];
  existingFilesCount?: number;
  totalExpectedFiles?: number;
  downloadedMb?: number;
  supportedLanguages: string[];
}

export interface OcrModelDownloadProgress {
  status: 'downloading' | 'file_complete' | 'completed' | 'error' | 'already_downloaded';
  file?: string;
  fileIndex?: number;
  totalFiles?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  percent?: number;
  speedMb?: number;
  error?: string;
}

export interface OcrDocumentResult {
  bookId?: string;
  filePath: string;
  totalPages: number;
  recognizedPages: number;
  pages: OcrPageResult[];
  fullText: string;
  durationMs: number;
}

export interface OcrRecognizePageParams {
  imageBufferOrBase64?: string | Buffer;
  filePath?: string;
  pageNumber?: number;
  language?: OcrLanguage;
  /** Defaults to the reader's saved choice. */
  engine?: OcrEngineId;
}

export interface OcrRecognizeDocumentParams {
  filePath: string;
  bookId?: string;
  startPage?: number;
  endPage?: number;
  language?: OcrLanguage;
  autoIndexFts?: boolean;
  /** Defaults to the reader's saved choice. */
  engine?: OcrEngineId;
}

export interface OcrProgressPayload {
  bookId?: string;
  currentPage: number;
  totalPages: number;
  percentage: number;
  recognizedWords: number;
  status: 'running' | 'completed' | 'failed';
  error?: string;
}
