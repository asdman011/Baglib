'use client';

import React, { useEffect, useRef } from 'react';
import { Copy, CopyCheck, ExternalLink, X } from 'lucide-react';
import type { QuranAyahDetails } from '../../../shared/types/quran';
import type { TranslationKey } from '../../translations';

export function QuranAyahInspector({ details, reference, surahName, error, t, dir, onClose, onCopy, onStudy, onSimilar }: {
  details: QuranAyahDetails | null; reference: { surah: number; ayah: number }; surahName: string; error: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string; dir: 'rtl' | 'ltr';
  onClose: () => void; onCopy: (text: string) => void; onStudy: () => void; onSimilar?: () => void;
}) {
  const drawer = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    drawer.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const copy = (text: string) => onCopy(`${text}\n[${reference.surah}:${reference.ayah}]`);
  return <div dir={dir} className="fixed inset-0 z-[80]" data-quran-inspector-layer>
    <button type="button" aria-label={t('quranClosePanel')} onClick={onClose} className="absolute inset-0 bg-black/20" tabIndex={-1} />
    <aside ref={drawer} role="dialog" aria-modal="true" aria-labelledby="quran-inspector-title" className="absolute inset-y-0 start-0 w-[min(28rem,100%)] bg-surface text-main border-e border-subtle shadow-2xl p-5 overflow-y-auto space-y-5" onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); close.current(); }
      if (event.key === 'Tab') {
        const buttons = [...(drawer.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])];
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header className="flex items-start justify-between gap-3"><div><h2 id="quran-inspector-title" className="font-semibold">{t('quranAyahInspector')}</h2><p className="mt-2 leading-relaxed">{surahName} <bdi>{reference.surah}:{reference.ayah}</bdi></p></div><button type="button" aria-label={t('quranClosePanel')} onClick={onClose} className="p-2 rounded-lg border border-subtle"><X className="size-4" /></button></header>
      {!details ? <p role={error ? 'alert' : 'status'}>{t(error ? 'quranReaderError' : 'quranLoading')}</p> : <>
        <section className="space-y-3"><h3 className="text-sm text-muted">{t(details.profile === 'hafs' ? 'quranCanonicalHafs' : 'quranScriptChoice')}</h3><p dir="rtl" lang="ar" className="font-reading text-2xl leading-[2.5] break-words select-text">{details.canonical}</p><button type="button" onClick={() => copy(details.canonical)} className="flex items-center gap-2 text-sm rounded-xl border border-subtle px-3 py-2"><Copy className="size-4" />{t('quranCopyCanonical')}</button></section>
        <section className="space-y-3 border-t border-subtle pt-4"><h3 className="text-sm text-muted">{t('quranImlaey')}</h3>{details.imlaey ? <><p dir="rtl" lang="ar" className="font-reading text-xl leading-[2.3] break-words select-text">{details.imlaey}</p><button type="button" onClick={() => copy(details.imlaey!)} className="flex items-center gap-2 text-sm rounded-xl border border-subtle px-3 py-2"><Copy className="size-4" />{t('quranCopyImlaey')}</button></> : <p className="text-sm text-muted leading-relaxed">{t('quranImlaeyUnavailable')}</p>}</section>
      </>}
      <div className="flex flex-wrap gap-2 pt-2">
        <button data-quran-study-jump type="button" onClick={onStudy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 text-white px-4 py-3 text-sm"><ExternalLink className="size-4 rtl:rotate-180" />{t('quranOpenInStudyReader')}</button>
        {onSimilar && <button type="button" onClick={onSimilar} className="inline-flex items-center gap-2 rounded-xl border border-subtle px-4 py-3 text-sm hover:bg-pale-sky-500/10 transition-colors"><CopyCheck className="size-4 text-emerald-600 dark:text-emerald-400" />{t('quranSimilarAyahs')}</button>}
      </div>
    </aside>
  </div>;
}
