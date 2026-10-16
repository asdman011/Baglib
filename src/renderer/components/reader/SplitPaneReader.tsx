'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Columns2,
  Rows2,
  Lock,
  Unlock,
  X,
  BookOpen,
  ArrowRightLeft,
  ChevronDown,
} from 'lucide-react';
import { BookItem } from '../../types/library';
import { ReaderPane } from './ReaderPane';
import {
  ParallelSyncController,
  calculateReadingFraction,
} from '../../libs/reader/parallel-sync';
import { translations, TranslationKey } from '../../translations';

interface SplitPaneReaderProps {
  primaryBook: BookItem;
  initialSecondaryBook?: BookItem | null;
  availableBooks: BookItem[];
  orientation: 'vertical' | 'horizontal';
  onOrientationChange: (orientation: 'vertical' | 'horizontal') => void;
  onClose: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const SplitPaneReader: React.FC<SplitPaneReaderProps> = ({
  primaryBook,
  initialSecondaryBook,
  availableBooks,
  orientation,
  onOrientationChange,
  onClose,
  t,
}) => {
  // Secondary Book Selection (defaults to initial, or same book for dual-section study, or second library book)
  const [secondaryBook, setSecondaryBook] = useState<BookItem>(
    initialSecondaryBook ||
      availableBooks.find((b) => b.id !== primaryBook.id) ||
      primaryBook
  );
  const [isBookPickerOpen, setIsBookPickerOpen] = useState(false);

  // Split Ratio (percentage for Pane A, 20% to 80%)
  const [splitRatio, setSplitRatio] = useState<number>(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Synchronous Navigation Engine
  const [isSyncLocked, setIsSyncLocked] = useState<boolean>(true);
  const [pageA, setPageA] = useState<number>(1);
  const [totalPagesA, setTotalPagesA] = useState<number>(1);
  const [pageB, setPageB] = useState<number>(1);
  const [totalPagesB, setTotalPagesB] = useState<number>(1);

  // External page targets dispatched by sync engine
  const [syncTargetA, setSyncTargetA] = useState<number | null>(null);
  const [syncTargetB, setSyncTargetB] = useState<number | null>(null);

  // ParallelSyncController instance
  const syncControllerRef = useRef<ParallelSyncController | null>(null);

  useEffect(() => {
    const ctrl = new ParallelSyncController(isSyncLocked, (targetPane, targetPage) => {
      if (targetPane === 'A') {
        setSyncTargetA(targetPage);
      } else {
        setSyncTargetB(targetPage);
      }
    });
    syncControllerRef.current = ctrl;

    return () => {
      ctrl.destroy();
    };
  }, []);

  // Update syncController when lock state changes
  useEffect(() => {
    syncControllerRef.current?.setLocked(isSyncLocked);
  }, [isSyncLocked]);

  // Handle Pane A page change
  const handlePageAChange = useCallback(
    (nextPage: number) => {
      setPageA(nextPage);
      setSyncTargetA(null);
      if (syncControllerRef.current?.getLocked()) {
        syncControllerRef.current.handlePaneANavigate(nextPage, totalPagesA, totalPagesB);
      }
    },
    [totalPagesA, totalPagesB]
  );

  // Handle Pane B page change
  const handlePageBChange = useCallback(
    (nextPage: number) => {
      setPageB(nextPage);
      setSyncTargetB(null);
      if (syncControllerRef.current?.getLocked()) {
        syncControllerRef.current.handlePaneBNavigate(nextPage, totalPagesB, totalPagesA);
      }
    },
    [totalPagesA, totalPagesB]
  );

  // Resizer pointer dragging logic
  const handleMouseDown = () => {
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      let ratio: number;

      if (orientation === 'vertical') {
        ratio = ((e.clientX - rect.left) / rect.width) * 100;
      } else {
        ratio = ((e.clientY - rect.top) / rect.height) * 100;
      }

      setSplitRatio(Math.max(20, Math.min(80, ratio)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, orientation]);

  // Relative reading fractions
  const fractionA = Math.round(calculateReadingFraction(pageA, totalPagesA) * 100);
  const fractionB = Math.round(calculateReadingFraction(pageB, totalPagesB) * 100);

  return (
    <div
      ref={containerRef}
      className={`flex-1 flex flex-col h-full bg-canvas text-main overflow-hidden font-sans select-none relative ${
        isDragging ? 'cursor-col-resize select-none' : ''
      }`}
    >
      {/* Top Split Workspace Control Bar */}
      <div className="h-12 bg-surface/90 backdrop-blur-md border-b border-subtle px-3 sm:px-4 flex items-center justify-between z-20 shrink-0 gap-2">
        {/* Left: Split Indicator & Secondary Book Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-300 font-bold text-xs">
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>{t('parallelReadingWorkspace')}</span>
          </div>

          {/* Book B Selection Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsBookPickerOpen(!isBookPickerOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-canvas border border-subtle hover:bg-surface text-main text-xs font-medium cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-pale-sky-500" />
              <span className="font-bold truncate max-w-[140px] sm:max-w-[200px]">
                {t('paneB')}: {secondaryBook.title}
              </span>
              <ChevronDown className="w-3 h-3 text-muted" />
            </button>

            {isBookPickerOpen && (
              <div className="absolute top-9 start-0 w-72 bg-surface border border-subtle rounded-2xl shadow-2xl z-30 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-100 max-h-64 overflow-y-auto">
                <span className="text-[10px] font-bold text-muted px-2 py-1 block">
                  {t('selectSecondaryBook')}
                </span>
                {/* Option to clone primary book for Dual Chapter / Commentary reading */}
                <button
                  onClick={() => {
                    setSecondaryBook(primaryBook);
                    setIsBookPickerOpen(false);
                  }}
                  className={`w-full text-start p-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                    secondaryBook.id === primaryBook.id
                      ? 'bg-pale-sky-500/10 text-pale-sky-600 font-bold'
                      : 'hover:bg-canvas text-main'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-pale-sky-500 shrink-0" />
                  <div className="truncate">
                    <p className="truncate">{primaryBook.title}</p>
                    <span className="text-[10px] text-muted font-sans">
                      ({t('clonePrimaryBookSameTitle')})
                    </span>
                  </div>
                </button>

                {availableBooks
                  .filter((b) => b.id !== primaryBook.id)
                  .map((b) => (
                    <button
                      key={b.id}
                      onClick={() => {
                        setSecondaryBook(b);
                        setIsBookPickerOpen(false);
                      }}
                      className={`w-full text-start p-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                        secondaryBook.id === b.id
                          ? 'bg-pale-sky-500/10 text-pale-sky-600 font-bold'
                          : 'hover:bg-canvas text-main'
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5 text-pale-sky-500 shrink-0" />
                      <div className="truncate">
                        <p className="truncate">{b.title}</p>
                        <span className="text-[10px] text-muted">{b.author}</span>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Center: Synchronous Navigation & Progress Indicator */}
        <div className="flex items-center gap-2">
          {/* Synchronized Navigation Lock Toggle */}
          <button
            onClick={() => setIsSyncLocked(!isSyncLocked)}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              isSyncLocked
                ? 'bg-evergreen-500 text-white shadow-sm'
                : 'bg-canvas border border-subtle text-muted hover:text-main'
            }`}
            title={t('linkPanesToggle')}
          >
            {isSyncLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">
              {isSyncLocked ? t('panesLinked') : t('panesIndependent')}
            </span>
          </button>

          {/* Relative Document Length / Percentage Progress */}
          <div className="hidden md:flex items-center gap-2 text-[11px] font-mono text-muted bg-canvas px-2.5 py-1 rounded-xl border border-subtle">
            <span>
              A: {fractionA}% (p.{pageA})
            </span>
            <span>⇄</span>
            <span>
              B: {fractionB}% (p.{pageB})
            </span>
          </div>
        </div>

        {/* Right: Split Orientation Toggle & Close Split Button */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 bg-canvas p-1 rounded-xl border border-subtle text-xs">
            <button
              onClick={() => onOrientationChange('vertical')}
              title={t('splitVertical')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                orientation === 'vertical'
                  ? 'bg-pale-sky-500 text-white shadow-sm'
                  : 'text-muted hover:text-main'
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onOrientationChange('horizontal')}
              title={t('splitHorizontal')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                orientation === 'horizontal'
                  ? 'bg-pale-sky-500 text-white shadow-sm'
                  : 'text-muted hover:text-main'
              }`}
            >
              <Rows2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={onClose}
            title={t('closeParallelReading')}
            className="p-2 rounded-xl bg-canvas border border-subtle hover:bg-rose-500/10 text-muted hover:text-rose-500 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Dual-Pane Container with Resizable Splitter */}
      <div
        className={`flex-1 flex overflow-hidden p-2 gap-1.5 relative ${
          orientation === 'horizontal' ? 'flex-col' : 'flex-row'
        }`}
      >
        {/* Pane A (Primary Book) */}
        <div
          className="flex flex-col overflow-hidden transition-all duration-75"
          style={{
            flex: `0 0 ${splitRatio}%`,
            maxWidth: `${splitRatio}%`,
          }}
        >
          <ReaderPane
            paneId="A"
            book={primaryBook}
            initialPage={pageA}
            onPageChange={handlePageAChange}
            onTotalPagesChange={setTotalPagesA}
            externalPageTarget={syncTargetA}
            t={t}
          />
        </div>

        {/* Draggable Splitter Divider */}
        <div
          onMouseDown={handleMouseDown}
          className={`flex items-center justify-center bg-subtle/40 hover:bg-pale-sky-500/40 active:bg-pale-sky-500 transition-colors z-20 ${
            orientation === 'horizontal'
              ? 'h-2 w-full cursor-row-resize'
              : 'w-2 h-full cursor-col-resize'
          }`}
        >
          <div
            className={`rounded-full bg-muted/60 ${
              orientation === 'horizontal' ? 'w-8 h-1' : 'w-1 h-8'
            }`}
          />
        </div>

        {/* Pane B (Secondary Book) */}
        <div
          className="flex-1 flex flex-col overflow-hidden transition-all duration-75"
          style={{
            maxWidth: `${100 - splitRatio}%`,
          }}
        >
          <ReaderPane
            paneId="B"
            book={secondaryBook}
            initialPage={pageB}
            onPageChange={handlePageBChange}
            onTotalPagesChange={setTotalPagesB}
            externalPageTarget={syncTargetB}
            t={t}
          />
        </div>
      </div>
    </div>
  );
};
