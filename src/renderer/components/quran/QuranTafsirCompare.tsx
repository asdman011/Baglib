'use client';

import React, { useEffect, useState } from 'react';
import type { QuranCommentary, QuranReaderSource } from '../../../shared/types/quran';
import type { TranslationKey } from '../../translations';
import { QuranRichText } from './QuranRichText';

type Reference = { surah: number; ayah: number };
type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;
type Column = { id: string; commentary: QuranCommentary | null };

export function QuranTafsirCompare({ script, profile, preferred, reference, surahs, t, lang, onReference }: {
  script: string; profile: 'hafs' | 'warsh'; preferred: string; reference: Reference;
  surahs: { number: number; count: number }[]; t: Translate; lang: 'ar' | 'en';
  onReference: (reference: Reference) => void;
}) {
  const [catalog, setCatalog] = useState<{ key: string; sources: QuranReaderSource[]; selected: string[] } | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [results, setResults] = useState<{ key: string; columns: Column[] }>({ key: '', columns: [] });
  const setting = `quran.tafsir.compare.v1.${profile}`;
  const catalogKey = JSON.stringify([script, profile]);
  useEffect(() => {
    let alive = true;
    const api = window.electronAPI.quran;
    const load = async () => {
      try {
        const [result, remembered] = await Promise.all([
          api.readerCatalog(), window.electronAPI.settings.get(setting).catch(() => undefined),
        ]);
        if (!alive) return;
        if (!result.ok) throw new Error(result.error);
        const sources = result.data.sources.filter(source => source.kind === 'tafsir' && source.profile === profile);
        const saved = Array.isArray(remembered) ? remembered.filter((id): id is string => typeof id === 'string' && sources.some(source => source.id === id)) : [];
        const selected = [...new Set(saved)].slice(0, 4);
        // Fill gaps left by removed packs, preserving the user's order where possible.
        for (const id of [preferred, ...sources.map(source => source.id)]) {
          if (selected.length >= Math.min(2, sources.length)) break;
          if (sources.some(source => source.id === id) && !selected.includes(id)) selected.push(id);
        }
        setCatalog({ key: catalogKey, sources, selected }); setCatalogError(false);
      } catch { if (alive) setCatalogError(true); }
    };
    void load();
    const unsubscribe = api.onChanged?.(() => { void load(); });
    return () => { alive = false; unsubscribe?.(); };
  }, [catalogKey, profile, script, preferred, setting]);
  const ready = catalog?.key === catalogKey;
  const selected = ready ? catalog.selected : [];
  const selectionKey = JSON.stringify(selected);
  const key = JSON.stringify([script, profile, reference.surah, reference.ayah, selectionKey]);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    // Coalesce rapid navigation and bound each request to four installed packs.
    const timer = setTimeout(() => {
      void Promise.all((JSON.parse(selectionKey) as string[]).slice(0, 4).map(async id => {
        try {
          const result = await window.electronAPI.quran.commentary({ script, pack: id, surah: reference.surah, ayah: reference.ayah });
          return { id, commentary: result.ok ? result.data : null };
        } catch { return { id, commentary: null }; }
      })).then(columns => { if (alive) setResults({ key, columns }); });
    }, 120);
    return () => { alive = false; clearTimeout(timer); };
  }, [key, ready, script, profile, reference.surah, reference.ayah, selectionKey]);
  const choose = (id: string, checked: boolean) => {
    if (!ready) return;
    const selected = checked ? [...catalog.selected, id] : catalog.selected.filter(value => value !== id);
    if (selected.length > 4 || selected.length < Math.min(2, catalog.sources.length)) return;
    setCatalog({ ...catalog, selected }); setSaveError(false);
    void window.electronAPI.settings.set(setting, selected).catch(() => setSaveError(true));
  };
  const current = surahs.find(surah => surah.number === reference.surah);
  const previousSurah = surahs.find(surah => surah.number === reference.surah - 1);
  const nextSurah = surahs.find(surah => surah.number === reference.surah + 1);
  const previous = reference.ayah > 1 ? { ...reference, ayah: reference.ayah - 1 } : previousSurah ? { surah: previousSurah.number, ayah: previousSurah.count } : null;
  const next = current && reference.ayah < current.count ? { ...reference, ayah: reference.ayah + 1 } : nextSurah ? { surah: nextSurah.number, ayah: 1 } : null;
  const format = (value: string) => value.split(':').map(number => new Intl.NumberFormat(lang).format(Number(number))).join(':');
  return <div data-tafsir-compare data-reference={`${reference.surah}:${reference.ayah}`} className="min-w-0">
    <nav aria-label={t('quranTafsirCompare')} className="mb-3 flex flex-wrap items-center gap-2 text-sm">
      <button data-tafsir-previous type="button" disabled={!previous} onClick={() => previous && onReference(previous)} className="rounded-lg border border-subtle px-3 py-2 disabled:opacity-40">{t('quranTafsirPrevious')}</button>
      <bdi className="tabular-nums">{format(`${reference.surah}:${reference.ayah}`)}</bdi>
      <button data-tafsir-next type="button" disabled={!next} onClick={() => next && onReference(next)} className="rounded-lg border border-subtle px-3 py-2 disabled:opacity-40">{t('quranTafsirNext')}</button>
    </nav>
    {catalogError ? <p role="alert">{t('quranReaderError')}</p> : !ready ? <p role="status">{t('quranLoading')}</p> : <>
      <fieldset className="mb-4 min-w-0 rounded-xl border border-subtle p-3 text-sm">
        <legend className="px-1">{t('quranTafsirChoose')}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">{catalog.sources.map(source => {
          const checked = selected.includes(source.id);
          return <label key={source.id} className="flex min-w-0 items-start gap-2 leading-loose"><input data-tafsir-picker={source.id} type="checkbox" checked={checked} disabled={checked ? selected.length <= Math.min(2, catalog.sources.length) : selected.length >= 4} onChange={event => choose(source.id, event.target.checked)} className="mt-2 shrink-0" /><bdi>{source.title}</bdi></label>;
        })}</div>
      </fieldset>
      {catalog.sources.length < 2 && <p data-tafsir-few role="status" className="mb-3 text-sm leading-loose text-muted">{t('quranTafsirFew')}</p>}
      {saveError && <p role="alert" className="text-sm">{t('quranTafsirSaveFailed')}</p>}
      <div className="grid grid-cols-1 gap-4 min-[640px]:grid-cols-2 min-[1100px]:grid-cols-[repeat(var(--tafsir-columns),minmax(0,1fr))]" style={{ '--tafsir-columns': Math.max(1, selected.length) } as React.CSSProperties}>
        {selected.map(id => {
          const source = catalog.sources.find(source => source.id === id)!;
          // Both currently supported presets are Arabic; explicit language metadata takes priority.
          const language = source.language || 'ar';
          const loaded = results.key === key;
          const commentary = loaded ? results.columns.find(column => column.id === id)?.commentary : null;
          return <article data-tafsir-column={id} data-loaded={loaded} key={id} dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language} className="min-w-0 rounded-xl border border-subtle p-4 text-start">
            <header className="mb-3 border-b border-subtle pb-3">
              <h3 className="font-semibold leading-loose"><bdi>{source.title}</bdi></h3>
              <p className="text-xs leading-loose text-muted">{t(language === 'ar' ? 'quranTafsirArabic' : 'quranTafsirEnglish')}</p>
              {commentary && <p data-tafsir-range dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} className="text-xs leading-loose text-muted">{t('quranTafsirRange', { from: '\u2066' + format(commentary.from) + '\u2069', to: '\u2066' + format(commentary.to) + '\u2069' })}</p>}
            </header>
            {!loaded ? <p role="status" className="text-sm">{t('quranLoading')}</p> : !commentary ? <p data-tafsir-unavailable dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} role="status" className="text-sm leading-loose">{t('quranTafsirUnavailable')}</p> : <div data-tafsir-body className="font-reading text-xl leading-[2.3] [overflow-wrap:anywhere]"><QuranRichText nodes={commentary.nodes} /></div>}
          </article>;
        })}
      </div>
    </>}
  </div>;
}
