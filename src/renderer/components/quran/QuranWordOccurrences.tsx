'use client';
import React, { useEffect, useState } from 'react';
import type { QuranFrequencyFamily, QuranFrequencyPlace } from '../../../shared/types/quran';
import type { TranslationKey } from '../../translations';

export const QURAN_OCCURRENCE_BATCH = 50;
export function QuranWordCompatibilityNotice({ compatibility, t }: { compatibility?: 'qul-37-130'; t: (key: TranslationKey) => string }) {
  return compatibility ? <p data-quran-word-compatibility role="note" className="my-2 rounded-lg border border-amber-500/50 p-2 text-sm leading-loose">{t('quranWordCompatibility37130')}</p> : null;
}
export function QuranWordOccurrences({ family, text, t, onNavigateAyah }: {
  family: QuranFrequencyFamily; text: string; t: (key: TranslationKey) => string;
  onNavigateAyah?: (reference: { surah: number; ayah: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ places: QuranFrequencyPlace[]; failed: boolean } | null>(null);
  const [limit, setLimit] = useState(QURAN_OCCURRENCE_BATCH);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void window.electronAPI.quran.frequencyPlaces({ family, text }).then(value => {
      if (alive) setResult(value.ok ? { places: value.data, failed: false } : { places: [], failed: true });
    }).catch(() => { if (alive) setResult({ places: [], failed: true }); });
    return () => { alive = false; };
  }, [open, family, text]);
  return <div className="my-1" data-quran-occurrences={family}>
    <button type="button" aria-expanded={open} className="text-xs underline" onClick={() => { setOpen(value => !value); setLimit(QURAN_OCCURRENCE_BATCH); }}>{t('quranWordOtherOccurrences')}</button>
    {open && (!result ? <p role="status">{t('quranLoading')}</p> : result.failed ? <p role="alert">{t('quranReaderError')}</p> : <>
      <p dir="rtl" lang="ar" className="font-reading text-xl leading-loose">{text}</p>
      {result.places.length === 0 && <p>{t('noSearchResults')}</p>}
      <div className="flex flex-wrap gap-2" dir="ltr">{result.places.slice(0, limit).map(place => <button data-quran-occurrence={`${place.surah}:${place.ayah}`} key={`${place.surah}:${place.ayah}`} type="button" className="rounded border border-subtle px-2 py-1 text-xs underline" onClick={() => onNavigateAyah?.({ surah: place.surah, ayah: place.ayah })}>{place.surah}:{place.ayah}</button>)}</div>
      {result.places.length > limit && <button type="button" data-quran-occurrence-more className="mt-2 text-xs underline" onClick={() => setLimit(value => value + QURAN_OCCURRENCE_BATCH)}>{t('quranWordShowMore')}</button>}
    </>)}
  </div>;
}
