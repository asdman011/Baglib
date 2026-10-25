'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { QuranReaderSource, QuranSearchHit } from '../../../shared/types/quran';
import type { QuranNavigationTarget } from '../../utils/quran-navigation';

export function QuranSearchDialog({ onClose, onOpen, onSetup }: { onClose: () => void; onOpen: (target: QuranNavigationTarget) => void; onSetup: () => void }) {
  const { t, dir, lang } = useWorkspace();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [scripts, setScripts] = useState<QuranReaderSource[]>([]);
  const [script, setScript] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ key: string; hits: QuranSearchHit[] }>({ key: '', hits: [] });
  const key = JSON.stringify([script, query.trim()]);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let alive = true;
    const api = window.electronAPI?.quran;
    void (async () => {
      try {
        const result = await api?.readerCatalog();
        if (!alive) return;
        if (!result?.ok) { setError(true); return; }
        const sources = result.data.sources.filter(source => source.kind === 'script');
        setScripts(sources);
        setScript((sources.find(source => source.profile === 'hafs') || sources[0])?.id || '');
      } catch { if (alive) setError(true); }
      finally { if (alive) setReady(true); }
    })();
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!script || !query.trim()) return;
    let alive = true;
    const timer = setTimeout(() => {
      setBusy(true); setError(false);
      void window.electronAPI.quran.searchAyahs({ script, text: query.trim() }).then(result => {
        if (!alive) return;
        if (result.ok) setResults({ key, hits: result.data }); else setError(true);
      }).catch(() => { if (alive) setError(true); }).finally(() => { if (alive) setBusy(false); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, script, key]);
  const hits = results.key === key ? results.hits : [];
  return <dialog ref={dialog} dir={dir} aria-label={t('quranGlobalSearch')} onCancel={event => { event.preventDefault(); onClose(); }} className="m-auto w-[min(48rem,calc(100%_-_2rem))] max-h-[85dvh] rounded-2xl border border-subtle bg-surface text-main p-5 backdrop:bg-black/50 overflow-y-auto">
    <header className="flex items-center justify-between gap-3 mb-4"><h2 className="font-semibold">{t('quranGlobalSearch')}</h2><button type="button" onClick={onClose} aria-label={t('quranClosePanel')} className="p-2 rounded-lg border border-subtle"><X className="size-4" /></button></header>
    <label className="flex items-center gap-2 border border-subtle rounded-xl px-3 py-2"><Search className="size-4 shrink-0" /><input autoFocus type="search" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} aria-label={t('quranGlobalSearch')} placeholder={t('quranVerseSearchHint')} className="min-w-0 w-full bg-transparent outline-none" /></label>
    <p className="text-sm text-muted leading-relaxed mt-3">{t('quranGlobalSearchHint')}</p>
    {scripts.length > 1 && <label className="flex flex-col gap-1 mt-3 text-sm">{t('quranScriptChoice')}<select value={script} onChange={event => setScript(event.target.value)} className="border border-subtle rounded-xl bg-surface p-2">{scripts.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>}
    {error && <p role="alert" className="mt-4 text-sm">{t('quranReaderError')}</p>}
    {!error && (!ready || (script && query.trim() && (busy || results.key !== key))) ? <p role="status" className="mt-4 text-sm">{t('quranLoading')}</p> : null}
    {ready && !script && !error && <div className="mt-4 space-y-3"><p className="text-sm">{t('quranSearchNeedsScript')}</p><button type="button" onClick={onSetup} className="rounded-xl border border-subtle px-4 py-2">{t('quranChooseResources')}</button></div>}
    {query.trim() && results.key === key && <p role="status" className="text-sm text-muted mt-4">{t('quranSearchCount', { count: hits.length })}</p>}
    <div className="space-y-2 mt-3">{hits.map(hit => <button type="button" key={`${hit.surah}:${hit.ayah}`} onClick={() => onOpen({ script, surah: hit.surah, ayah: hit.ayah })} className="block w-full rounded-xl border border-subtle p-3 text-start hover:bg-emerald-500/10"><bdi className="text-sm text-muted">{new Intl.NumberFormat(lang).format(hit.surah)}:{new Intl.NumberFormat(lang).format(hit.ayah)}</bdi><span dir="rtl" lang="ar" className="block font-reading text-xl leading-[2.3] mt-1">{hit.text}</span></button>)}</div>
  </dialog>;
}
