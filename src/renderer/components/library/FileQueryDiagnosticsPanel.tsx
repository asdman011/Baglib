'use client';

import React, { useState } from 'react';
import {
  Terminal,
  ChevronDown,
  ChevronUp,
  FileText,
  Search,
  HardDrive,
  Cpu,
  Layers,
  AlertCircle,
  ExternalLink,
  Tag,
  Hash,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { TechnicalSearchDiagnostics } from '../../../shared/types/enrichment';

interface FileQueryDiagnosticsPanelProps {
  diagnostics?: TechnicalSearchDiagnostics | null;
  searchTitle?: string;
  searchAuthor?: string;
  searchIsbn?: string;
  filePath?: string;
  fileSize?: string | number;
  className?: string;
  defaultExpanded?: boolean;
}

export const FileQueryDiagnosticsPanel: React.FC<FileQueryDiagnosticsPanelProps> = ({
  diagnostics,
  searchTitle,
  searchAuthor,
  searchIsbn,
  filePath,
  fileSize,
  className = '',
  defaultExpanded = false,
}) => {
  const { t, lang, dir } = useWorkspace();
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  // Fallbacks if diagnostics object is partially provided
  const resolvedPath = diagnostics?.filePath || filePath;
  const resolvedFormat = diagnostics?.fileFormat || (resolvedPath?.split('.').pop()?.toUpperCase() || 'PDF');
  const resolvedSize = diagnostics?.fileSizeFormatted || (fileSize ? String(fileSize) : undefined);

  const activeTitle = diagnostics?.activeQuery?.normalizedTitle || searchTitle;
  const activeAuthor = diagnostics?.activeQuery?.normalizedAuthor || searchAuthor;
  const activeIsbn = diagnostics?.activeQuery?.detectedIsbn || searchIsbn;
  const activeQueryString =
    diagnostics?.activeQuery?.queryString ||
    (activeIsbn ? `isbn:${activeIsbn}` : activeAuthor ? `${activeTitle} ${activeAuthor}` : activeTitle);
  const providers = diagnostics?.activeQuery?.providersQueried || ['Google Books', 'Open Library', 'Internet Archive'];

  const embedded = diagnostics?.embeddedDocInfo;
  const filename = diagnostics?.filenameBreakdown;
  const discarded = filename?.discardedArtifacts || [];

  return (
    <div
      className={`rounded-2xl border border-subtle bg-canvas/60 overflow-hidden transition-all text-start ${className}`}
      dir={dir}
    >
      {/* Header bar / Accordion trigger */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2.5 flex items-center justify-between gap-3 bg-surface/50 hover:bg-surface text-start transition-colors cursor-pointer select-none"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
            <Terminal className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-main truncate">
                {t('diagnosticsPanelTitle')}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0">
                {resolvedFormat}
              </span>
              {discarded.length > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                  {lang === 'ar' ? `${discarded.length} شوائب مستبعدة` : `${discarded.length} discarded`}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted truncate mt-0.5">
              {t('diagnosticsPanelSubtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 text-muted">
          <span className="text-[11px] hidden sm:inline font-mono opacity-80">
            {isExpanded ? (lang === 'ar' ? 'إخفاء' : 'Collapse') : (lang === 'ar' ? 'عرض' : 'Expand')}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 opacity-75" />
          ) : (
            <ChevronDown className="w-4 h-4 opacity-75" />
          )}
        </div>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="p-4 space-y-3.5 border-t border-subtle bg-canvas/40 animate-in fade-in duration-150">
          {/* 1. Source File & Format */}
          <div className="p-3 rounded-xl bg-surface/80 border border-subtle space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-main">
              <HardDrive className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <span>{t('sourceFileInfo')}</span>
            </div>

            {resolvedPath ? (
              <div className="space-y-1.5">
                <div className="text-[11px] font-mono text-muted bg-canvas p-2 rounded-lg border border-subtle/80 break-all select-all">
                  {resolvedPath}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-bold">
                    {resolvedFormat}
                  </span>
                  {resolvedSize && (
                    <span className="font-mono">{resolvedSize}</span>
                  )}
                  {filename?.rawFilename && (
                    <span className="text-muted/80 truncate max-w-xs">
                      • {filename.rawFilename}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted italic">
                {t('noFileLinked')}
              </div>
            )}
          </div>

          {/* 2. Side-by-side or stacked: Embedded DocInfo vs Filename Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Embedded DocInfo */}
            <div className="p-3 rounded-xl bg-surface/80 border border-subtle space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-main">
                  <Layers className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                  <span>{t('embeddedDocInfo')}</span>
                </div>
                <span className="text-[10px] text-muted font-mono uppercase">
                  DocInfo / XMP
                </span>
              </div>

              {embedded && (embedded.title || embedded.author || embedded.publisher) ? (
                <div className="space-y-1.5 text-xs">
                  {embedded.title && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-muted text-[11px] shrink-0 w-16">
                        {lang === 'ar' ? 'العنوان:' : 'Title:'}
                      </span>
                      <span className="font-mono text-[11px] text-main break-all bg-canvas px-1.5 py-0.5 rounded border border-subtle">
                        {embedded.title}
                      </span>
                    </div>
                  )}
                  {embedded.author && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-muted text-[11px] shrink-0 w-16">
                        {lang === 'ar' ? 'المؤلف:' : 'Author:'}
                      </span>
                      <span className="font-mono text-[11px] text-main break-all bg-canvas px-1.5 py-0.5 rounded border border-subtle">
                        {embedded.author}
                      </span>
                    </div>
                  )}
                  {embedded.publisher && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-muted text-[11px] shrink-0 w-16">
                        {lang === 'ar' ? 'الناشر:' : 'Publisher:'}
                      </span>
                      <span className="font-mono text-[11px] text-muted">
                        {embedded.publisher}
                      </span>
                    </div>
                  )}
                  {embedded.publicationYear && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-muted text-[11px] shrink-0 w-16">
                        {lang === 'ar' ? 'السنة:' : 'Year:'}
                      </span>
                      <span className="font-mono text-[11px] text-muted">
                        {embedded.publicationYear}
                      </span>
                    </div>
                  )}
                  {embedded.pagesCount && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-muted text-[11px] shrink-0 w-16">
                        {lang === 'ar' ? 'الصفحات:' : 'Pages:'}
                      </span>
                      <span className="font-mono text-[11px] text-muted">
                        {embedded.pagesCount}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-muted italic">
                  {lang === 'ar'
                    ? 'لم يتم العثور على بيانات داخلية صالحة في حاوية الملف'
                    : 'No valid internal embedded tags detected'}
                </div>
              )}
            </div>

            {/* Filename Breakdown */}
            <div className="p-3 rounded-xl bg-surface/80 border border-subtle space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-main">
                  <FileText className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>{t('filenameBreakdown')}</span>
                </div>
                <span className="text-[10px] text-muted font-mono uppercase">
                  Regex Heuristics
                </span>
              </div>

              {filename ? (
                <div className="space-y-1.5 text-xs">
                  {filename.parsedTitle && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-muted text-[11px] shrink-0 w-16">
                        {lang === 'ar' ? 'العنوان:' : 'Title:'}
                      </span>
                      <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 break-all bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        {filename.parsedTitle}
                      </span>
                    </div>
                  )}
                  {filename.parsedAuthor && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-muted text-[11px] shrink-0 w-16">
                        {lang === 'ar' ? 'المؤلف:' : 'Author:'}
                      </span>
                      <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 break-all bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        {filename.parsedAuthor}
                      </span>
                    </div>
                  )}
                  {filename.parsedYear && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-muted text-[11px] shrink-0 w-16">
                        {lang === 'ar' ? 'السنة:' : 'Year:'}
                      </span>
                      <span className="font-mono text-[11px] text-muted">
                        {filename.parsedYear}
                      </span>
                    </div>
                  )}
                  {filename.parsedPublisher && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-muted text-[11px] shrink-0 w-16">
                        {lang === 'ar' ? 'الناشر:' : 'Publisher:'}
                      </span>
                      <span className="font-mono text-[11px] text-muted">
                        {filename.parsedPublisher}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-muted italic">
                  {lang === 'ar' ? 'لا يتوفر تحليل اسم الملف' : 'No filename heuristic tokens'}
                </div>
              )}
            </div>
          </div>

          {/* 3. Discarded Prepress Artifacts if any */}
          {discarded.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{t('discardedPrepressArtifacts')} ({discarded.length})</span>
              </div>
              <div className="space-y-1">
                {discarded.map((art, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono bg-canvas/70 px-2.5 py-1 rounded-lg border border-subtle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.2 rounded text-[9px] uppercase font-bold bg-muted/20 text-muted">
                        {art.field}
                      </span>
                      <span className="line-through text-red-500/80 font-bold">
                        "{art.value}"
                      </span>
                    </div>
                    <span className="text-[10px] text-muted">
                      {art.reason}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Active Search Query Sent to Providers */}
          <div className="p-3 rounded-xl bg-surface/80 border border-subtle space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-main">
                <Search className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span>{t('activeSearchQuery')}</span>
              </div>
              <div className="flex items-center gap-1">
                {providers.map((p, idx) => (
                  <span
                    key={idx}
                    className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-mono text-main bg-canvas p-2 rounded-lg border border-subtle break-all select-all flex items-center justify-between gap-2">
                <span>{activeQueryString || (lang === 'ar' ? 'لا يوجد استعلام محدد' : 'No query string')}</span>
                <span className="text-[9px] text-muted uppercase font-sans shrink-0">
                  {t('rawQueryString')}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-[11px] text-muted pt-0.5">
                {activeTitle && (
                  <div>
                    <span className="font-semibold text-main">{lang === 'ar' ? 'العنوان المعياري: ' : 'Title: '}</span>
                    <span className="font-mono">{activeTitle}</span>
                  </div>
                )}
                {activeAuthor && (
                  <div>
                    <span className="font-semibold text-main">{lang === 'ar' ? 'المؤلف: ' : 'Author: '}</span>
                    <span className="font-mono">{activeAuthor}</span>
                  </div>
                )}
                {activeIsbn && (
                  <div>
                    <span className="font-semibold text-main">ISBN: </span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{activeIsbn}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
