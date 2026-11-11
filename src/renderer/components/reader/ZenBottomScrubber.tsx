'use client';

import React from 'react';
import { RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import type { TranslationKey } from '../../translations';

interface ZenBottomScrubberProps {
  isVisible: boolean;
  readingPage: number;
  maxBookPages: number;
  onPageChange: (page: number) => void;
  previousPage: number | null;
  onReturnToPrevious: () => void;
  readerDirection: 'rtl' | 'ltr';
  chapterLabel?: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const ZenBottomScrubber: React.FC<ZenBottomScrubberProps> = ({
  isVisible,
  readingPage,
  maxBookPages,
  onPageChange,
  previousPage,
  onReturnToPrevious,
  readerDirection,
  chapterLabel,
  onMouseEnter,
  onMouseLeave,
  t,
}) => {
  const percent = Math.min(100, Math.max(0, Math.round((readingPage / maxBookPages) * 100)));

  return (
    <div
      role="region"
      aria-label={t('zenProgressScrubber')}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed bottom-4 left-1/2 z-40 select-none"
      style={{
        transform: isVisible ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(32px)',
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
        transition: 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease',
      }}
    >
      <div className="backdrop-blur-xl bg-surface/90 border border-subtle/70 shadow-2xl rounded-full px-4 py-2 flex items-center gap-3 text-xs font-sans text-muted">
        {/* Previous Page Jump Button */}
        <button
          disabled={readingPage <= 1}
          onClick={() => onPageChange(Math.max(1, readingPage - 1))}
          className="p-1 rounded-full hover:bg-canvas border border-subtle/60 text-muted hover:text-main disabled:opacity-30 transition-all cursor-pointer"
          title={t('paginationPrevious')}
         aria-label={t('paginationPrevious')}>
          <ChevronRight className="w-3.5 h-3.5 rtl:rotate-0 ltr:rotate-180" />
        </button>

        {/* Return to Previous Jump Position (e.g. from Footnote or TOC link) */}
        {previousPage !== null && previousPage !== readingPage && (
          <button
            onClick={onReturnToPrevious}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-pale-sky-500/10 hover:bg-pale-sky-500/20 text-pale-sky-600 dark:text-pale-sky-300 font-bold text-[11px] border border-pale-sky-500/20 transition-all cursor-pointer"
            title={t('returnToPrevPos')}
           aria-label={t('returnToPrevPos')}>
            <RotateCcw className="w-3 h-3" />
            <span>{t('jumpToPreviousNotice', { page: previousPage })}</span>
          </button>
        )}

        {/* Interactive Timeline Range Slider */}
        <div className="flex items-center gap-2 min-w-[160px] sm:min-w-[220px]">
          <input
            type="range"
            min={1}
            max={maxBookPages}
            value={readingPage}
            dir={readerDirection}
            onChange={(e) => onPageChange(parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-subtle/50 rounded-lg appearance-none cursor-pointer accent-pale-sky-500 transition-all"
            aria-label={t('zenPageSlider')}
          />
        </div>

        {/* Page counter & Percent */}
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-main font-bold shrink-0">
          <span>{readingPage}</span>
          <span className="text-muted font-normal">/</span>
          <span className="text-muted font-normal">{maxBookPages}</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-canvas border border-subtle/50 text-muted font-normal ms-1">
            {percent}%
          </span>
        </div>

        {/* Next Page Jump Button */}
        <button
          disabled={readingPage >= maxBookPages}
          onClick={() => onPageChange(Math.min(maxBookPages, readingPage + 1))}
          className="p-1 rounded-full hover:bg-canvas border border-subtle/60 text-muted hover:text-main disabled:opacity-30 transition-all cursor-pointer"
          title={t('paginationNext')}
         aria-label={t('paginationNext')}>
          <ChevronLeft className="w-3.5 h-3.5 rtl:rotate-0 ltr:rotate-180" />
        </button>
      </div>
    </div>
  );
};
