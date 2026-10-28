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

export interface OcrPageResult {
  pageNumber: number;
  text: string;
  lines: OcrLine[];
  words: OcrWord[];
  width: number;
  height: number;
  engine: 'windows_media_ocr' | 'macos_vision' | 'fallback_ocr' | 'paddleocr_vl';
  durationMs: number;
  markdown?: string;
  tables?: Array<{ headers: string[]; rows: string[][] }>;
}

export interface OcrEngineInfo {
  id: 'paddleocr_vl';
  name: string;
  version: string;
  parameters: string;
  device: string;
  modelPath: string;
  isDownloaded: boolean;
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
}

export interface OcrRecognizeDocumentParams {
  filePath: string;
  bookId?: string;
  startPage?: number;
  endPage?: number;
  language?: OcrLanguage;
  autoIndexFts?: boolean;
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
