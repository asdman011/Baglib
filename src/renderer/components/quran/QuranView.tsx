'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Download, FolderOpen, RefreshCw, Search, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { QURAN_CATEGORIES, type QuranCategory, type QuranError, type QuranLibrary, type QuranResource } from '../../../shared/types/quran';
import type { TranslationKey } from '../../translations';
import { useWorkspace } from '../context/WorkspaceContext';

export const quranCategoryKeys: Record<QuranCategory, TranslationKey> = {
  'quran-script': 'quranCatScript', 'mushaf-layout': 'quranCatLayout', font: 'quranCatFont', 'quran-metadata': 'quranCatMetadata', translation: 'quranCatTranslation', tafsir: 'quranCatTafsir', recitation: 'quranCatRecitation', transliteration: 'quranCatTransliteration', 'surah-info': 'quranCatSurah', 'ayah-topics': 'quranCatTopics', morphology: 'quranCatMorphology', mutashabihat: 'quranCatMutashabihat', 'similar-ayah': 'quranCatSimilar', 'ayah-theme': 'quranCatTheme',
};
const errorKeys: Record<QuranError, TranslationKey> = {
  unavailable: 'quranDesktopRequired', network: 'quranNetworkError', 'invalid-resource': 'quranInvalidResource', restricted: 'quranRestricted', 'invalid-package': 'quranInvalidPackage', 'unsupported-format': 'quranUnsupportedFormat', storage: 'quranStorageError', cancelled: 'quranCancelled', interrupted: 'quranInterrupted', busy: 'quranBusy',
};
type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;
type Tab = 'all' | 'installed' | 'downloads';
const empty: QuranLibrary = { resources: [], installed: [], jobs: [], directory: '', hasMore: false, catalogStatus: 'cached-partial' };

export function QuranLibraryPanel({ library, t, lang, tab, onDownload, onImport, onRemove, onCancel, onRetry, busy }: {
  library: QuranLibrary; t: Translate; lang: 'ar' | 'en'; tab: Tab; busy: boolean;
  onDownload: (resource: QuranResource) => void; onImport: (resource: QuranResource) => void;
  onRemove: (id: string) => void; onCancel: (id: string) => void;
  onRetry?: (resourceId: string) => void;
}) {
  const size = (bytes: number) => new Intl.NumberFormat(lang, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 }).format(bytes / 1048576);
  if (tab === 'downloads') return <div className="space-y-3">
    {!library.jobs.length && <p className="p-6 text-muted leading-relaxed">{t('quranNoDownloads')}</p>}
    {library.jobs.map(job => {
      const active = ['awaiting-download', 'downloading', 'installing'].includes(job.state);
      const stateKeys: Record<typeof job.state, TranslationKey> = { 'awaiting-download': 'quranAwaiting', downloading: 'quranDownloading', installing: 'quranInstalling', complete: 'quranComplete', failed: 'quranFailed', cancelled: 'quranCancelled' };
      return <article key={job.id} className="rounded-2xl border border-subtle bg-surface p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="min-w-0 break-words font-semibold leading-relaxed" dir="auto">{job.title}</h3>{active && <button type="button" onClick={() => onCancel(job.id)} className="rounded-lg border border-subtle px-3 py-2 text-sm inline-flex gap-2 items-center"><X className="size-4" />{t('quranCancel')}</button>}</div>
        <p className="text-sm text-muted" role="status">{t(stateKeys[job.state])}{job.error ? ` — ${t(errorKeys[job.error])}` : ''}</p>
        {!active && job.state !== 'complete' && onRetry && <button type="button" disabled={busy} onClick={() => onRetry(job.resourceId)} className="rounded-lg border border-subtle px-3 py-2 text-sm disabled:opacity-50">{t('quranRetry')}</button>}
        {job.state === 'downloading' && <><progress className="w-full h-2 accent-pale-sky-500" value={job.total > 0 ? job.received : undefined} max={job.total || 1} aria-label={t('quranDownloading')} /><p className="text-xs text-muted">{size(job.received)}{job.total > 0 ? ` / ${size(job.total)}` : ` · ${t('quranSizeUnknown')}`}</p></>}
      </article>;
    })}
  </div>;
  const resources = tab === 'installed' ? library.installed.map(pack => pack.resource) : library.resources;
  return <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
    {!resources.length && <p className="col-span-full rounded-2xl border border-dashed border-subtle p-8 text-muted leading-relaxed">{t(tab === 'installed' ? 'quranNoInstalled' : 'quranNoResources')}</p>}
    {resources.map((resource, position) => {
      const pack = tab === 'installed' ? library.installed[position] : library.installed.find(item => item.resource.id === resource.id);
      return <article key={pack?.id || resource.id} className="min-w-0 rounded-2xl border border-subtle bg-surface p-5 flex flex-col gap-4 shadow-xs">
        <div className="flex items-start gap-3"><BookOpen className="size-5 text-pale-sky-500 shrink-0 mt-1" /><div className="min-w-0"><p className="text-xs text-muted mb-1">{t(quranCategoryKeys[resource.category])}</p><h3 dir="auto" className="font-semibold text-main text-base leading-relaxed break-words">{resource.title}</h3></div></div>
        <p className="text-xs text-muted leading-relaxed">{resource.restricted ? t('quranRestricted') : t('quranRightsNotice')}</p>
        <p className="text-xs text-muted leading-relaxed">{t('quranProfileUnverified')}</p>
        {pack && <div className="rounded-xl bg-pale-sky-500/10 p-3 text-sm leading-relaxed"><p className="font-semibold text-pale-sky-600 dark:text-pale-sky-300">{t('quranStored')} · {size(pack.bytes)}</p><p className="text-muted mt-1">{t('quranStoredHint')}</p></div>}
        <div className="mt-auto flex flex-wrap gap-2">
          {tab === 'all' && <><button type="button" disabled={busy || resource.restricted} onClick={() => onDownload(resource)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-pale-sky-600 text-white text-sm disabled:opacity-50"><Download className="size-4" />{t('quranDownload')}</button><button type="button" disabled={busy || resource.restricted} onClick={() => onImport(resource)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-subtle text-sm disabled:opacity-50"><Upload className="size-4" />{t('quranImport')}</button></>}
          {tab === 'installed' && pack && <button type="button" disabled={busy} onClick={() => onRemove(pack.id)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-subtle text-sm disabled:opacity-50"><Trash2 className="size-4" />{t('quranRemove')}</button>}
        </div>
      </article>;
    })}
  </div>;
}

export function QuranView() {
  const { t, lang, dir } = useWorkspace();
  const [library, setLibrary] = useState<QuranLibrary>(empty);
  const [tab, setTab] = useState<Tab>('all');
  const [category, setCategory] = useState<QuranCategory>('quran-script');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const load = useCallback(async () => {
    const request = ++generation.current;
    const api = window.electronAPI?.quran;
    if (!api) { setError('quranDesktopRequired'); setLoading(false); return; }
    try {
      const result = await api.library({ category: tab === 'all' ? category : undefined, search: tab === 'all' ? search : undefined, offset, view: tab });
      if (request !== generation.current) return;
      if (result.ok) setLibrary(result.data); else setError(errorKeys[result.error]);
    } catch { if (request === generation.current) setError('quranStorageError'); }
    finally { if (request === generation.current) setLoading(false); }
  }, [category, search, offset, tab]);
  const latestLoad = useRef(load);
  useEffect(() => { latestLoad.current = load; }, [load]);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 120);
    const unsubscribe = window.electronAPI?.quran?.onChanged(() => { void load(); });
    return () => { clearTimeout(timer); invalidate(); unsubscribe?.(); };
  }, [load, invalidate]);
  const perform = async (action: () => Promise<{ ok: boolean; error?: QuranError }>) => {
    setBusy(true);
    setError(null);
    try { const result = await action(); if (!result.ok) setError(errorKeys[result.error || 'storage']); await latestLoad.current(); }
    catch { setError('quranStorageError'); }
    finally { setBusy(false); }
  };
  const api = () => window.electronAPI.quran;
  return <section dir={dir} className="flex-1 min-w-0 min-h-0 flex flex-col text-main" aria-label={t('navQuran')}>
    <header className="p-4 sm:p-6 border-b border-subtle bg-surface flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><h1 className="font-display text-2xl leading-relaxed font-bold">{t('navQuran')}</h1><p className="text-sm text-muted leading-relaxed mt-1">{t('quranSubtitle')}</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void perform(() => api().chooseDirectory())} className="inline-flex gap-2 items-center border border-subtle rounded-xl px-3 py-2 text-sm disabled:opacity-50"><FolderOpen className="size-4" />{t('quranDirectory')}</button><button type="button" disabled={busy} onClick={() => void perform(() => api().refresh(category))} className="inline-flex gap-2 items-center bg-pale-sky-600 text-white rounded-xl px-3 py-2 text-sm disabled:opacity-50"><RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} />{t('quranRefresh')}</button></div>
    </header>
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5">
      <div className="rounded-2xl bg-pale-sky-500/10 border border-pale-sky-500/20 p-4 flex gap-3"><ShieldCheck className="size-5 text-pale-sky-500 shrink-0 mt-1" /><div className="text-sm leading-relaxed min-w-0"><p>{t('quranSetup')}</p><p className="text-muted mt-1">{t('quranQiraatHint')}</p></div></div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('quranResources')}>
        {(['all', 'installed', 'downloads'] as const).map(value => <button key={value} type="button" role="tab" aria-selected={value === tab} onClick={() => { setTab(value); setOffset(0); }} className={`px-4 py-2 rounded-xl text-sm ${value === tab ? 'bg-pale-sky-600 text-white' : 'bg-surface border border-subtle'}`}>{t(value === 'all' ? 'quranAllResources' : value === 'installed' ? 'quranInstalled' : 'quranDownloads')}</button>)}
      </div>
      {tab === 'all' && <><div className="flex flex-wrap gap-3"><label className="text-sm flex flex-col gap-1 min-w-0 flex-1">{t('quranCategory')}<select value={category} onChange={event => { setCategory(event.target.value as QuranCategory); setOffset(0); }} className="w-full rounded-xl border border-subtle bg-surface px-3 py-2 min-w-0">{QURAN_CATEGORIES.map(value => <option key={value} value={value}>{t(quranCategoryKeys[value])}</option>)}</select></label><label className="text-sm flex flex-col gap-1 min-w-0 flex-1">{t('quranSearch')}<span className="flex items-center gap-2 rounded-xl border border-subtle bg-surface px-3 py-2"><Search className="size-4 shrink-0" /><input value={search} maxLength={200} onChange={event => { setSearch(event.target.value); setOffset(0); }} className="bg-transparent w-full min-w-0 outline-none" placeholder={t('quranSearchPlaceholder')} /></span></label></div><p className="text-xs text-muted leading-relaxed">{t('quranCatalogNotice')}</p></>}
      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 leading-relaxed">{t(error)}</p>}
      {loading ? <p role="status" className="text-muted">{t('quranLoading')}</p> : <QuranLibraryPanel library={library} t={t} lang={lang} tab={tab} busy={busy} onDownload={resource => { setTab('downloads'); void perform(() => api().download(resource.id)); }} onImport={resource => { setTab('downloads'); void perform(() => api().importFile(resource.id)); }} onRemove={id => { if (window.confirm(t('quranRemoveConfirm'))) void perform(() => api().remove(id)); }} onCancel={id => { void perform(() => api().cancel(id)); }} onRetry={id => { void perform(() => api().download(id)); }} />}
      {tab !== 'downloads' && <div className="flex flex-wrap gap-3"><button type="button" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 60))} className="border border-subtle rounded-xl px-3 py-2 text-sm disabled:opacity-40">{t('quranPrevious')}</button><button type="button" disabled={!library.hasMore} onClick={() => setOffset(value => value + 60)} className="border border-subtle rounded-xl px-3 py-2 text-sm disabled:opacity-40">{t('quranNext')}</button></div>}
      <p className="text-xs text-muted break-all leading-relaxed">{t('quranLocationHint')} <bdi>{library.directory}</bdi></p>
    </div>
  </section>;
}
