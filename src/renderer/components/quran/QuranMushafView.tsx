'use client';

import React, { useState, useMemo, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  BookOpen,
  Play,
} from 'lucide-react';
import type { QuranMushafPage } from '../../../shared/types/quran';
import type { TranslationKey } from '../../translations';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

interface QuranMushafViewProps {
  page: QuranMushafPage;
  surahs: { number: number; count: number; arabic?: string; name?: string }[];
  t: Translate;
  lang: 'ar' | 'en';
  dir: 'rtl' | 'ltr';
  selectedAyah: { surah: number; ayah: number } | null;
  onSelectAyah: (selection: { surah: number; ayah: number } | null) => void;
  onNavigatePage: (pageNumber: number) => void;
  onOpenInStudyReader?: (surah: number, ayah: number) => void;
  onCopyText: (text: string) => void;
  activeAudio?: {
    surah: number;
    ayah: number;
    isPlaying: boolean;
    activeWordIndex: number | null;
  } | null;
  onPlayAyah?: (surah: number, ayah: number) => void;
  loading?: boolean;
}

export function QuranMushafView({
  page,
  surahs,
  t,
  lang,
  dir,
  selectedAyah,
  onSelectAyah,
  onNavigatePage,
  onOpenInStudyReader,
  onCopyText,
  activeAudio,
  onPlayAyah,
  loading = false,
}: QuranMushafViewProps) {
  const [zoom, setZoom] = useState(100);
  const [hoveredAyah, setHoveredAyah] = useState<{ surah: number; ayah: number } | null>(null);
  const [jumpPageInput, setJumpPageInput] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedWords = useMemo(() => {
    if (!selectedAyah) return [];
    return page.words.filter(
      w => w.surah === selectedAyah.surah && w.ayah === selectedAyah.ayah && w.type !== 'aya-mark'
    );
  }, [page.words, selectedAyah]);

  const isSelectedAyahOnPage = selectedWords.length > 0;

  const selectedSurahInfo = useMemo(() => {
    if (!selectedAyah) return null;
    return surahs.find(s => s.number === selectedAyah.surah);
  }, [surahs, selectedAyah]);

  const pageCanonicalText = useMemo(() => {
    return page.words
      .filter(w => w.type !== 'aya-mark')
      .map(w => w.textHafs || w.imlaey || '')
      .filter(Boolean)
      .join(' ');
  }, [page.words]);

  const handleSvgClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as Element).closest('[data-surah]');
    if (target) {
      const surahStr = target.getAttribute('data-surah');
      const ayahStr = target.getAttribute('data-aya');
      if (surahStr && ayahStr) {
        const surah = parseInt(surahStr, 10);
        const ayah = parseInt(ayahStr, 10);
        if (selectedAyah?.surah === surah && selectedAyah?.ayah === ayah) {
          onSelectAyah(null);
        } else {
          onSelectAyah({ surah, ayah });
        }
      }
    }
  };

  const handleSvgPointerOver = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = (e.target as Element).closest('[data-surah]');
    if (target) {
      const surahStr = target.getAttribute('data-surah');
      const ayahStr = target.getAttribute('data-aya');
      if (surahStr && ayahStr) {
        const surah = parseInt(surahStr, 10);
        const ayah = parseInt(ayahStr, 10);
        if (hoveredAyah?.surah !== surah || hoveredAyah?.ayah !== ayah) {
          setHoveredAyah({ surah, ayah });
        }
        return;
      }
    }
    if (hoveredAyah) setHoveredAyah(null);
  };

  const handleSvgPointerLeave = () => {
    if (hoveredAyah) setHoveredAyah(null);
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseInt(jumpPageInput.trim(), 10);
    if (Number.isInteger(target) && target >= 1 && target <= page.totalPages) {
      onNavigatePage(target);
      setJumpPageInput('');
    }
  };

  const dynamicHighlightCss = useMemo(() => {
    const styles: string[] = [];
    if (hoveredAyah && (!selectedAyah || selectedAyah.surah !== hoveredAyah.surah || selectedAyah.ayah !== hoveredAyah.ayah)) {
      const padSurah = String(hoveredAyah.surah).padStart(3, '0');
      const padAyah = String(hoveredAyah.ayah).padStart(3, '0');
      styles.push(`
        .mushaf-svg-surface [data-surah="${padSurah}"][data-aya="${padAyah}"] path,
        .mushaf-svg-surface [data-surah="${hoveredAyah.surah}"][data-aya="${hoveredAyah.ayah}"] path {
          fill: #0ea5e9 !important;
          cursor: pointer;
        }
      `);
    }
    if (selectedAyah) {
      const padSurah = String(selectedAyah.surah).padStart(3, '0');
      const padAyah = String(selectedAyah.ayah).padStart(3, '0');
      styles.push(`
        .mushaf-svg-surface [data-surah="${padSurah}"][data-aya="${padAyah}"] path,
        .mushaf-svg-surface [data-surah="${selectedAyah.surah}"][data-aya="${selectedAyah.ayah}"] path {
          fill: #0284c7 !important;
          cursor: pointer;
        }
        :is(.dark) .mushaf-svg-surface [data-surah="${padSurah}"][data-aya="${padAyah}"] path,
        :is(.dark) .mushaf-svg-surface [data-surah="${selectedAyah.surah}"][data-aya="${selectedAyah.ayah}"] path {
          fill: #38bdf8 !important;
          cursor: pointer;
        }
      `);
    }
    if (activeAudio?.isPlaying) {
      const padSurah = String(activeAudio.surah).padStart(3, '0');
      const padAyah = String(activeAudio.ayah).padStart(3, '0');
      styles.push(`
        .mushaf-svg-surface [data-surah="${padSurah}"][data-aya="${padAyah}"] path,
        .mushaf-svg-surface [data-surah="${activeAudio.surah}"][data-aya="${activeAudio.ayah}"] path {
          fill: #059669 !important;
        }
        :is(.dark) .mushaf-svg-surface [data-surah="${padSurah}"][data-aya="${padAyah}"] path,
        :is(.dark) .mushaf-svg-surface [data-surah="${activeAudio.surah}"][data-aya="${activeAudio.ayah}"] path {
          fill: #34d399 !important;
        }
      `);
      if (activeAudio.activeWordIndex !== null && activeAudio.activeWordIndex !== undefined) {
        styles.push(`
          .mushaf-svg-surface [data-surah="${padSurah}"][data-aya="${padAyah}"][data-word-index-in-ayah="${activeAudio.activeWordIndex}"] path,
          .mushaf-svg-surface [data-surah="${activeAudio.surah}"][data-aya="${activeAudio.ayah}"][data-word-index-in-ayah="${activeAudio.activeWordIndex}"] path {
            fill: #d97706 !important;
            filter: drop-shadow(0 0 2px rgba(217, 119, 6, 0.6));
          }
          :is(.dark) .mushaf-svg-surface [data-surah="${padSurah}"][data-aya="${padAyah}"][data-word-index-in-ayah="${activeAudio.activeWordIndex}"] path,
          :is(.dark) .mushaf-svg-surface [data-surah="${activeAudio.surah}"][data-aya="${activeAudio.ayah}"][data-word-index-in-ayah="${activeAudio.activeWordIndex}"] path {
            fill: #fbbf24 !important;
            filter: drop-shadow(0 0 3px rgba(251, 191, 36, 0.7));
          }
        `);
      }
    }
    return styles.join('\n');
  }, [hoveredAyah, selectedAyah, activeAudio]);

  const sanitizedInnerSvg = useMemo(() => {
    return page.svg.replace(/^<\?xml[\s\S]*?\?>/i, '').trim();
  }, [page.svg]);

  return (
    <div dir={dir} className="flex flex-col h-full space-y-4">
      <style dangerouslySetInnerHTML={{ __html: dynamicHighlightCss }} />

      {/* Top Toolbar: Navigation & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-subtle bg-surface">
        {/* Page navigation controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page.pageNumber <= 1 || loading}
            onClick={() => onNavigatePage(page.pageNumber - 1)}
            title={t('quranPrevious')}
            aria-label={t('quranPrevious')}
            className="rounded-xl border border-subtle p-2 hover:bg-pale-sky-500/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </button>

          <span className="text-sm font-medium px-2 text-main">
            {t('quranPageNumber', { page: new Intl.NumberFormat(lang).format(page.pageNumber) })}{' '}
            <span className="text-muted">
              {t('quranPageOf', { total: new Intl.NumberFormat(lang).format(page.totalPages) })}
            </span>
          </span>

          <button
            type="button"
            disabled={page.pageNumber >= page.totalPages || loading}
            onClick={() => onNavigatePage(page.pageNumber + 1)}
            title={t('quranNext')}
            aria-label={t('quranNext')}
            className="rounded-xl border border-subtle p-2 hover:bg-pale-sky-500/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronRight className="size-4 rtl:rotate-180" />
          </button>

          {/* Quick jump to page */}
          <form onSubmit={handleJumpSubmit} className="flex items-center gap-1 ms-2">
            <input
              type="number"
              min={1}
              max={page.totalPages}
              value={jumpPageInput}
              onChange={e => setJumpPageInput(e.target.value)}
              placeholder={t('quranPage')}
              aria-label={t('quranJumpToPage')}
              className="w-16 text-center text-xs rounded-lg border border-subtle bg-surface px-2 py-1 outline-none focus:border-pale-sky-500"
            />
          </form>
        </div>

        {/* Surah range & quick jump */}
        <div className="flex items-center gap-2 text-xs text-muted">
          {page.surahStart > 0 && (
            <span>
              {t('quranMushafPageInfo', {
                page: new Intl.NumberFormat(lang).format(page.pageNumber),
                surah:
                  (lang === 'ar'
                    ? surahs.find(s => s.number === page.surahStart)?.arabic
                    : surahs.find(s => s.number === page.surahStart)?.name) ||
                  t('quranSurahNumber', { number: page.surahStart }),
              })}
            </span>
          )}
        </div>

        {/* View / Zoom / Copy Page controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={zoom <= 60}
            onClick={() => setZoom(z => Math.max(50, z - 10))}
            title={t('quranZoomOut')}
            aria-label={t('quranZoomOut')}
            className="rounded-lg border border-subtle p-1.5 hover:bg-pale-sky-500/10 disabled:opacity-30 transition-colors"
          >
            <ZoomOut className="size-4" />
          </button>
          <span className="text-xs text-muted w-10 text-center font-mono">{zoom}%</span>
          <button
            type="button"
            disabled={zoom >= 200}
            onClick={() => setZoom(z => Math.min(200, z + 10))}
            title={t('quranZoomIn')}
            aria-label={t('quranZoomIn')}
            className="rounded-lg border border-subtle p-1.5 hover:bg-pale-sky-500/10 disabled:opacity-30 transition-colors"
          >
            <ZoomIn className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(100)}
            title={t('quranResetZoom')}
            aria-label={t('quranResetZoom')}
            className="rounded-lg border border-subtle p-1.5 hover:bg-pale-sky-500/10 transition-colors"
          >
            <Maximize2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onCopyText(pageCanonicalText)}
            title={t('quranCopyPage')}
            aria-label={t('quranCopyPage')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-subtle px-2.5 py-1 text-xs hover:bg-pale-sky-500/10 transition-colors"
          >
            <Copy className="size-3.5" />
            <span className="hidden sm:inline">{t('quranCopyPage')}</span>
          </button>
        </div>
      </div>

      {/* Main Mushaf Page Canvas */}
      <div
        ref={containerRef}
        className="flex-1 min-h-[500px] overflow-auto rounded-2xl border border-subtle bg-white dark:bg-zinc-950 flex items-center justify-center p-4 sm:p-8"
      >
        <div
          style={{ width: `${zoom}%`, maxWidth: zoom === 100 ? '680px' : 'none' }}
          className="mushaf-svg-surface transition-all duration-150 text-zinc-900 dark:text-zinc-100 [&_path]:fill-current [&_path]:transition-colors [&_[data-surah]]:cursor-pointer"
          onClick={handleSvgClick}
          onPointerOver={handleSvgPointerOver}
          onPointerLeave={handleSvgPointerLeave}
          dangerouslySetInnerHTML={{ __html: sanitizedInnerSvg }}
        />
      </div>

      {/* Selected Ayah Inspector Drawer */}
      {selectedAyah && isSelectedAyahOnPage && (
        <aside
          className="rounded-2xl border border-subtle bg-surface p-4 sm:p-5 shadow-sm space-y-3"
          aria-label={t('quranAyahInspector')}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-subtle pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="size-4 text-pale-sky-600 dark:text-pale-sky-400" />
              <span className="font-semibold text-sm">
                {(lang === 'ar' ? selectedSurahInfo?.arabic : selectedSurahInfo?.name) ||
                  t('quranSurahNumber', { number: selectedAyah.surah })}{' '}
                —{' '}
                <span dir="ltr">
                  {new Intl.NumberFormat(lang).format(selectedAyah.surah)}:
                  {new Intl.NumberFormat(lang).format(selectedAyah.ayah)}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              {onPlayAyah && (
                <button
                  type="button"
                  onClick={() => onPlayAyah(selectedAyah.surah, selectedAyah.ayah)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-pale-sky-600 text-white px-3 py-1.5 text-xs hover:bg-pale-sky-700 transition-colors shadow-xs"
                >
                  <Play className="size-3.5" />
                  {t('quranAudioPlay')}
                </button>
              )}
              {onOpenInStudyReader && (
                <button
                  type="button"
                  onClick={() => onOpenInStudyReader(selectedAyah.surah, selectedAyah.ayah)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-subtle px-3 py-1.5 text-xs hover:bg-pale-sky-500/10 transition-colors"
                >
                  <ExternalLink className="size-3.5" />
                  {t('quranOpenInStudyReader')}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const text = selectedWords.map(w => w.textHafs || w.imlaey || '').join(' ');
                  onCopyText(`${text}\n[${selectedAyah.surah}:${selectedAyah.ayah}]`);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-subtle px-3 py-1.5 text-xs hover:bg-pale-sky-500/10 transition-colors"
              >
                <Copy className="size-3.5" />
                {t('quranCopyAyah')}
              </button>
              <button
                type="button"
                onClick={() => onSelectAyah(null)}
                aria-label={t('quranClosePanel')}
                className="rounded-lg border border-subtle p-1.5 hover:bg-pale-sky-500/10 transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Ayah Words Display */}
          <div dir="rtl" lang="ar" className="font-reading text-2xl leading-[2.2] text-start break-words py-1">
            {selectedWords.map(word => (
              <span
                key={word.id || `${word.surah}:${word.ayah}:${word.wordIndex}`}
                title={word.imlaey ? `إملائي: ${word.imlaey}` : undefined}
                className="inline-block mx-1 hover:text-pale-sky-600 dark:hover:text-pale-sky-400 transition-colors"
              >
                {word.textHafs || word.imlaey}
              </span>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
