'use client';
import React, { useCallback, useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { READER_CHROME_TABS, resizeReaderPanel, type ReaderChromeTab } from './reader-chrome-state';
import type { TranslationKey } from '../../translations';

export function ReaderSidePanel({ open, tab, onTab, onClose, width, onResize, dir, children, t }: {
  open: boolean; tab: ReaderChromeTab; onTab: (tab: ReaderChromeTab) => void; onClose: () => void;
  width: number; onResize: (width: number) => void; dir: 'rtl' | 'ltr'; children: React.ReactNode;
  t: (key: TranslationKey) => string;
}) {
  const [narrow, setNarrow] = useState(false);
  const id = useId();
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setNarrow(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const close = useCallback(() => onClose(), [onClose]);
  const tabs = <div role="tablist" aria-label={t('readerPanelTitle')} className="grid grid-cols-4 gap-1 border-b border-border p-2 shrink-0">
    {READER_CHROME_TABS.map((entry, index) => <button key={entry.id} type="button" role="tab" id={`${id}-${entry.id}`} aria-controls={`${id}-content`} aria-selected={tab === entry.id} tabIndex={tab === entry.id ? 0 : -1} data-reader-panel-tab={entry.id}
      onClick={() => onTab(entry.id)} onKeyDown={event => {
        const step = event.key === 'ArrowRight' ? (dir === 'rtl' ? -1 : 1) : event.key === 'ArrowLeft' ? (dir === 'rtl' ? 1 : -1) : 0;
        if (!step && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (index + step + 4) % 4;
        onTab(READER_CHROME_TABS[next].id);
        document.getElementById(`${id}-${READER_CHROME_TABS[next].id}`)?.focus();
      }} className={`min-w-0 rounded-lg px-1 py-2 text-xs leading-relaxed focus-visible:outline-2 focus-visible:outline-focus ${tab === entry.id ? 'bg-primary/10 text-primary-text font-bold' : 'text-text-muted hover:bg-canvas'}`}>{t(entry.label)}</button>)}
  </div>;
  const content = <>{tabs}<div role="tabpanel" id={`${id}-content`} aria-labelledby={`${id}-${tab}`} className="flex-1 min-h-0 overflow-auto">{children}</div></>;
  if (!open) return null;
  if (narrow) return <Sheet open onClose={close} title={t('readerPanelTitle')} side="bottom" className="h-[60dvh] [&>div:last-child]:p-0 [&>div:last-child]:flex [&>div:last-child]:flex-col"><div data-reader-side-panel data-reader-panel-sheet className="flex h-full min-h-0 flex-col">{content}</div></Sheet>;
  return <aside data-reader-side-panel aria-label={t('readerPanelTitle')} dir={dir} className="absolute top-14 bottom-0 end-0 z-40 flex min-h-0 flex-col border-s border-border bg-surface text-text shadow-sm" style={{ width: Math.min(width, Math.max(280, window.innerWidth - 500)) }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }}>
    <div role="separator" tabIndex={0} aria-label={t('readerPanelResize')} aria-orientation="vertical" aria-valuemin={280} aria-valuemax={Math.min(480, window.innerWidth - 500)} aria-valuenow={width}
      className="absolute inset-y-0 -start-1 z-10 w-2 cursor-col-resize touch-none focus-visible:bg-primary/30 focus-visible:outline-2 focus-visible:outline-focus"
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onResize(resizeReaderPanel(width, event.key === 'ArrowRight' ? 20 : -20, dir, window.innerWidth)); } }}
      onPointerDown={event => {
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.dataset.origin = `${event.clientX},${width}`;
      }} onPointerMove={event => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const [origin, initial] = event.currentTarget.dataset.origin!.split(',').map(Number);
        onResize(resizeReaderPanel(initial, event.clientX - origin, dir, window.innerWidth));
      }} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} />
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3"><span className="text-xs font-semibold">{t('readerPanelTitle')}</span><IconButton size="sm" label={t('close')} onClick={onClose}><X className="size-4" /></IconButton></div>
    {content}
  </aside>;
}
