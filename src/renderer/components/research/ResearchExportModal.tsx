'use client';

import React, { useState } from 'react';
import { X, Download, FileText, Globe, FileCode, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { translations } from '../../translations';
import type { ManuscriptExportFormat } from '../../../shared/manuscript-export';
import type { Manuscript, ManuscriptDocument } from '../../../shared/manuscripts';

interface ResearchExportModalProps {
  language: 'ar' | 'en';
  isOpen: boolean;
  onClose: () => void;
  manuscript: Manuscript;
  currentDocument?: ManuscriptDocument | null;
}

export function ResearchExportModal({
  language,
  isOpen,
  onClose,
  manuscript,
  currentDocument
}: ResearchExportModalProps) {
  const t = translations[language];
  const [format, setFormat] = useState<ManuscriptExportFormat>('pdf');
  const [scope, setScope] = useState<'current' | 'all'>('current');
  const [pageSize, setPageSize] = useState<'A4' | 'Letter'>('A4');
  const [margins, setMargins] = useState<'normal' | 'narrow' | 'wide'>('normal');
  const initialFootnoteNumbering = (() => {
    try {
      const s = manuscript.settings_json ? JSON.parse(manuscript.settings_json) : {};
      return s.footnoteNumbering === 'page' ? 'page' : 'chapter';
    } catch {
      return 'chapter';
    }
  })();
  const [footnoteNumbering, setFootnoteNumbering] = useState<'chapter' | 'page'>(initialFootnoteNumbering);
  const [isExporting, setIsExporting] = useState(false);
  const [resultMessage, setResultMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    setResultMessage(null);
    try {
      const api = window.electronAPI?.manuscripts;
      if (!api?.export) throw new Error('API not available');

      const res = await api.export({
        manuscriptId: manuscript.id,
        documentId: scope === 'current' && currentDocument ? currentDocument.id : undefined,
        format,
        pageSize,
        margins,
        footnoteNumbering: format === 'pdf' ? footnoteNumbering : undefined,
        saveDialog: true
      });

      if (res.savedPath) {
        setResultMessage({
          type: 'success',
          text: `${t.researchExportSuccess}: ${res.filename}`
        });
      } else {
        // User cancelled dialog or no file saved
        setResultMessage(null);
      }
    } catch (err: unknown) {
      setResultMessage({
        type: 'error',
        text: (err as Error).message || t.researchExportFailed
      });
    } finally {
      setIsExporting(false);
    }
  };

  const formats: { id: ManuscriptExportFormat; label: string; icon: React.ReactNode; ext: string }[] = [
    { id: 'pdf', label: t.researchExportPdf, icon: <FileText className="w-5 h-5 text-red-500" />, ext: '.pdf' },
    { id: 'docx', label: t.researchExportDocx, icon: <FileText className="w-5 h-5 text-blue-500" />, ext: '.docx' },
    { id: 'html', label: t.researchExportHtml, icon: <Globe className="w-5 h-5 text-emerald-500" />, ext: '.html' },
    { id: 'markdown', label: t.researchExportMarkdown, icon: <FileCode className="w-5 h-5 text-amber-500" />, ext: '.md' }
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      onKeyDown={e => {
        if (e.key === 'Escape' && !isExporting) onClose();
      }}
    >
      <div className="bg-bg-panel border border-border rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col text-start">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-bg-surface/50">
          <div className="flex items-center gap-2.5">
            <Download className="w-5 h-5 text-brand" />
            <h2 id="export-modal-title" className="text-base font-semibold text-text-primary">
              {t.researchExportModalTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            title={t.close}
            disabled={isExporting}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Scope Selection */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
              {t.researchExportScope}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScope('current')}
                disabled={!currentDocument}
                className={`flex flex-col p-3 rounded-lg border text-start transition-all ${
                  scope === 'current'
                    ? 'border-brand bg-brand/5 ring-1 ring-brand text-brand'
                    : 'border-border bg-bg-surface hover:bg-bg-hover text-text-primary'
                } ${!currentDocument ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className="text-sm font-medium">{t.researchExportScopeCurrent}</span>
                <span className="text-xs text-text-muted truncate mt-0.5">
                  {currentDocument ? currentDocument.title : '—'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`flex flex-col p-3 rounded-lg border text-start transition-all ${
                  scope === 'all'
                    ? 'border-brand bg-brand/5 ring-1 ring-brand text-brand'
                    : 'border-border bg-bg-surface hover:bg-bg-hover text-text-primary'
                }`}
              >
                <span className="text-sm font-medium">{t.researchExportScopeAll}</span>
                <span className="text-xs text-text-muted truncate mt-0.5">{manuscript.title}</span>
              </button>
            </div>
          </div>

          {/* Format Selection */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
              {t.researchExportFormat}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {formats.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border text-start transition-all ${
                    format === f.id
                      ? 'border-brand bg-brand/5 ring-1 ring-brand text-brand font-medium'
                      : 'border-border bg-bg-surface hover:bg-bg-hover text-text-primary'
                  }`}
                >
                  {f.icon}
                  <div className="flex-1 truncate">
                    <div className="text-sm">{f.label}</div>
                    <div className="text-xs text-text-muted font-mono">{f.ext}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Page Setup Options (for PDF and DOCX) */}
          {(format === 'pdf' || format === 'docx') && (
            <div className="p-3.5 bg-bg-surface rounded-lg border border-border space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">{t.researchExportPageSize}</label>
                  <select
                    value={pageSize}
                    onChange={e => setPageSize(e.target.value as 'A4' | 'Letter')}
                    className="w-full text-sm bg-bg-panel border border-border rounded-md px-2.5 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    <option value="A4">A4 (210 × 297 mm)</option>
                    <option value="Letter">Letter (8.5 × 11 in)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-text-muted mb-1.5">{t.researchExportMargins}</label>
                  <select
                    value={margins}
                    onChange={e => setMargins(e.target.value as 'normal' | 'narrow' | 'wide')}
                    className="w-full text-sm bg-bg-panel border border-border rounded-md px-2.5 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    <option value="normal">{t.researchExportMarginsNormal}</option>
                    <option value="narrow">{t.researchExportMarginsNarrow}</option>
                    <option value="wide">{t.researchExportMarginsWide}</option>
                  </select>
                </div>
              </div>

              {format === 'pdf' && (
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">{t.researchExportFootnoteNumbering}</label>
                  <select
                    value={footnoteNumbering}
                    onChange={e => setFootnoteNumbering(e.target.value as 'chapter' | 'page')}
                    className="w-full text-sm bg-bg-panel border border-border rounded-md px-2.5 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    <option value="chapter">{t.researchExportFootnoteNumberingChapter}</option>
                    <option value="page">{t.researchExportFootnoteNumberingPage}</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Status Message */}
          {resultMessage && (
            <div
              className={`p-3 rounded-lg border flex items-start gap-2.5 text-xs ${
                resultMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800'
              }`}
            >
              {resultMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
              )}
              <span className="flex-1 leading-relaxed">{resultMessage.text}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-bg-surface/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand hover:bg-brand/90 disabled:opacity-50 rounded-lg shadow-sm transition-colors"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t.researchExporting}</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>{t.researchExportAction}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
