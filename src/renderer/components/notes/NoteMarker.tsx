'use client';
import React from 'react';
import { StickyNote } from 'lucide-react';
import type { TranslationKey } from '../../translations';

/** KEY-337: a small marker beside a passage that already has notes; it opens them in the note side panel. */
export function NoteMarker({ count, t, onOpen, className = '' }: { count: number; t: (key: TranslationKey, params?: Record<string, string | number>) => string; onOpen: () => void; className?: string }) {
  const lang = typeof document !== 'undefined' && document.documentElement.lang.startsWith('ar') ? 'ar' : 'en';
  const label = t(`noteMarkerLabel_${new Intl.PluralRules(lang).select(count)}` as TranslationKey, { count: new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US').format(count) });
  return <button type="button" data-note-marker data-note-count={count} onClick={event => { event.stopPropagation(); onOpen(); }} title={label} aria-label={label}
    className={`inline-flex items-center gap-0.5 rounded-full border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-amber-700 hover:bg-amber-500/20 focus-visible:outline-2 focus-visible:outline-focus dark:text-amber-300 ${className}`}>
    <StickyNote className="size-3" aria-hidden="true" /><span>{new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US').format(count)}</span>
  </button>;
}
