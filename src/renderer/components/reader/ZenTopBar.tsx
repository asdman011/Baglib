'use client';

import React from 'react';
import {
  ArrowRight,
  BookOpen,
  FileText,
  FileCode,
  ListTree,
  Columns2,
  Scroll,
  Search,
  BookA,
  Sparkles,
  SlidersHorizontal,
  Crop,
  Maximize,
  Minimize,
  Puzzle,
  ArrowRightLeft,
  Highlighter,
  Play,
  Pause,
} from 'lucide-react';
import type { BookItem } from '../../types/library';
import type { BookFormat, ReaderViewMode } from '../../libs/reader/types';
import type { TranslationKey } from '../../translations';

interface ZenTopBarProps {
  isVisible: boolean;
  activeBook: BookItem;
  detectedFormat: BookFormat;
  chapterTitle?: string;
  readerDirection: 'rtl' | 'ltr';
  setReaderDirection: (dir: 'rtl' | 'ltr') => void;
  viewMode: ReaderViewMode;
  setViewMode: (mode: ReaderViewMode) => void;
  viewType: 'native_pdf' | 'text_manuscript';
  setViewType: (type: 'native_pdf' | 'text_manuscript') => void;
  pdfFitMode: 'Fit' | 'FitH' | 'FitV';
  setPdfFitMode: (mode: 'Fit' | 'FitH' | 'FitV') => void;
  autoCropMargins: boolean;
  setAutoCropMargins: React.Dispatch<React.SetStateAction<boolean>>;
  onClose: () => void;
  onToggleToc: () => void;
  isTocOpen: boolean;
  onToggleSearch: () => void;
  onToggleAIDrawer: () => void;
  onToggleDictionary: () => void;
  onToggleSettings: () => void;
  isSettingsOpen: boolean;
  onToggleKnowledge?: () => void;
  isKnowledgeOpen?: boolean;
  onTogglePlugins: () => void;
  onReadAloud?: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  isAutoScrolling?: boolean;
  onToggleAutoScroll?: () => void;
  autoScrollSpeed?: number;
  onCycleAutoScrollSpeed?: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const ZenTopBar: React.FC<ZenTopBarProps> = ({
  isVisible,
  activeBook,
  detectedFormat,
  chapterTitle,
  readerDirection,
  setReaderDirection,
  viewMode,
  setViewMode,
  viewType,
  setViewType,
  pdfFitMode,
  setPdfFitMode,
  autoCropMargins,
  setAutoCropMargins,
  onClose,
  onToggleToc,
  isTocOpen,
  onToggleSearch,
  onToggleAIDrawer,
  onToggleDictionary,
  onToggleSettings,
  isSettingsOpen,
  onToggleKnowledge,
  isKnowledgeOpen,
  onTogglePlugins,
  onReadAloud,
  onMouseEnter,
  onMouseLeave,
  isAutoScrolling = false,
  onToggleAutoScroll,
  autoScrollSpeed = 1,
  onCycleAutoScrollSpeed,
  t,
}) => {
  return (
    <header
      role="toolbar"
      aria-label={t('a11yToolbarLandmark')}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed top-3 inset-x-3 sm:inset-x-8 max-w-7xl mx-auto min-h-13 backdrop-blur-2xl bg-surface/90 border border-subtle/70 rounded-2xl flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 sm:px-4 py-2 z-40 shadow-2xl select-none"
      style={{
        transform: isVisible || isSettingsOpen ? 'translateY(0)' : 'translateY(-125%)',
        opacity: isVisible || isSettingsOpen ? 1 : 0,
        pointerEvents: isVisible || isSettingsOpen ? 'auto' : 'none',
        transition: 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease',
      }}
    >
      {/* Start: Back to Library, TOC & Book Title */}
      <div className="flex flex-1 basis-64 items-center gap-2 sm:gap-3 min-w-0 max-w-full">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-canvas/80 border border-subtle hover:bg-canvas text-muted hover:text-main text-xs font-bold transition-all cursor-pointer shrink-0"
          title={t('backToLibrary')}
        >
          <ArrowRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
          <span className="hidden sm:inline">{t('backToLibrary')}</span>
        </button>

        {/* TOC Drawer Toggle */}
        <button
          onClick={onToggleToc}
          className={`p-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1 text-xs font-bold shrink-0 ${
            isTocOpen
              ? 'bg-pale-sky-500 text-white border-pale-sky-500 shadow-sm'
              : 'bg-canvas/80 border-subtle text-muted hover:text-main'
          }`}
          title={t('tableOfContents')}
        >
          <ListTree className="w-4 h-4" />
          <span className="hidden md:inline">{t('tableOfContents')}</span>
        </button>

        {/* Knowledge & Highlights Drawer Toggle */}
        {onToggleKnowledge && (
          <button
            onClick={onToggleKnowledge}
            className={`p-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1 text-xs font-bold shrink-0 ${
              isKnowledgeOpen
                ? 'bg-pale-sky-500 text-white border-pale-sky-500 shadow-sm'
                : 'bg-canvas/80 border-subtle text-muted hover:text-main'
            }`}
            title={t('tabHighlights')}
          >
            <Highlighter className="w-4 h-4" />
            <span className="hidden md:inline">{t('tabHighlights')}</span>
          </button>
        )}

        <div className="h-4 w-px bg-subtle/60 hidden sm:block shrink-0" />

        {/* Title, Author & Format Badge */}
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <BookOpen className="w-4 h-4 text-pale-sky-500 shrink-0" />
          <div className="flex flex-col min-w-0">
            <h2 className="font-bold text-main text-xs sm:text-sm leading-relaxed truncate" title={activeBook.title}>
              {activeBook.title}
              {activeBook.author && (
                <span className="text-muted font-serif font-normal ms-1.5">
                  - {activeBook.author}
                </span>
              )}
            </h2>
            {chapterTitle && (
              <span className="text-[10px] text-pale-sky-600 dark:text-pale-sky-300 truncate font-serif">
                {chapterTitle}
              </span>
            )}
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-300 font-mono font-bold uppercase shrink-0">
            {detectedFormat}
          </span>
        </div>
      </div>

      {/* Center: View Mode, Zoom/Fit, Direction */}
      <div className="flex flex-1 basis-full 2xl:basis-auto min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2 [&>button]:shrink-0 [&>div]:shrink-0">
        <button onClick={onReadAloud} title={t('ttsReadAloud')} className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-canvas text-xs leading-relaxed whitespace-nowrap cursor-pointer">
          <Play className="w-4 h-4 rtl:rotate-180" />
          <span>{t('ttsReadAloud')}</span>
        </button>
        {/* View Mode Switcher */}
        <div className="flex items-center gap-0.5 bg-canvas/80 p-0.5 rounded-xl border border-subtle text-xs">
          <button
            onClick={() => setViewMode('single')}
            title={t('viewModeSingle')}
            className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
              viewMode === 'single'
                ? 'bg-pale-sky-500 text-white shadow-xs'
                : 'text-muted hover:text-main'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t('viewModeSingle')}</span>
          </button>
          <button
            onClick={() => setViewMode('two-column')}
            title={t('viewModeTwoColumn')}
            className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
              viewMode === 'two-column'
                ? 'bg-pale-sky-500 text-white shadow-xs'
                : 'text-muted hover:text-main'
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t('viewModeTwoColumn')}</span>
          </button>
          <button
            onClick={() => setViewMode('scrolled')}
            title={t('viewModeScrolled')}
            className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
              viewMode === 'scrolled'
                ? 'bg-pale-sky-500 text-white shadow-xs'
                : 'text-muted hover:text-main'
            }`}
          >
            <Scroll className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t('viewModeScrolled')}</span>
          </button>
        </div>

        {/* Hands-Free Auto-Scroll Controls */}
        {onToggleAutoScroll && (
          <div className="flex items-center gap-0.5 bg-canvas/80 p-0.5 rounded-xl border border-subtle text-xs">
            <button
              onClick={onToggleAutoScroll}
              title={isAutoScrolling ? t('autoScrollPause') : t('autoScrollPlay')}
              aria-label={isAutoScrolling ? t('autoScrollPause') : t('autoScrollPlay')}
              className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                isAutoScrolling
                  ? 'bg-emerald-500 text-white shadow-xs'
                  : 'text-muted hover:text-main'
              }`}
            >
              {isAutoScrolling ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span className="hidden xl:inline">
                {isAutoScrolling ? t('autoScrollPause') : t('autoScrollPlay')}
              </span>
            </button>
            {onCycleAutoScrollSpeed && (
              <button
                onClick={onCycleAutoScrollSpeed}
                title={`${t('autoScrollSpeed')}: ${autoScrollSpeed}x`}
                aria-label={`${t('autoScrollSpeed')}: ${autoScrollSpeed}x`}
                className="px-1.5 py-1 rounded-lg text-muted hover:text-main hover:bg-surface font-mono font-bold text-[11px] transition-all cursor-pointer"
              >
                {autoScrollSpeed}x
              </button>
            )}
          </div>
        )}

        {/* PDF Fit & Whitespace Auto-Crop Controls */}
        {detectedFormat === 'PDF' && (
          <div className="hidden lg:flex items-center gap-0.5 bg-canvas/80 p-0.5 rounded-xl border border-subtle text-xs">
            <button
              onClick={() => setPdfFitMode(pdfFitMode === 'Fit' ? 'FitH' : 'Fit')}
              title={pdfFitMode === 'Fit' ? t('fitWidth') : t('fitPage')}
              className="p-1.5 rounded-lg text-muted hover:text-main hover:bg-surface font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              {pdfFitMode === 'Fit' ? (
                <Maximize className="w-3.5 h-3.5" />
              ) : (
                <Minimize className="w-3.5 h-3.5" />
              )}
              <span className="text-[11px] font-sans">
                {pdfFitMode === 'Fit' ? t('fitPage') : t('fitWidth')}
              </span>
            </button>

            {/* Smart Auto-Crop Margins Toggle */}
            <button
              onClick={() => setAutoCropMargins((prev) => !prev)}
              title={t('autoCropMargins')}
              className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                autoCropMargins
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-muted hover:text-main hover:bg-surface'
              }`}
            >
              <Crop className="w-3.5 h-3.5" />
              <span className="text-[11px] hidden xl:inline">{t('autoCropMargins')}</span>
            </button>
          </div>
        )}

        {/* Direction Switcher (RTL / LTR) */}
        <button
          onClick={() => setReaderDirection(readerDirection === 'rtl' ? 'ltr' : 'rtl')}
          title={
            readerDirection === 'rtl'
              ? t('readingDirectionRtl')
              : t('readingDirectionLtr')
          }
          className="flex items-center gap-1 px-2 py-1 rounded-xl bg-canvas/80 border border-subtle text-muted hover:text-main text-xs font-mono font-bold transition-all cursor-pointer"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          <span className="text-[10px]">{readerDirection.toUpperCase()}</span>
        </button>

        {/* Search In Book */}
        <button
          onClick={onToggleSearch}
          title={t('searchInBook')}
          className="p-1.5 rounded-xl bg-canvas/80 border border-subtle text-muted hover:text-main transition-all cursor-pointer"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* AI Research Assistant */}
        <button
          onClick={onToggleAIDrawer}
          title={t('aiAssistantTitle')}
          className="p-1.5 rounded-xl bg-canvas/80 border border-subtle text-indigo-500 hover:text-indigo-600 transition-all cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
        </button>

        {/* Dictionary Lookup */}
        <button
          onClick={onToggleDictionary}
          title={t('dictionaryLookupTitle')}
          className="p-1.5 rounded-xl bg-canvas/80 border border-subtle text-pale-sky-600 hover:text-pale-sky-700 transition-all cursor-pointer"
        >
          <BookA className="w-4 h-4" />
        </button>

        {/* Plugins Modal */}
        <button
          onClick={onTogglePlugins}
          title={t('pluginsTitle')}
          className="p-1.5 rounded-xl bg-canvas/80 border border-subtle text-muted hover:text-main transition-all cursor-pointer"
        >
          <Puzzle className="w-4 h-4" />
        </button>

        {/* Typography Settings Panel */}
        <button
          onClick={onToggleSettings}
          title={t('typographySettings')}
          className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
            isSettingsOpen
              ? 'bg-pale-sky-500 text-white border-pale-sky-500 shadow-sm'
              : 'bg-canvas/80 border-subtle text-muted hover:text-main'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
