'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, ZoomIn, ZoomOut } from 'lucide-react';
import type { QuranMushafPage } from '../../../shared/types/quran';
import type { TranslationKey } from '../../translations';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;
type Location = { surah: number; ayah: number };
interface QuranMushafViewProps {
  page: QuranMushafPage;
  surahs: { number: number; count: number; arabic?: string; name?: string }[];
  t: Translate;
  lang: 'ar' | 'en';
  dir: 'rtl' | 'ltr';
  selectedAyah: Location | null;
  onSelectAyah: (selection: Location | null) => void;
  onNavigatePage: (page: number) => void;
  onOpenInStudyReader?: (surah: number, ayah: number) => void;
  onCopyText: (text: string) => void;
  activeAudio?: Location & { isPlaying: boolean; activeWordIndex: number | null } | null;
  onPlayAyah?: (surah: number, ayah: number) => void;
  loading?: boolean;
  immersive?: boolean;
}

export function svgWordLocation(element: Element | null): Location | null {
  const group = element?.closest('[data-surah][data-aya]');
  if (!group) return null;
  const surah = Number(group.getAttribute('data-surah'));
  const ayah = Number(group.getAttribute('data-aya'));
  return Number.isInteger(surah) && surah >= 1 && surah <= 114 && Number.isInteger(ayah) && ayah >= 1 && ayah <= 300 ? { surah, ayah } : null;
}

export function QuranMushafView({ page, t, lang, dir, selectedAyah, onSelectAyah, onNavigatePage, onCopyText, activeAudio, loading = false, immersive = false }: QuranMushafViewProps) {
  const [zoom, setZoom] = useState(100);
  const surface = useRef<HTMLDivElement>(null);
  const markup = useMemo(() => ({ __html: page.svg.replace(/^<\?xml[\s\S]*?\?>/i, '').trim() }), [page.svg]);

  useEffect(() => {
    for (const group of surface.current?.querySelectorAll<SVGGElement>('[data-surah][data-aya]') || []) {
      const location = svgWordLocation(group);
      if (!location) continue;
      group.setAttribute('tabindex', '0');
      group.setAttribute('role', 'button');
      group.setAttribute('aria-label', `${group.getAttribute('data-hafs') || group.getAttribute('data-imlaey') || ''} — ${t('quranAyahInspector')} ${location.surah}:${location.ayah}`);
      group.toggleAttribute('data-baglib-selected', selectedAyah?.surah === location.surah && selectedAyah.ayah === location.ayah);
      const playing = Boolean(activeAudio?.isPlaying && activeAudio.surah === location.surah && activeAudio.ayah === location.ayah);
      group.toggleAttribute('data-baglib-playing', playing);
      group.toggleAttribute('data-baglib-audio-word', playing && Number(group.getAttribute('data-word-index-in-ayah')) === activeAudio?.activeWordIndex);
    }
  }, [markup, selectedAyah, activeAudio, t]);

  const highlight = (element: Element | null) => {
    const word = element?.closest('[data-surah][data-aya]');
    const location = svgWordLocation(word || null);
    for (const group of surface.current?.querySelectorAll('[data-surah][data-aya]') || []) {
      const candidate = svgWordLocation(group);
      group.toggleAttribute('data-baglib-hover-ayah', Boolean(location && candidate?.surah === location.surah && candidate.ayah === location.ayah));
      group.toggleAttribute('data-baglib-hover-word', group === word);
    }
  };
  const select = (element: Element | null) => { const location = svgWordLocation(element); if (location) onSelectAyah(location); };
  const number = (value: number) => new Intl.NumberFormat(lang).format(value);
  return <div dir={dir} data-quran-mushaf className={`flex flex-col min-h-0 ${immersive ? 'h-full' : 'h-[calc(100dvh-16rem)] min-h-96'}`}>
    <style>{`
      .mushaf-svg-surface svg { width:100%; height:auto; display:block; }
      .mushaf-svg-surface path { fill:currentColor; transition:fill 120ms ease,filter 120ms ease; }
      .mushaf-svg-surface [data-surah][data-aya] { cursor:pointer; pointer-events:all; }
      .mushaf-svg-surface [data-baglib-selected] path { fill:#047857; }
      .mushaf-svg-surface [data-baglib-playing] path { fill:#059669; }
      .mushaf-svg-surface [data-baglib-hover-ayah] path { filter:drop-shadow(0 0 3px rgb(16 185 129 / .55)); stroke:rgb(16 185 129 / .16); stroke-width:1.5px; }
      .mushaf-svg-surface [data-baglib-audio-word] path { fill:#d97706; }
      .mushaf-svg-surface [data-baglib-hover-word] path,.mushaf-svg-surface [data-surah][data-aya]:focus-visible path { fill:#059669 !important; filter:drop-shadow(0 0 3px rgb(16 185 129 / .5)); }
      .dark .mushaf-svg-surface [data-baglib-selected] path,.dark .mushaf-svg-surface [data-baglib-hover-word] path { fill:#34d399 !important; }
    `}</style>
    <div className={immersive ? 'absolute start-2 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2 rounded-2xl bg-surface/95 border border-subtle p-2 shadow-lg max-h-[90dvh] overflow-auto' : 'flex flex-wrap items-center gap-2 p-3 rounded-2xl border border-subtle bg-surface mb-3'}>
      <button type="button" disabled={page.pageNumber <= 1 || loading} onClick={() => onNavigatePage(page.pageNumber - 1)} aria-label={t('quranPrevious')} title={t('quranPrevious')} className="p-2 rounded-lg border border-subtle disabled:opacity-30"><ChevronLeft className="size-4 rtl:rotate-180" /></button>
      <label className="flex flex-col items-center gap-1 text-xs"><span>{t('quranPage')}</span><input aria-label={t('quranJumpToPage')} type="number" min={1} max={page.totalPages} value={page.pageNumber} onChange={event => { const target = Number(event.target.value); if (Number.isInteger(target) && target >= 1 && target <= page.totalPages) onNavigatePage(target); }} className="w-16 min-w-0 rounded-lg border border-subtle bg-surface p-2 text-center" /><span>{number(page.totalPages)}</span></label>
      <button type="button" disabled={page.pageNumber >= page.totalPages || loading} onClick={() => onNavigatePage(page.pageNumber + 1)} aria-label={t('quranNext')} title={t('quranNext')} className="p-2 rounded-lg border border-subtle disabled:opacity-30"><ChevronRight className="size-4 rtl:rotate-180" /></button>
      <button type="button" disabled={zoom <= 60} onClick={() => setZoom(value => Math.max(60, value - 10))} aria-label={t('quranZoomOut')} title={t('quranZoomOut')} className="p-2 rounded-lg border border-subtle disabled:opacity-30"><ZoomOut className="size-4" /></button>
      <button type="button" disabled={zoom >= 200} onClick={() => setZoom(value => Math.min(200, value + 10))} aria-label={t('quranZoomIn')} title={t('quranZoomIn')} className="p-2 rounded-lg border border-subtle disabled:opacity-30"><ZoomIn className="size-4" /></button>
      <button type="button" onClick={() => setZoom(100)} title={t('quranResetZoom')} className="p-2 text-xs rounded-lg border border-subtle">{number(zoom)}%</button>
      <button type="button" onClick={() => onCopyText(page.words.filter(word => word.type !== 'aya-mark').map(word => word.textHafs || '').join(' '))} aria-label={t('quranCopyPage')} title={t('quranCopyPage')} className="p-2 rounded-lg border border-subtle"><Copy className="size-4" /></button>
    </div>
    <div className={`flex-1 min-h-0 overflow-auto bg-white dark:bg-zinc-950 ${immersive ? 'px-20 py-3' : 'rounded-2xl border border-subtle p-4'}`}>
      <div ref={surface} className="mushaf-svg-surface mx-auto text-zinc-900 dark:text-zinc-100" style={{ width: `${zoom}%`, maxWidth: zoom === 100 ? (immersive ? 'min(100%, calc((100dvh - 2rem) * 0.68))' : 'min(100%, calc((100dvh - 22rem) * 0.68))') : undefined }} onClick={event => select(event.target as Element)} onPointerOver={event => highlight(event.target as Element)} onPointerLeave={() => highlight(null)} onFocus={event => highlight(event.target as Element)} onBlur={() => highlight(null)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(event.target as Element); } }} dangerouslySetInnerHTML={markup} />
    </div>
  </div>;
}
