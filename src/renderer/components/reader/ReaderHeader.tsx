'use client';
import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Search, PanelRight, Maximize2, MoreHorizontal, Save, Wrench, ZoomIn, ZoomOut, Check } from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import { Menu, type MenuItemProps } from '../ui/Menu';
import { MarkupBarCompact } from './ReaderMarkupBar';
import type { TranslationKey } from '../../translations';
import type { ReaderViewMode } from '../../libs/reader/types';

export interface ReaderHeaderProps {
  title: string; author?: string; format: string; dir: 'rtl' | 'ltr';
  page?: number; total?: number; onPage?: (page: number) => void;
  viewMode: ReaderViewMode; onViewMode: (mode: ReaderViewMode) => void;
  zoom?: number; onZoom?: (zoom: number) => void; onFit?: () => void; onReflow?: () => void;
  onClose: () => void; onPanel: () => void; panelOpen?: boolean; onSearch: () => void; onTools: () => void;
  onSave?: () => void; saveState?: string; saveLabel?: string; saveDisabled?: boolean;
  focusMode?: boolean; onFocusMode?: (focus: boolean) => void;
  visible?: boolean; onMouseEnter?: () => void; onMouseLeave?: () => void;
  markupBar?: React.ReactNode; overflowItems?: MenuItemProps[];
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

export function ReaderHeader({ title, author, format, dir, page, total, onPage, viewMode, onViewMode, zoom = 100, onZoom, onFit, onReflow,
  onClose, onPanel, panelOpen, onSearch, onTools, onSave, saveState = 'recorded', saveLabel, saveDisabled,
  focusMode = false, onFocusMode, visible = true, onMouseEnter, onMouseLeave, markupBar, overflowItems = [], t }: ReaderHeaderProps) {
  const [hasFocus, setHasFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [peek, setPeek] = useState(false);
  const [goTo, setGoTo] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const toolbarId = useId();
  const shown = visible || hasFocus || pinned || peek;
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const handleFocusIn = () => setHasFocus(true);
    const handleFocusOut = () => {
      setTimeout(() => {
        if (!el.contains(document.activeElement)) {
          setHasFocus(false);
        }
      }, 0);
    };
    el.addEventListener('focusin', handleFocusIn);
    el.addEventListener('focusout', handleFocusOut);
    return () => {
      el.removeEventListener('focusin', handleFocusIn);
      el.removeEventListener('focusout', handleFocusOut);
    };
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.key === 'F11' && onFocusMode) { event.preventDefault(); setHasFocus(false); setPeek(false); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); onFocusMode(!focusMode); }
      if (event.key === 'Escape' && focusMode) { setHasFocus(false); setPeek(false); onFocusMode?.(false); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [focusMode, onFocusMode]);
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (headerRef.current) {
        const rect = headerRef.current.getBoundingClientRect();
        const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
        if (!inside && peek) {
          setPeek(false);
          onMouseLeave?.();
        }
      }
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, [peek, onMouseLeave]);
  useEffect(() => {
    const header = headerRef.current;
    const region = header?.closest<HTMLElement>('[role="region"]');
    if (!header || !region) return;
    const update = () => region.style.setProperty('--reader-toolbar-bottom', shown ? `${header.getBoundingClientRect().bottom}px` : '0px');
    update(); const observer = new ResizeObserver(update); observer.observe(header);
    return () => { observer.disconnect(); region.style.removeProperty('--reader-toolbar-bottom'); };
  }, [shown]);
  const number = (value: number) => value.toLocaleString(dir === 'rtl' ? 'ar' : 'en');
  const modes = [ ['single', 'viewModeSingle'], ['two-column', 'viewModeTwoColumn'], ['scrolled', 'viewModeScrolled'] ] as const;
  const overflow: MenuItemProps[] = [
    ...modes.map(([mode, label]) => ({ label: t(label), onClick: () => onViewMode(mode) })),
    ...(onReflow ? [{ label: t('pdfA11yReflowReader'), onClick: onReflow }] : []),
    ...(onZoom ? [ { label: t('quranZoomIn'), icon: <ZoomIn className="size-4" />, onClick: () => onZoom(Math.min(300, zoom + 10)) }, { label: t('quranZoomOut'), icon: <ZoomOut className="size-4" />, onClick: () => onZoom(Math.max(50, zoom - 10)) } ] : []),
    ...(onFit ? [{ label: t('fitPage'), onClick: onFit }] : []),
    ...overflowItems,
  ];
  return <>
    <Button variant="secondary" size="sm" data-reader-toolbar-toggle aria-controls={toolbarId} aria-expanded={shown} aria-keyshortcuts="Alt+M" onClick={() => setPinned(value => !value)}
      className="fixed bottom-16 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 z-[60] min-h-11 max-w-[calc(100vw-2rem)] text-primary-text shadow-sm motion-reduce:transition-none">{t(pinned ? 'readerToolbarUnpin' : 'readerToolbarShow')}</Button>
    {focusMode && <div data-reader-focus-zone className="absolute inset-x-0 top-0 z-30 h-3" onPointerEnter={() => setPeek(true)} onPointerDown={() => setPinned(true)} />}
    <header ref={headerRef} id={toolbarId} data-reader-top-bar data-reader-shared-header data-pdf-header={format === 'PDF' ? '' : undefined} role="toolbar" aria-label={t('a11yToolbarLandmark')} dir={dir}
      onFocusCapture={() => setHasFocus(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHasFocus(false); }}
      onMouseEnter={() => { setPeek(true); onMouseEnter?.(); }} onMouseLeave={() => { setPeek(false); onMouseLeave?.(); }}
      className={`${focusMode ? 'absolute top-0 inset-x-0' : 'relative'} z-40 flex h-14 min-h-14 w-full shrink-0 flex-nowrap items-center gap-1 border-b border-border bg-surface/95 px-2 text-text backdrop-blur-xl select-none transition-[transform,opacity] duration-200 motion-reduce:transition-none`}
      style={{ transform: shown ? 'translateY(0)' : 'translateY(-110%)', opacity: shown ? 1 : 0, pointerEvents: shown ? 'auto' : 'none' }}>
      <IconButton size="sm" label={t('backToLibrary')} onClick={onClose} className="shrink-0"><ArrowLeft className="size-4 rtl:rotate-180" /></IconButton>
      <div className="min-w-0 flex-1 text-start" title={[title, author].filter(Boolean).join(' · ')}>
        <h2 className="truncate text-xs font-bold leading-relaxed" dir="auto">{title}</h2>
        {author && <p className="truncate text-[10px] text-text-muted leading-relaxed" dir="auto">{author}</p>}
      </div>
      {onPage && <form className="flex shrink-0 items-center gap-1 text-[11px]" onSubmit={event => { event.preventDefault(); const next = Number(goTo); if (Number.isFinite(next) && next >= 1) onPage(Math.min(total ?? 1, Math.floor(next))); setGoTo(null); }}>
        <input data-reader-go-to type="number" min={1} max={total} aria-label={t('readerGoToPage')} value={goTo ?? page ?? 1} onChange={event => setGoTo(event.target.value)} onBlur={() => setGoTo(null)} className="w-11 rounded-md border border-border bg-canvas px-1 py-1.5 text-center tabular-nums focus-visible:outline-focus" />
        <span className="hidden sm:inline text-text-muted whitespace-nowrap">/ {number(total ?? 1)}</span>
      </form>}
      <div className="hidden min-[1000px]:flex shrink-0 items-center gap-1">
        <select aria-label={t('readerViewMode')} value={viewMode} onChange={event => { if (event.target.value === 'reflow') onReflow?.(); else onViewMode(event.target.value as ReaderViewMode); }} className="max-w-28 rounded-lg border border-border bg-canvas px-2 py-1.5 text-xs leading-relaxed">
          {modes.map(([mode, label]) => <option key={mode} value={mode}>{t(label)}</option>)}
          {onReflow && <option value="reflow">{t('pdfA11yReflowReader')}</option>}
        </select>
        {onZoom && <><IconButton size="sm" label={t('quranZoomOut')} onClick={() => onZoom(Math.max(50, zoom - 10))}><ZoomOut className="size-4" /></IconButton><span className="w-9 text-center text-[11px] tabular-nums">{number(zoom)}%</span><IconButton size="sm" label={t('quranZoomIn')} onClick={() => onZoom(Math.min(300, zoom + 10))}><ZoomIn className="size-4" /></IconButton></>}
        {onFit && <Button size="sm" variant="secondary" onClick={onFit}>{t('fitPage')}</Button>}
      </div>
      <MarkupBarCompact.Provider value={true}>{markupBar}</MarkupBarCompact.Provider>
      <IconButton size="sm" label={t('readerPanelTitle')} data-reader-panel-toggle data-toggle-knowledge aria-pressed={panelOpen} onClick={onPanel} className="shrink-0"><PanelRight className="size-4 rtl:-scale-x-100" /></IconButton>
      <IconButton size="sm" label={t('searchInBook')} data-reader-search onClick={onSearch} className="shrink-0"><Search className="size-4" /></IconButton>
      <IconButton size="sm" label={t(format === 'PDF' ? 'pdfCompactToolsBtn' : 'typographySettings')} data-reader-tools onClick={onTools} className="shrink-0"><Wrench className="size-4" /></IconButton>
      <span data-reader-ocr-status-slot className="empty:hidden" />
      <span data-pdf-save-state={saveState} role="status" title={saveLabel ?? t('readerMarksRecorded')} className="hidden min-[1100px]:inline-flex shrink-0 items-center gap-1 text-[10px] text-text-muted"><Check className="size-3" />{saveLabel ?? t('readerMarksRecorded')}</span>
      {onSave && <IconButton size="sm" label={t('pdfSaveDocument')} data-reader-save disabled={saveDisabled} onClick={onSave} className="shrink-0"><Save className="size-4" /></IconButton>}
      {onFocusMode && <IconButton size="sm" label={t('zenModePurePage')} aria-keyshortcuts="F11" aria-pressed={focusMode} data-reader-focus-toggle onClick={event => { event.currentTarget.blur(); setPinned(false); setPeek(false); onFocusMode(!focusMode); }} className="shrink-0"><Maximize2 className="size-4" /></IconButton>}
      <Menu align="end" trigger={props => <IconButton {...props} size="sm" label={t('pdfHeaderMore')} data-pdf-header-more className="shrink-0"><MoreHorizontal className="size-4" /></IconButton>} items={overflow} className="max-h-[75vh] overflow-y-auto" />
    </header>
  </>;
}
