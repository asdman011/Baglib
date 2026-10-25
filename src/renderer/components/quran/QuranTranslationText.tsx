'use client';

import React, { useId, useRef } from 'react';
import type { QuranTranslation } from '../../../shared/types/quran';
import type { TranslationKey } from '../../translations';

export function QuranTranslationText({ translation, t }: { translation: QuranTranslation; t: (key: TranslationKey, params?: Record<string, string | number>) => string }) {
  const identity = `quran-note-${useId().replace(/[^a-z0-9_-]/gi, '')}`;
  const details = useRef<HTMLDetailsElement>(null);
  const noteList = useRef<HTMLOListElement>(null);
  let cursor = 0;
  const inline: React.ReactNode[] = [];
  for (const [index, anchor] of (translation.anchors || []).entries()) {
    if (!Number.isInteger(anchor.offset) || !Number.isInteger(anchor.note) || anchor.offset < cursor || anchor.offset > translation.text.length || anchor.note < 1 || anchor.note > translation.notes.length) continue;
    inline.push(translation.text.slice(cursor, anchor.offset));
    inline.push(<sup key={index} id={`${identity}-marker-${anchor.note}`} className="text-[0.7em] leading-none font-semibold text-emerald-700 dark:text-emerald-300 ms-0.5"><a href={`#${identity}-note-${anchor.note}`} aria-label={t('quranFootnoteNumber', { number: anchor.note })} title={translation.notes[anchor.note - 1]} onClick={event => {
      event.preventDefault();
      if (details.current) details.current.open = true;
      const note = noteList.current?.children.item(anchor.note - 1) as HTMLLIElement | null;
      note?.focus({ preventScroll: true });
      note?.scrollIntoView({ block: 'nearest' });
    }} className="rounded px-0.5 focus-visible:outline-2 focus-visible:outline-emerald-500">[{anchor.note}]</a></sup>);
    cursor = anchor.offset;
  }
  inline.push(translation.text.slice(cursor));
  return <>
    <p data-quran-translation>{inline}</p>
    {translation.notes.length > 0 && <details ref={details} className="mt-3 text-sm text-muted"><summary className="cursor-pointer">{t('quranFootnotes', { count: translation.notes.length })}</summary><ol ref={noteList} className="list-decimal ps-6 space-y-3 mt-3">{translation.notes.map((note, index) => <li id={`${identity}-note-${index + 1}`} key={index} tabIndex={-1} className="rounded p-2 leading-relaxed focus:bg-emerald-500/10 focus:outline-emerald-500">{note}{translation.anchors?.some(anchor => anchor.note === index + 1) && <a href={`#${identity}-marker-${index + 1}`} onClick={event => { event.preventDefault(); const marker = details.current?.parentElement?.querySelector<HTMLAnchorElement>(`[id="${identity}-marker-${index + 1}"] a`); marker?.focus(); marker?.scrollIntoView({ block: 'nearest' }); }} className="ms-2 inline-block text-emerald-700 dark:text-emerald-300 underline">{t('quranBackToFootnote', { number: index + 1 })}</a>}</li>)}</ol></details>}
  </>;
}
