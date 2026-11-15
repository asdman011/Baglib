export type ManuscriptExportFormat = 'markdown' | 'html' | 'pdf' | 'docx';

export interface ManuscriptExportOptions {
  manuscriptId: string;
  documentId?: string;
  format: ManuscriptExportFormat;
  pageSize?: 'A4' | 'Letter';
  margins?: 'normal' | 'narrow' | 'wide';
}

export interface ManuscriptExportResult {
  format: ManuscriptExportFormat;
  filename: string;
  mimeType: string;
  content?: string;
  base64?: string;
}

export interface ManuscriptImportQuickNoteInput {
  manuscriptId: string;
  noteId: string;
  parentId?: string | null;
  title?: string;
}

export interface ManuscriptImportMarkdownInput {
  manuscriptId: string;
  markdown: string;
  title?: string;
  parentId?: string | null;
}

export interface QuickNoteItem {
  id: string;
  title: string;
  snippet: string;
  tags: string[];
  updatedAt: string;
}

export function sanitizeExportFilename(title: string, fallback = 'manuscript'): string {
  const clean = title.replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim();
  return (clean || fallback).slice(0, 80);
}

export function manuscriptExportFilename(title: string, format: ManuscriptExportFormat): string {
  const base = sanitizeExportFilename(title, 'manuscript');
  const ext = format === 'markdown' ? 'md' : format;
  return `${base}.${ext}`;
}

export function exportMimeType(format: ManuscriptExportFormat): string {
  switch (format) {
    case 'markdown':
      return 'text/markdown; charset=utf-8';
    case 'html':
      return 'text/html; charset=utf-8';
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
}
