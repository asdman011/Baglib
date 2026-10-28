'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Clock,
  FileText,
  FolderOpen,
  Play,
  Sparkles,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { BookCoverThumbnail } from '../library/BookCoverThumbnail';
import type { BookItem } from '../../../shared/types/work';
import type { ReadingBookStat } from '../../../shared/types/reading-statistics';

interface ActiveReadsModuleProps {
  onOpenImportWizard?: () => void;
}

export const ActiveReadsModule: React.FC<ActiveReadsModuleProps> = ({
  onOpenImportWizard,
}) => {
  const { books, openBookForReading, setViewMode, setReadingPage, lang, t } = useWorkspace();
  const [bookStatsMap, setBookStatsMap] = useState<Record<string, ReadingBookStat>>({});
  const [lastLocationsMap, setLastLocationsMap] = useState<Record<string, string>>({});
  const [nowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    let alive = true;
    const loadStats = async () => {
      try {
        const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
        if (api?.statistics?.getAllBookStats) {
          const allStats = await api.statistics.getAllBookStats();
          if (alive && Array.isArray(allStats)) {
            const map: Record<string, ReadingBookStat> = {};
            for (const stat of allStats) {
              if (stat?.bookId) map[stat.bookId] = stat;
            }
            setBookStatsMap(map);
          }
        }
        if (api?.reader?.getLastLocation && books.length > 0) {
          const entries = await Promise.all(
            books.slice(0, 12).map(async (b) => {
              if (b.lastReadLocation) return [b.id, b.lastReadLocation] as const;
              try {
                const loc = await api.reader.getLastLocation(b.id);
                return [b.id, loc || ''] as const;
              } catch {
                return [b.id, ''] as const;
              }
            })
          );
          if (alive) {
            const locMap: Record<string, string> = {};
            for (const [id, loc] of entries) {
              if (loc) locMap[id] = loc;
            }
            setLastLocationsMap(locMap);
          }
        }
      } catch {}
    };
    void loadStats();
    return () => {
      alive = false;
    };
  }, [books]);

  // Rank active reads: books with readingStatus === 'reading', or readingProgress > 0, or in bookStatsMap, or with lastReadLocation
  const activeBooks = useMemo(() => {
    const scored = books.map((book) => {
      const stat = bookStatsMap[book.id];
      const loc = book.lastReadLocation || lastLocationsMap[book.id];
      const progress = book.readingProgress || 0;
      const isReading =
        book.readingStatus === 'reading' ||
        (progress > 0 && progress < 100) ||
        Boolean(stat && stat.lastOpen > 0) ||
        Boolean(loc);
      const lastOpenTs = stat?.lastOpen
        ? stat.lastOpen * 1000
        : book.createdAt
        ? new Date(book.createdAt).getTime()
        : 0;
      return { book, stat, loc, isReading, lastOpenTs };
    });

    const readingOnly = scored.filter((item) => item.isReading);
    const list = readingOnly.length > 0 ? readingOnly : scored.slice(0, 4);

    return list
      .sort((a, b) => {
        if (a.book.readingStatus === 'reading' && b.book.readingStatus !== 'reading') return -1;
        if (b.book.readingStatus === 'reading' && a.book.readingStatus !== 'reading') return 1;
        if (b.lastOpenTs !== a.lastOpenTs) return b.lastOpenTs - a.lastOpenTs;
        return (b.book.readingProgress || 0) - (a.book.readingProgress || 0);
      })
      .slice(0, 4);
  }, [books, bookStatsMap, lastLocationsMap]);

  const formatLastRead = (timestampMs: number): string => {
    if (!timestampMs || !Number.isFinite(timestampMs)) return t('dashJustNow');
    const diffMins = Math.max(0, Math.floor((nowMs - timestampMs) / 60_000));
    if (diffMins < 2) return t('dashJustNow');
    try {
      const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar' : 'en', { numeric: 'auto' });
      if (diffMins < 60) return rtf.format(-diffMins, 'minute');
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return rtf.format(-diffHours, 'hour');
      const diffDays = Math.floor(diffHours / 24);
      return rtf.format(-diffDays, 'day');
    } catch {
      return new Date(timestampMs).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US');
    }
  };

  const handleResumeBook = (book: BookItem, resolvedPage: number) => {
    openBookForReading(book);
    if (resolvedPage > 1) {
      setReadingPage(resolvedPage);
    }
  };

  return (
    <section
      data-dashboard-module="active-reads"
      aria-label={t('dashActiveReadsTitle')}
      className="rounded-2xl border border-subtle bg-surface p-4 shadow-sm space-y-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-2xl bg-pale-sky-500/10 border border-pale-sky-500/20 text-pale-sky-600 dark:text-pale-sky-400 shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display font-bold text-base text-main truncate">
              {t('dashActiveReadsTitle')}
            </h2>
            <p className="text-xs text-muted truncate">{t('dashActiveReadsSubtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setViewMode('library')}
          className="px-3 py-1.5 rounded-xl border border-subtle bg-canvas hover:bg-surface text-xs font-bold text-main transition-colors cursor-pointer"
        >
          {t('dashOpenLibraryAction')}
        </button>
      </header>

      {activeBooks.length === 0 ? (
        <div
          data-active-reads-empty
          className="rounded-2xl border border-dashed border-subtle bg-canvas/50 p-4 text-center space-y-2"
        >
          <div className="w-12 h-12 rounded-2xl bg-pale-sky-500/10 text-pale-sky-500 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="font-display font-bold text-sm text-main">
              {t('dashEmptyReadsTitle')}
            </h3>
            <p className="text-xs text-muted leading-relaxed">{t('dashEmptyReadsDesc')}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setViewMode('library')}
              className="px-4 py-2 rounded-xl bg-pale-sky-600 hover:bg-pale-sky-700 text-white text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              {t('dashOpenLibraryAction')}
            </button>
            {onOpenImportWizard && (
              <button
                type="button"
                onClick={onOpenImportWizard}
                className="px-4 py-2 rounded-xl border border-subtle bg-surface hover:bg-canvas text-xs font-bold text-main inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                {t('dashImportBookAction')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
          {activeBooks.map(({ book, stat, loc, lastOpenTs }) => {
            const totalPages = Math.max(1, book.pagesCount || stat?.pages || 100);
            let parsedLocPage = NaN;
            if (loc) {
              if (/^\d+$/.test(loc.trim())) {
                parsedLocPage = parseInt(loc.trim(), 10);
              } else {
                try {
                  const obj = JSON.parse(loc);
                  if (typeof obj?.page === 'number') parsedLocPage = obj.page;
                } catch {}
              }
            }
            const currentPage =
              !Number.isNaN(parsedLocPage) && parsedLocPage > 0
                ? Math.min(totalPages, parsedLocPage)
                : book.readingProgress
                ? Math.max(1, Math.round((book.readingProgress / 100) * totalPages))
                : Math.max(1, stat?.totalReadPages || 1);

            const percent =
              typeof book.readingProgress === 'number' && book.readingProgress > 0
                ? Math.min(100, Math.round(book.readingProgress))
                : Math.min(100, Math.round((currentPage / totalPages) * 100));

            const remainingPages = Math.max(0, totalPages - currentPage);
            const secsPerPage = stat?.medianPageDurationSecs || 90;
            const remainingMinutes = Math.max(1, Math.round((remainingPages * secsPerPage) / 60));
            const formatBadge =
              book.digitalFormat ||
              (book.filePath?.toLowerCase().endsWith('.epub') ? 'EPUB' : 'PDF');

            return (
              <article
                key={book.id}
                data-active-read-card={book.id}
                className="rounded-2xl border border-subtle bg-canvas/60 hover:border-pale-sky-500/40 p-4 flex gap-4 transition-all group"
              >
                {/* Cover Thumbnail */}
                <div className="w-20 h-28 rounded-xl overflow-hidden border border-subtle shrink-0 bg-surface shadow-xs">
                  <BookCoverThumbnail
                    url={book.coverImage}
                    title={book.title}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Metadata & Progress */}
                <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3
                        dir="auto"
                        className="font-bold text-sm text-main truncate leading-snug"
                        title={book.title}
                      >
                        {book.title}
                      </h3>
                      <span className="px-2 py-0.5 rounded-md bg-pale-sky-500/10 border border-pale-sky-500/20 text-[10px] font-mono font-bold text-pale-sky-600 dark:text-pale-sky-300 shrink-0 uppercase">
                        {formatBadge}
                      </span>
                    </div>
                    <p dir="auto" className="text-xs text-muted truncate">
                      {book.author}
                    </p>
                  </div>

                  {/* Progress Bar & Metrics */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-muted">
                      <span>
                        {loc && loc.startsWith('epubcfi')
                          ? `CFI · ${percent}%`
                          : t('dashCurrentPosition', { page: currentPage, total: totalPages })}
                      </span>
                      <span className="font-mono font-bold text-main">{percent}%</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuenow={percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="h-2 rounded-full bg-subtle/60 overflow-hidden"
                    >
                      <div
                        className="h-full rounded-full bg-pale-sky-500 transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-500" />
                        {t('dashEstimatedRemaining', { minutes: remainingMinutes })}
                      </span>
                      <span>
                        {t('dashLastReadAt', { time: formatLastRead(lastOpenTs) })}
                      </span>
                    </div>
                  </div>

                  {/* Primary Action: Resume Reading */}
                  <div className="pt-1">
                    <button
                      type="button"
                      data-resume-reading={book.id}
                      onClick={() => handleResumeBook(book, currentPage)}
                      className="w-full py-1.5 px-3 rounded-xl bg-pale-sky-600 hover:bg-pale-sky-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current rtl:rotate-180" />
                      {t('dashResumeReading')}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
