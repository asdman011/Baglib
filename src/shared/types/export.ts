/**
 * Baglib — Annotation Exporter & PKM Knowledge Sync Types (KEY-138)
 */

import type { AnnotationDTO } from './annotation';

export type ExportFormat =
  | 'markdown'
  | 'obsidian'
  | 'csv'
  | 'html'
  | 'txt'
  | 'pdf'
  | 'json'
  | 'anki';

export interface BookBibliographicInfo {
  id?: string;
  title: string;
  author?: string | null;
  isbn?: string | null;
  publishedYear?: number | null;
  year?: string | null;
  publisher?: string | null;
  format?: string | null;
  filePath?: string | null;
  coverUrl?: string | null;
}

export interface ExportOptions {
  format: ExportFormat;
  includeFrontmatter?: boolean;
  includeTags?: boolean;
  includeBookmarks?: boolean;
  includeInkSummary?: boolean;
  scope?: 'single_book' | 'all_books';
  ankiDeckName?: string;
  obsidianVaultPath?: string;
  direction?: 'rtl' | 'ltr';
}

export interface BookWithAnnotations {
  book: BookBibliographicInfo;
  annotations: AnnotationDTO[];
}

export interface ExportResult {
  fileName: string;
  mimeType: string;
  content: string | Uint8Array;
  isBinary: boolean;
  itemCount: number;
  format?: ExportFormat;
}

export interface AnkiCardData {
  front: string;
  back: string;
  deckName?: string;
  modelName?: string;
  tags?: string[];
}

export interface AnkiConnectRequest {
  action: string;
  version: number;
  params?: Record<string, unknown>;
}

export interface AnkiConnectResponse<T = unknown> {
  result: T | null;
  error: string | null;
}

export interface NotionPagePayload {
  parent: { database_id: string } | { page_id: string };
  properties: Record<string, unknown>;
  children: Array<Record<string, unknown>>;
}

export interface JoplinNotePayload {
  title: string;
  body: string;
  parent_id?: string;
  tags?: string[];
  source_url?: string;
}

export interface ReadwiseHighlightPayload {
  highlights: Array<{
    text: string;
    title: string;
    author?: string;
    source_type?: string;
    category?: string;
    note?: string;
    location?: number;
    location_type?: string;
    highlighted_at?: string;
    tags?: Array<{ name: string }>;
  }>;
}

export interface IPKMSyncAdapter {
  id: string;
  name: string;
  formatData(book: BookBibliographicInfo, annotations: AnnotationDTO[], options?: ExportOptions): ExportResult;
}
