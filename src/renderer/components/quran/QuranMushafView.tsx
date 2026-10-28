'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, ZoomIn, ZoomOut } from 'lucide-react';
import type { QuranMushafPage } from '../../../shared/types/quran';
import type { TranslationKey } from '../../translations';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;
type Location = { surah: number; ayah: number; wordText?: string };
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
  onContextAyah?: (reference: Location, point: { x: number; y: number }) => void;
  onExploreAyah?: (reference: Location) => void;
}

export function svgWordLocation(element: Element | null): Location | null {
  const group = element?.closest('[data-surah][data-aya]');
  if (!group) return null;
  const surah = Number(group.getAttribute('data-surah'));
  const ayah = Number(group.getAttribute('data-aya'));
  return Number.isInteger(surah) && surah >= 1 && surah <= 114 && Number.isInteger(ayah) && ayah >= 1 && ayah <= 300 ? { surah, ayah } : null;
}

export function QuranMushafView({ page, t, lang, dir, selectedAyah, onSelectAyah, onNavigatePage, onCopyText, activeAudio, loading = false, onContextAyah, onExploreAyah }: QuranMushafViewProps) {
  const [zoom, setZoom] = useState(100);
  const surface = useRef<HTMLDivElement>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fontLoaded, setFontLoaded] = useState('');
  const [fontError, setFontError] = useState('');
  const fontName = page.profile === 'warsh' ? `QuranWarshPage${page.pageNumber}` : `QuranPage${page.pageNumber}`;
  const markup = useMemo(() => ({ __html: page.svg.replace(/^<\?xml[\s\S]*?\?>/i, '').trim() }), [page.svg]);
  useEffect(() => {
    if (!page.fontUrl) return;
    let alive = true;
    const face = new FontFace(fontName, `url(${JSON.stringify(page.fontUrl)})`);
    void face.load().then(loaded => { if (alive) { document.fonts.add(loaded); setFontLoaded(page.fontUrl!); } }).catch(() => { if (alive) setFontError(page.fontUrl!); });
    return () => { alive = false; document.fonts.delete(face); };
  }, [fontName, page.fontUrl]);
  useEffect(() => {
    if (page.layoutMode !== 'adapted' || fontLoaded !== page.fontUrl || !surface.current) return;
    const element = surface.current;
    const fit = () => {
      for (const line of element.querySelectorAll<HTMLElement>('[data-quran-unicode-line]')) {
        line.style.fontSize = '';
        if (line.clientWidth && line.scrollWidth > line.clientWidth) line.style.fontSize = `${parseFloat(getComputedStyle(line).fontSize) * line.clientWidth / line.scrollWidth * .98}px`;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [page.layoutMode, page.fontUrl, page.glyphLines, fontLoaded]);

  useEffect(() => {
    for (const group of surface.current?.querySelectorAll<SVGGElement>('[data-surah][data-aya]') || []) {
      if (typeof group.getBBox !== 'function' || group.querySelector('[data-baglib-hitbox]')) continue;
      const bounds = group.getBBox();
      const rectangle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rectangle.setAttribute('data-baglib-hitbox', '');
      rectangle.setAttribute('x', String(bounds.x - 3));
      rectangle.setAttribute('y', String(bounds.y - 5));
      rectangle.setAttribute('width', String(bounds.width + 6));
      rectangle.setAttribute('height', String(bounds.height + 10));
      rectangle.setAttribute('fill', 'transparent');
      group.insertBefore(rectangle, group.firstChild);
    }
    return () => { if (clickTimer.current) clearTimeout(clickTimer.current); };
  }, [markup]);

  useEffect(() => {
    for (const group of surface.current?.querySelectorAll<SVGGElement>('[data-surah][data-aya]') || []) {
      const location = svgWordLocation(group);
      if (!location) continue;
      group.setAttribute('tabindex', '0');
      group.setAttribute('role', 'button');
      group.setAttribute('aria-label', `${group.getAttribute('data-canonical') || group.getAttribute('data-hafs') || group.getAttribute('data-imlaey') || ''} — ${t('quranAyahInspector')} ${location.surah}:${location.ayah}`);
      group.toggleAttribute('data-baglib-selected', selectedAyah?.surah === location.surah && selectedAyah.ayah === location.ayah);
      const playing = Boolean(activeAudio?.isPlaying && activeAudio.surah === location.surah && activeAudio.ayah === location.ayah);
      group.toggleAttribute('data-baglib-playing', playing);
      group.toggleAttribute('data-baglib-audio-word', playing && Number(group.getAttribute('data-word-index-in-ayah')) === activeAudio?.activeWordIndex);
    }
  }, [markup, selectedAyah, activeAudio, t, fontLoaded]);

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
  const targetAt = (event: { target: EventTarget; clientX: number; clientY: number }) => {
    const direct = (event.target as Element).closest('[data-surah][data-aya]');
    if (direct) return direct;
    let nearest: Element | null = null;
    let distance = 12;
    for (const word of surface.current?.querySelectorAll('[data-surah][data-aya]') || []) {
      const bounds = word.getBoundingClientRect();
      const candidate = Math.hypot(Math.max(bounds.left - event.clientX, 0, event.clientX - bounds.right), Math.max(bounds.top - event.clientY, 0, event.clientY - bounds.bottom));
      if (candidate < distance) { nearest = word; distance = candidate; }
    }
    return nearest;
  };
  const number = (value: number) => new Intl.NumberFormat(lang).format(value);
  return <div dir={dir} data-quran-mushaf className="flex flex-col min-h-0 h-full" style={{ containerType: 'size' }}>
    <style>{`
      .mushaf-svg-surface svg { width:100%; height:auto; display:block; }
      .mushaf-svg-surface path { fill:currentColor; transition:fill 120ms ease,filter 120ms ease; }
      .mushaf-svg-surface [data-surah][data-aya] { cursor:pointer; pointer-events:all; }
      .mushaf-svg-surface span[data-surah][data-aya] { display:inline-block; padding-block:3px; padding-inline:2px; }
      .mushaf-svg-surface span[data-baglib-hover-ayah] { text-shadow:0 0 9px rgb(16 185 129 / .4); }
      .mushaf-svg-surface span[data-baglib-hover-word],.mushaf-svg-surface span[data-baglib-selected] { color:#059669; }
      .mushaf-svg-surface [data-baglib-selected] path { fill:#047857; }
      .mushaf-svg-surface [data-baglib-playing] path { fill:#059669; }
      .mushaf-svg-surface [data-baglib-hover-ayah] path { filter:drop-shadow(0 0 3px rgb(16 185 129 / .55)); stroke:rgb(16 185 129 / .16); stroke-width:1.5px; }
      .mushaf-svg-surface [data-baglib-audio-word] path { fill:#d97706; }
      .mushaf-svg-surface [data-baglib-hover-word] path,.mushaf-svg-surface [data-surah][data-aya]:focus-visible path { fill:#059669 !important; filter:drop-shadow(0 0 3px rgb(16 185 129 / .5)); }
      .dark .mushaf-svg-surface [data-baglib-selected] path,.dark .mushaf-svg-surface [data-baglib-hover-word] path { fill:#34d399 !important; }
    `}</style>
    <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2 rounded-2xl bg-surface/95 border border-subtle p-2 shadow-lg max-h-[70dvh] overflow-auto">
      <button type="button" disabled={page.pageNumber <= 1 || loading} onClick={() => onNavigatePage(page.pageNumber - 1)} aria-label={t('quranPrevious')} title={t('quranKeyboardHint')} className="p-2 rounded-lg border border-subtle disabled:opacity-30"><ChevronLeft className="size-4 rtl:rotate-180" /></button>
      <label className="flex flex-col items-center gap-1 text-xs"><span>{t('quranPage')}</span><input aria-label={t('quranJumpToPage')} type="number" min={1} max={page.totalPages} value={page.pageNumber} onChange={event => { const target = Number(event.target.value); if (Number.isInteger(target) && target >= 1 && target <= page.totalPages) onNavigatePage(target); }} className="w-16 min-w-0 rounded-lg border border-subtle bg-surface p-2 text-center" /><span>{number(page.totalPages)}</span></label>
      <button type="button" disabled={page.pageNumber >= page.totalPages || loading} onClick={() => onNavigatePage(page.pageNumber + 1)} aria-label={t('quranNext')} title={t('quranKeyboardHint')} className="p-2 rounded-lg border border-subtle disabled:opacity-30"><ChevronRight className="size-4 rtl:rotate-180" /></button>
      <button type="button" disabled={zoom <= 60} onClick={() => setZoom(value => Math.max(60, value - 10))} aria-label={t('quranZoomOut')} title={t('quranZoomOut')} className="p-2 rounded-lg border border-subtle disabled:opacity-30"><ZoomOut className="size-4" /></button>
      <button type="button" disabled={zoom >= 200} onClick={() => setZoom(value => Math.min(200, value + 10))} aria-label={t('quranZoomIn')} title={t('quranZoomIn')} className="p-2 rounded-lg border border-subtle disabled:opacity-30"><ZoomIn className="size-4" /></button>
      <button type="button" onClick={() => setZoom(100)} title={t('quranResetZoom')} className="p-2 text-xs rounded-lg border border-subtle">{number(zoom)}%</button>
      <button type="button" onClick={() => onCopyText(page.words.filter(word => word.type !== 'aya-mark').map(word => word.canonicalText || word.textHafs || '').join(' '))} aria-label={t('quranCopyPage')} title={t('quranCopyPage')} className="p-2 rounded-lg border border-subtle"><Copy className="size-4" /></button>
    </div>
    <div className="flex-1 min-h-0 overflow-auto overscroll-contain [scrollbar-gutter:stable_both-edges] bg-white dark:bg-zinc-950 px-14 sm:px-20 pt-16 pb-24">
      <div ref={surface} className="mushaf-svg-surface mx-auto text-zinc-900 dark:text-zinc-100" style={{ width: `${zoom}%`, containerType: 'inline-size', maxWidth: zoom === 100 ? 'min(100%, calc((100cqh - 10rem) * 0.68))' : undefined }} onClick={event => {
        const target = targetAt(event);
        if (clickTimer.current) clearTimeout(clickTimer.current);
        clickTimer.current = setTimeout(() => select(target), 250);
      }} onDoubleClick={event => {
        if (clickTimer.current) clearTimeout(clickTimer.current);
        const target = targetAt(event);
        const reference = svgWordLocation(target);
        onSelectAyah(null);
        if (reference) onExploreAyah?.({ ...reference, wordText: target?.getAttribute('data-canonical') || target?.getAttribute('data-hafs') || undefined });
      }} onContextMenu={event => {
        if (clickTimer.current) clearTimeout(clickTimer.current);
        const target = targetAt(event);
        const reference = svgWordLocation(target);
        if (reference && onContextAyah) { event.preventDefault(); onContextAyah({ ...reference, wordText: target?.getAttribute('data-canonical') || target?.getAttribute('data-hafs') || undefined }, { x: event.clientX, y: event.clientY }); }
      }} onPointerMove={event => highlight(targetAt(event))} onPointerOver={event => highlight(targetAt(event))} onPointerLeave={() => highlight(null)} onFocus={event => highlight(event.target as Element)} onBlur={() => highlight(null)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(event.target as Element); } }}>
        {page.glyphLines ? fontLoaded !== page.fontUrl ? <p role={fontError === page.fontUrl ? 'alert' : 'status'}>{t(fontError === page.fontUrl ? 'quranReaderError' : 'quranLoading')}</p> : <div dir="rtl" lang="ar" style={{ fontSize: page.layoutMode === 'adapted' ? '4.2cqw' : '5.5cqw', lineHeight: 1.8, aspectRatio: page.layoutMode === 'adapted' ? '382.68 / 547.09' : undefined }}>
          {page.glyphLines.map(line => <div key={line.number} data-quran-unicode-line={page.layoutMode === 'adapted' || undefined} style={page.layoutMode === 'adapted' ? { height: `${100 / 15}%`, alignItems: 'center' } : undefined} className={`flex min-h-[1.8em] ${line.centered || line.type !== 'ayah' ? 'justify-center' : 'justify-between'}`}>
            {line.type === 'ayah' ? line.words.map(word => <span key={`${word.surah}:${word.ayah}:${word.position}`} data-surah={word.surah} data-aya={word.ayah} data-word-index-in-ayah={word.position} data-canonical={word.text} style={{ fontFamily: word.marker ? 'sans-serif' : fontName, fontSize: word.marker ? '.6em' : undefined, whiteSpace: 'nowrap' }}>{word.glyph}</span>) : <span className="font-reading text-[.7em]">{line.type === 'surah_name' ? t('quranSurahNumber', { number: line.surah }) : page.basmala}</span>}
          </div>)}
        </div> : <div dangerouslySetInnerHTML={markup} />}
      </div>
    </div>
  </div>;
}
