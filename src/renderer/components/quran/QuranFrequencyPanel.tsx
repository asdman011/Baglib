'use client';

import React, { useEffect, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { navigateStudyReference } from '../../utils/study-navigation';
import type { QuranFrequency, QuranFrequencyFamily, QuranFrequencyPlace } from '../../../shared/types/quran';

const control = 'rounded-lg border border-subtle bg-surface p-2 text-sm text-main min-w-0';

export function QuranFrequencyPanel() {
  const { t, dir, lang } = useWorkspace();
  const [family, setFamily] = useState<QuranFrequencyFamily>('root');
  const [text, setText] = useState('');
  const [surah, setSurah] = useState(0);
  const [data, setData] = useState<QuranFrequency | null>(null);
  const [missing, setMissing] = useState(false);
  const [open, setOpen] = useState<{ text: string; places: QuranFrequencyPlace[] } | null>(null);
  const number = new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US');

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void window.electronAPI.quran.frequency({ family, text: text.trim(), surah: surah || undefined, limit: 200 }).then(result => {
        if (!alive) return;
        setMissing(!result.ok);
        setData(result.ok ? result.data : null);
      });
    }, 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [family, text, surah]);

  const showPlaces = async (entry: string) => {
    const result = await window.electronAPI.quran.frequencyPlaces({ family, text: entry });
    if (result.ok) setOpen({ text: entry, places: result.data });
  };

  return <div dir={dir} className="flex-1 min-h-0 overflow-auto p-4 sm:p-6">
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="space-y-1">
        <h2 className="font-display text-lg font-bold">{t('quranFrequencyTitle')}</h2>
        <p className="text-xs text-muted leading-relaxed">{t('quranFrequencySource')}</p>
      </header>
      <div className="flex flex-wrap gap-2">
        <div role="group" aria-label={t('quranFrequencyTitle')} className="flex gap-1">{(['root', 'lemma'] as const).map(value => <button key={value} type="button" aria-pressed={family === value} onClick={() => { setFamily(value); setOpen(null); }} className={`rounded-lg px-3 py-2 text-sm ${family === value ? 'bg-pale-sky-600 text-white' : 'border border-subtle'}`}>{t(value === 'root' ? 'quranMorphologyRoot' : 'quranMorphologyLemma')}</button>)}</div>
        <input value={text} onChange={event => setText(event.target.value)} maxLength={100} dir="rtl" lang="ar" placeholder={t('quranFrequencySearch')} aria-label={t('quranFrequencySearch')} className={`${control} flex-1`} />
        <label className="flex items-center gap-2 text-sm"><span>{t('quranFrequencySurah')}</span><input type="number" min={0} max={114} value={surah || ''} placeholder={t('quranFrequencyAll')} onChange={event => setSurah(Math.min(114, Math.max(0, Number(event.target.value) || 0)))} className={`${control} w-24`} /></label>
      </div>
      {missing && <p role="alert" className="text-sm leading-relaxed">{t('quranFrequencyMissing')}</p>}
      {data && <p className="text-xs text-muted">{t('quranFrequencyTotal', { total: number.format(data.total), distinct: number.format(data.distinct) })}</p>}
      {data && data.rows.length === 0 && <p className="text-sm text-muted">{t('noSearchResults')}</p>}
      <ol className="space-y-1">{data?.rows.map(row => <li key={row.text}>
        <button type="button" aria-expanded={open?.text === row.text} onClick={() => open?.text === row.text ? setOpen(null) : void showPlaces(row.text)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-subtle px-3 py-2">
          <span dir="rtl" lang="ar" className="font-reading text-xl leading-loose">{row.text}</span><span className="text-end"><bdi className="block text-sm text-muted">{number.format(row.stated ?? row.count)}</bdi>{row.stated !== undefined && row.stated !== row.count && <small className="block text-xs text-muted">{t('quranFrequencyLinked', { count: number.format(row.count) })}</small>}</span>
        </button>
        {open?.text === row.text && <div className="flex flex-wrap gap-2 p-2" dir="ltr">{open.places.map(place => <button key={`${place.surah}:${place.ayah}`} type="button" className="text-xs underline" onClick={() => void navigateStudyReference(`quran:hafs:${place.surah}:${place.ayah}`, [], () => {}, () => {}).catch(() => {})}>{place.surah}:{place.ayah}{place.count > 1 && ` ×${place.count}`}</button>)}</div>}
      </li>)}</ol>
    </div>
  </div>;
}
