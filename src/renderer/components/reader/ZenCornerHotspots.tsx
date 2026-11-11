'use client';

import React, { useState, useEffect } from 'react';
import { Bookmark, Maximize2, Minimize2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { TranslationKey } from '../../translations';

interface ZenCornerHotspotsProps {
  isCurrentPageBookmarked: boolean;
  onToggleBookmark: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  readerDirection: 'rtl' | 'ltr';
  canGoPrev: boolean;
  canGoNext: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const ZenCornerHotspots: React.FC<ZenCornerHotspotsProps> = ({
  isCurrentPageBookmarked,
  onToggleBookmark,
  onPrevPage,
  onNextPage,
  readerDirection,
  canGoPrev,
  canGoNext,
  t,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.warn);
    } else {
      document.exitFullscreen().catch(console.warn);
    }
  };

  return (
    <>
      {/* Top-End Corner Hotspot (64px x 64px) */}
      <div
        className="fixed top-0 end-0 w-20 h-20 z-40 flex items-start justify-end p-2.5 pointer-events-auto group select-none"
        aria-label={t('zenCornerActions')}
      >
        {/* Bookmark Ribbon Hanging from Top Page Margin */}
        {isCurrentPageBookmarked && (
          <div
            onClick={onToggleBookmark}
            title={t('oneClickBookmark')}
            className="absolute top-0 end-4 w-6 h-10 bg-amber-500 shadow-md rounded-b flex items-end justify-center pb-1 text-white z-20 cursor-pointer hover:h-11 transition-all"
          >
            <Bookmark className="w-3.5 h-3.5 fill-current" />
          </div>
        )}

        {/* Hover Controls (Bookmark Ribbon toggle & Fullscreen F11) */}
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-md bg-surface/85 border border-subtle/70 rounded-full p-1 shadow-lg">
          <button
            onClick={onToggleBookmark}
            title={t('oneClickBookmark')}
            className={`p-1.5 rounded-full transition-colors cursor-pointer ${
              isCurrentPageBookmarked
                ? 'bg-amber-500 text-white'
                : 'text-muted hover:text-amber-500 hover:bg-canvas'
            }`}
           aria-label={t('oneClickBookmark')}>
            <Bookmark className={`w-3.5 h-3.5 ${isCurrentPageBookmarked ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={toggleFullscreen}
            title={t('fullscreenToggle')}
            className="p-1.5 rounded-full text-muted hover:text-main hover:bg-canvas transition-colors cursor-pointer"
           aria-label={t('fullscreenToggle')}>
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Bottom-Start Corner Hotspot (Turn Backward in LTR / Forward in RTL) */}
      <div
        onClick={readerDirection === 'rtl' ? onNextPage : onPrevPage}
        className={`fixed bottom-0 start-0 w-16 h-16 z-30 flex items-end justify-start p-3 opacity-0 hover:opacity-100 transition-opacity duration-150 cursor-pointer select-none group ${
          (readerDirection === 'rtl' ? canGoNext : canGoPrev) ? '' : 'pointer-events-none'
        }`}
        title={readerDirection === 'rtl' ? t('paginationNext') : t('paginationPrevious')}
      >
        <div className="p-2 rounded-full bg-surface/80 backdrop-blur-md border border-subtle shadow-md text-muted group-hover:text-main group-hover:scale-105 transition-all">
          <ChevronRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
        </div>
      </div>

      {/* Bottom-End Corner Hotspot (Turn Forward in LTR / Backward in RTL) */}
      <div
        onClick={readerDirection === 'rtl' ? onPrevPage : onNextPage}
        className={`fixed bottom-0 end-0 w-16 h-16 z-30 flex items-end justify-end p-3 opacity-0 hover:opacity-100 transition-opacity duration-150 cursor-pointer select-none group ${
          (readerDirection === 'rtl' ? canGoPrev : canGoNext) ? '' : 'pointer-events-none'
        }`}
        title={readerDirection === 'rtl' ? t('paginationPrevious') : t('paginationNext')}
      >
        <div className="p-2 rounded-full bg-surface/80 backdrop-blur-md border border-subtle shadow-md text-muted group-hover:text-main group-hover:scale-105 transition-all">
          <ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
        </div>
      </div>
    </>
  );
};
