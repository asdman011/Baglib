'use client';

import React, { useState, useMemo } from 'react';
import {
  FileDown,
  X,
  Copy,
  Download,
  Check,
  Sparkles,
  FileText,
  Table,
  Code2,
  BookOpen,
  Layers,
  Archive,
  Zap,
  HelpCircle,
  Eye,
  FileCode,
} from 'lucide-react';
import type { AnnotationDTO } from '../../../shared/types/annotation';
import type {
  BookBibliographicInfo,
  BookWithAnnotations,
  ExportFormat,
  ExportOptions,
} from '../../../shared/types/export';
import {
  exportSingleBook,
  packageMultiBookZip,
} from '../../libs/export/annotation-exporter';
import { AnkiConnectClient } from '../../libs/export/pkm-sync';
import { TranslationKey } from '../../translations';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeBook: BookBibliographicInfo;
  annotations: AnnotationDTO[];
  allBooksWithNotes?: BookWithAnnotations[];
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  direction?: 'rtl' | 'ltr';
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  activeBook,
  annotations,
  allBooksWithNotes = [],
  t,
  direction = 'ltr',
}) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('markdown');
  const [scope, setScope] = useState<'single_book' | 'all_books'>('single_book');
  const [includeFrontmatter, setIncludeFrontmatter] = useState(true);
  const [includeBookmarks, setIncludeBookmarks] = useState(true);
  const [includeTags, setIncludeTags] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSyncingAnki, setIsSyncingAnki] = useState(false);
  const [ankiFeedback, setAnkiFeedback] = useState<{ message: string; isError: boolean } | null>(null);

  // Available formats list
  const formatList: Array<{
    id: ExportFormat;
    label: string;
    ext: string;
    icon: React.ComponentType<{ className?: string }>;
    descKey: TranslationKey;
  }> = [
    {
      id: 'markdown',
      label: 'Academic Markdown',
      ext: '.md',
      icon: FileText,
      descKey: 'formatMarkdownDesc',
    },
    {
      id: 'obsidian',
      label: 'Obsidian Vault',
      ext: '.md',
      icon: Layers,
      descKey: 'formatObsidianDesc',
    },
    {
      id: 'csv',
      label: 'Spreadsheet CSV',
      ext: '.csv',
      icon: Table,
      descKey: 'formatCsvDesc',
    },
    {
      id: 'html',
      label: 'HTML / PDF Print',
      ext: '.html',
      icon: FileCode,
      descKey: 'formatHtmlDesc',
    },
    {
      id: 'txt',
      label: 'Plain Text',
      ext: '.txt',
      icon: FileText,
      descKey: 'formatTxtDesc',
    },
    {
      id: 'anki',
      label: 'Anki Flashcards',
      ext: '.txt',
      icon: Zap,
      descKey: 'formatAnkiDesc',
    },
    {
      id: 'json',
      label: 'JSON Data',
      ext: '.json',
      icon: Code2,
      descKey: 'formatJsonDesc',
    },
  ];

  // Options configuration
  const exportOptions: ExportOptions = useMemo(() => {
    return {
      format: selectedFormat,
      includeFrontmatter,
      includeBookmarks,
      includeTags,
      scope,
      direction,
    };
  }, [selectedFormat, includeFrontmatter, includeBookmarks, includeTags, scope, direction]);

  // Current preview content
  const previewContent = useMemo(() => {
    if (scope === 'all_books' && allBooksWithNotes.length > 0) {
      return `/* Multi-Book ZIP Package containing ${allBooksWithNotes.length} books */\n` +
        allBooksWithNotes.map((b) => `- ${b.book.title} (${b.annotations.length} annotations)`).join('\n');
    }
    const result = exportSingleBook(activeBook, annotations, exportOptions);
    return typeof result.content === 'string' ? result.content : '[Binary Data]';
  }, [activeBook, annotations, allBooksWithNotes, exportOptions, scope]);

  if (!isOpen) return null;

  // Handle Download File
  const handleDownload = () => {
    if (scope === 'all_books' && allBooksWithNotes.length > 0) {
      const zipBytes = packageMultiBookZip(allBooksWithNotes, selectedFormat, exportOptions);
      const blob = new Blob([zipBytes as unknown as BlobPart], { type: 'application/zip' });
      triggerBlobDownload(blob, `Baglib_Annotations_${Date.now()}.zip`);
    } else {
      const result = exportSingleBook(activeBook, annotations, exportOptions);
      const blob = new Blob([result.content as unknown as BlobPart], { type: result.mimeType });
      triggerBlobDownload(blob, result.fileName);
    }
  };

  const triggerBlobDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handle Copy to Clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(previewContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  };

  // Handle AnkiConnect Sync
  const handleSyncToAnki = async () => {
    setIsSyncingAnki(true);
    setAnkiFeedback(null);

    const client = new AnkiConnectClient();
    try {
      const isOnline = await client.checkConnection();
      if (!isOnline) {
        setAnkiFeedback({
          message: t('syncAnkiFailed'),
          isError: true,
        });
        setIsSyncingAnki(false);
        return;
      }

      const deckName = `Baglib::${activeBook.title.replace(/[:;]/g, ' - ')}`;
      const res = await client.syncBookAnnotations(activeBook, annotations, deckName);

      setAnkiFeedback({
        message: t('syncAnkiSuccess', { count: res.created }),
        isError: false,
      });
    } catch (err: any) {
      setAnkiFeedback({
        message: `${t('syncAnkiFailed')} (${err.message || ''})`,
        isError: true,
      });
    } finally {
      setIsSyncingAnki(false);
    }
  };

  return (
    <div
      dir={direction}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 font-sans animate-in fade-in duration-150"
    >
      <div className="bg-surface border border-subtle w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-subtle flex items-center justify-between bg-canvas/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-pale-sky-500/10 border border-pale-sky-500/20 flex items-center justify-center text-pale-sky-500">
              <FileDown className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-main text-sm sm:text-base">
                {t('exportAnnotationsTitle')}
              </h3>
              <p className="text-[11px] text-muted max-w-md line-clamp-1">
                {t('exportModalDesc')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs">
          {/* Scope Selector: Single Book vs All Books */}
          {allBooksWithNotes.length > 1 && (
            <div className="space-y-1.5">
              <span className="font-bold text-muted text-[11px] uppercase tracking-wider">Scope</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScope('single_book')}
                  className={`p-2.5 rounded-xl border flex items-center gap-2 font-bold transition-all cursor-pointer ${
                    scope === 'single_book'
                      ? 'border-pale-sky-500 bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-300 shadow-xs'
                      : 'border-subtle bg-canvas text-muted hover:text-main'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>{t('exportScopeCurrentBook')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScope('all_books')}
                  className={`p-2.5 rounded-xl border flex items-center gap-2 font-bold transition-all cursor-pointer ${
                    scope === 'all_books'
                      ? 'border-pale-sky-500 bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-300 shadow-xs'
                      : 'border-subtle bg-canvas text-muted hover:text-main'
                  }`}
                >
                  <Archive className="w-4 h-4" />
                  <span>{t('exportScopeAllBooks')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Formats Grid */}
          <div className="space-y-1.5">
            <span className="font-bold text-muted text-[11px] uppercase tracking-wider">
              {t('exportFormatLabel')}
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {formatList.map((fmt) => {
                const Icon = fmt.icon;
                const isSelected = selectedFormat === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => {
                      setSelectedFormat(fmt.id);
                      setAnkiFeedback(null);
                    }}
                    className={`p-3 rounded-2xl border text-start flex flex-col justify-between transition-all cursor-pointer group ${
                      isSelected
                        ? 'border-pale-sky-500 bg-pale-sky-500/10 shadow-sm ring-1 ring-pale-sky-500/30'
                        : 'border-subtle bg-canvas hover:border-pale-sky-500/40'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <Icon className={`w-4 h-4 ${isSelected ? 'text-pale-sky-500' : 'text-muted'}`} />
                      <span className="font-mono text-[10px] text-muted">{fmt.ext}</span>
                    </div>
                    <div>
                      <div className="font-bold text-main text-xs">{fmt.label}</div>
                      <p className="text-[10px] text-muted line-clamp-2 mt-0.5 leading-snug">
                        {t(fmt.descKey)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Export Options & Checkboxes */}
          <div className="p-3.5 rounded-2xl bg-canvas border border-subtle space-y-2.5">
            <span className="font-bold text-muted text-[11px] uppercase tracking-wider">Options</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(selectedFormat === 'markdown' || selectedFormat === 'obsidian') && (
                <label className="flex items-center gap-2 cursor-pointer font-medium text-main">
                  <input
                    type="checkbox"
                    checked={includeFrontmatter}
                    onChange={(e) => setIncludeFrontmatter(e.target.checked)}
                    className="rounded border-subtle text-pale-sky-500 accent-pale-sky-500"
                  />
                  <span>YAML Frontmatter</span>
                </label>
              )}
              <label className="flex items-center gap-2 cursor-pointer font-medium text-main">
                <input
                  type="checkbox"
                  checked={includeBookmarks}
                  onChange={(e) => setIncludeBookmarks(e.target.checked)}
                  className="rounded border-subtle text-pale-sky-500 accent-pale-sky-500"
                />
                <span>{t('includeBookmarksLabel')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer font-medium text-main">
                <input
                  type="checkbox"
                  checked={includeTags}
                  onChange={(e) => setIncludeTags(e.target.checked)}
                  className="rounded border-subtle text-pale-sky-500 accent-pale-sky-500"
                />
                <span>{t('includeTagsLabel')}</span>
              </label>
            </div>
          </div>

          {/* Anki Feedback Notification */}
          {ankiFeedback && (
            <div
              className={`p-3 rounded-2xl border text-xs flex items-center gap-2 animate-in fade-in duration-150 ${
                ankiFeedback.isError
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{ankiFeedback.message}</span>
            </div>
          )}

          {/* Collapsible Preview Box */}
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="text-[11px] text-pale-sky-600 dark:text-pale-sky-400 font-bold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{showPreview ? 'Hide Preview' : t('previewExport')}</span>
            </button>
            {showPreview && (
              <pre className="p-3 rounded-2xl bg-canvas border border-subtle text-[11px] font-mono text-muted max-h-48 overflow-y-auto whitespace-pre-wrap select-text">
                {previewContent}
              </pre>
            )}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-subtle bg-canvas/40 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            {/* Copy to Clipboard */}
            {selectedFormat !== 'json' && scope !== 'all_books' && (
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-2 rounded-xl border border-subtle bg-surface hover:bg-canvas text-main font-bold flex items-center gap-1.5 transition-colors cursor-pointer text-xs"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied!' : t('copyExportBtn')}</span>
              </button>
            )}

            {/* Sync to Anki (Direct Local HTTP) */}
            {selectedFormat === 'anki' && scope === 'single_book' && (
              <button
                type="button"
                disabled={isSyncingAnki}
                onClick={handleSyncToAnki}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer text-xs shadow-sm"
              >
                <Zap className="w-4 h-4" />
                <span>{isSyncingAnki ? 'Syncing...' : t('syncAnkiBtn')}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-subtle hover:bg-canvas text-muted hover:text-main font-bold transition-colors cursor-pointer text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="px-4 py-2 rounded-xl bg-pale-sky-500 hover:bg-pale-sky-600 text-white font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer text-xs"
            >
              <Download className="w-4 h-4" />
              <span>{t('downloadExportBtn')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
