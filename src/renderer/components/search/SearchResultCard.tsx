'use client';

import React, { useState } from 'react';
import {
  BookOpen,
  Download,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  BookmarkCheck,
  Loader2,
  FileText,
  Globe,
  Archive,
  Feather,
} from 'lucide-react';
import { UnifiedSearchResult, SearchProviderId } from '../../../shared/types/search';
import { useWorkspace } from '../context/WorkspaceContext';

interface SearchResultCardProps {
  result: UnifiedSearchResult;
  onImport: (result: UnifiedSearchResult, download: boolean) => Promise<boolean>;
  onViewLocal: (workId: string) => void;
}

const PROVIDER_CONFIG: Record<
  SearchProviderId,
  { labelEn: string; labelAr: string; colorClass: string; icon: import('lucide-react').LucideIcon }
> = {
  local: {
    labelEn: 'My Library',
    labelAr: 'مكتبتي',
    colorClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    icon: BookmarkCheck,
  },
  openlibrary: {
    labelEn: 'Open Library',
    labelAr: 'Open Library',
    colorClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
    icon: Globe,
  },
  googlebooks: {
    labelEn: 'Google Books',
    labelAr: 'Google Books',
    colorClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
    icon: BookOpen,
  },
  internetarchive: {
    labelEn: 'Internet Archive',
    labelAr: 'Internet Archive',
    colorClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
    icon: Archive,
  },
  gutenberg: {
    labelEn: 'Project Gutenberg',
    labelAr: 'غوتنبرغ',
    colorClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
    icon: Feather,
  },
};

export const SearchResultCard: React.FC<SearchResultCardProps> = ({
  result,
  onImport,
  onViewLocal,
}) => {
  const { lang, t } = useWorkspace();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [imported, setImported] = useState(false);

  const providerInfo = PROVIDER_CONFIG[result.providerId] || {
    labelEn: result.providerName,
    labelAr: result.providerName,
    colorClass: 'bg-subtle text-muted border-subtle',
    icon: BookOpen,
  };
  const ProviderIcon = providerInfo.icon;

  const hasDownload = Boolean(result.downloadUrl);
  const isInLibrary = Boolean(result.inLibrary || imported);

  const handleImportClick = async (download: boolean) => {
    if (isImporting || isInLibrary) return;
    setIsImporting(true);
    try {
      const ok = await onImport(result, download);
      if (ok) {
        setImported(true);
      }
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col justify-between ${
        isInLibrary
          ? 'bg-canvas/70 border-emerald-500/30 hover:border-emerald-500/50'
          : 'bg-surface border-subtle hover:border-pale-sky-500/40 hover:shadow-lg'
      }`}
    >
      <div className="p-4 flex gap-4 items-start">
        {/* Cover Art / Thumbnail */}
        <div className="w-18 h-26 sm:w-20 sm:h-28 rounded-xl overflow-hidden bg-canvas border border-subtle shrink-0 relative flex items-center justify-center shadow-sm">
          {result.coverUrl || result.thumbnailUrl ? (
            <img
              src={result.coverUrl || result.thumbnailUrl}
              alt={result.title}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                // Fallback to placeholder if cover image 404s
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-2 text-center text-muted">
              <BookOpen className="w-6 h-6 text-pale-sky-500/60 mb-1" />
              <span className="text-[9px] font-bold line-clamp-2 leading-tight">
                {result.title}
              </span>
            </div>
          )}

          {/* Formats badge overlay */}
          {result.availableFormats && result.availableFormats.length > 0 && (
            <div className="absolute bottom-1 end-1 bg-black/75 backdrop-blur-xs text-white text-[9px] font-mono font-bold px-1 rounded">
              {result.availableFormats[0]}
            </div>
          )}
        </div>

        {/* Book Details */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Header Badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${providerInfo.colorClass}`}
            >
              <ProviderIcon className="w-3 h-3" />
              <span>{lang === 'ar' ? providerInfo.labelAr : providerInfo.labelEn}</span>
            </span>

            {isInLibrary && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                <BookmarkCheck className="w-3 h-3" />
                <span>{t('inLibraryBadge')}</span>
              </span>
            )}

            {result.publishYear && (
              <span className="text-[10px] text-muted font-mono bg-canvas px-1.5 py-0.5 rounded border border-subtle">
                {result.publishYear}
              </span>
            )}

            {result.language && (
              <span className="text-[10px] text-muted uppercase font-mono bg-canvas px-1.5 py-0.5 rounded border border-subtle">
                {result.language}
              </span>
            )}
          </div>

          {/* Title */}
          <h3
            className="text-sm font-bold text-main line-clamp-2 leading-snug font-display hover:text-pale-sky-500 transition-colors cursor-pointer"
            title={result.title}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {result.title}
          </h3>

          {/* Author & Publisher */}
          <p className="text-xs text-muted truncate font-serif">
            <span className="font-medium text-main/80">{result.author}</span>
            {result.publisher && ` • ${result.publisher}`}
          </p>

          {/* Subjects Chips */}
          {result.subjects && result.subjects.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap pt-0.5">
              {result.subjects.slice(0, 3).map((sub, i) => (
                <span
                  key={i}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-canvas border border-subtle text-muted truncate max-w-[130px]"
                >
                  {sub}
                </span>
              ))}
            </div>
          )}

          {/* Description Preview */}
          {result.description && (
            <p
              className={`text-xs text-muted/90 leading-relaxed font-sans transition-all ${
                isExpanded ? '' : 'line-clamp-2'
              }`}
            >
              {result.description}
            </p>
          )}

          {/* Expand Toggle */}
          {result.description && result.description.length > 120 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-[11px] font-medium text-pale-sky-600 dark:text-pale-sky-400 flex items-center gap-0.5 hover:underline pt-0.5"
            >
              <span>{isExpanded ? t('searchResultShowLess') : t('searchResultMoreDetails')}</span>
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="px-4 py-2.5 bg-canvas/40 border-t border-subtle flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-muted text-[11px]">
          {result.isbn && (
            <span className="font-mono text-[10px] bg-surface px-1.5 py-0.5 rounded border border-subtle">
              ISBN: {result.isbn}
            </span>
          )}
          {result.sourceUrl && (
            <a
              href={result.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:text-pale-sky-500 inline-flex items-center gap-1 text-[11px]"
              title={t('openInBrowser')}
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* Primary Action Button */}
        <div className="flex items-center gap-1.5">
          {isInLibrary ? (
            <button
              onClick={() => {
                if (result.localWorkId) {
                  onViewLocal(result.localWorkId);
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold transition-all flex items-center gap-1.5 cursor-pointer text-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t('viewInLibrary')}</span>
            </button>
          ) : (
            <>
              {hasDownload ? (
                <button
                  disabled={isImporting}
                  onClick={() => handleImportClick(true)}
                  className="px-3 py-1.5 rounded-xl bg-pale-sky-500 hover:bg-pale-sky-600 text-white font-bold transition-all shadow-sm shadow-pale-sky-500/20 flex items-center gap-1.5 cursor-pointer text-xs disabled:opacity-50"
                >
                  {isImporting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>{isImporting ? t('importingBook') : t('downloadAndImport')}</span>
                </button>
              ) : (
                <button
                  disabled={isImporting}
                  onClick={() => handleImportClick(false)}
                  className="px-3 py-1.5 rounded-xl bg-canvas hover:bg-surface border border-subtle hover:border-pale-sky-500/50 text-main font-bold transition-all flex items-center gap-1.5 cursor-pointer text-xs disabled:opacity-50"
                >
                  {isImporting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-pale-sky-500" />
                  ) : (
                    <BookOpen className="w-3.5 h-3.5 text-pale-sky-500" />
                  )}
                  <span>{isImporting ? t('importingBook') : t('importToLibrary')}</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
