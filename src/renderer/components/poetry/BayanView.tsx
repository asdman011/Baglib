'use client';
import React, { useEffect, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { PoetrySummary, PoetryDetail, PoetryFacets, PoetryProvisionStatus } from '../../../shared/types/poetry';
import { togglePoetryPanel, type PoetryPanel } from '../../../shared/poetry';
import { PoetryReader } from './PoetryReader';
import { PoetBrowser } from './PoetBrowser';
import { PoetryExcerpt } from './PoetryExcerpt';
import { consumePoetryReference, POETRY_OPEN_EVENT } from '../../utils/poetry-navigation';

export function BayanView() {
  const { t, dir, lang } = useWorkspace();
  const [query, setQuery] = useState('');
  const [matchedQuery, setMatchedQuery] = useState('');
  const [after, setAfter] = useState(0);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{ key: string; cursors: number[] }>({ key: '', cursors: [] });
  const resultsElement = React.useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<PoetrySummary[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [provision, setProvision] = useState<PoetryProvisionStatus | null>(null);
  const [revision, setRevision] = useState(0);
  const installing = provision?.phase === 'downloading' || provision?.phase === 'importing';
  useEffect(() => {
    let alive = true;
    void window.electronAPI?.poetry?.status().then(result => { if (alive && result.ok) setProvision(result.data); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const install = async () => {
    try {
      const result = await window.electronAPI.poetry.provision();
      if (result.ok) {
        setProvision(result.data);
        if (result.data.phase === 'ready') { setFailed(false); setRevision(value => value + 1); }
        else if (result.data.phase === 'error') setFailed(true);
      } else setFailed(true);
    } catch { setFailed(true); }
  };
  useEffect(() => {
    if (!installing) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await window.electronAPI.poetry.status();
        if (!alive) return;
        if (!result.ok) { setFailed(true); return; }
        setProvision(result.data);
        if (result.data.phase === 'ready') { setFailed(false); setRevision(value => value + 1); }
        else if (result.data.phase === 'error') setFailed(true);
        else if (result.data.phase === 'downloading' || result.data.phase === 'importing') timer = setTimeout(() => void poll(), 500);
      } catch { if (alive) setFailed(true); }
    };
    timer = setTimeout(() => void poll(), 500);
    return () => { alive = false; clearTimeout(timer); };
  }, [installing]);
  const [poem, setPoem] = useState<PoetryDetail | null>(null);
  const [initialVerse, setInitialVerse] = useState<number | undefined>();
  const [initialTo, setInitialTo] = useState<number | undefined>();
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');
  const [facets, setFacets] = useState<PoetryFacets | null>(null);
  const [era, setEra] = useState(''), [meter, setMeter] = useState(''), [theme, setTheme] = useState(''), [variant, setVariant] = useState(''), [location, setLocation] = useState('');
  const [panel, setPanel] = useState<PoetryPanel>(null);
  const [variants, setVariants] = useState<string[] | null>(null);
  useEffect(() => {
    if (panel !== 'filters' || variants) return;
    let alive = true;
    void window.electronAPI?.poetry?.variants().then(result => { if (alive && result.ok) setVariants(result.data); }).catch(() => {});
    return () => { alive = false; };
  }, [panel, variants, revision]);
  const [poetId, setPoetId] = useState<number | undefined>();
  const cursorKey = JSON.stringify([query, language, era, meter, theme, variant, location, poetId]);
  useEffect(() => {
    let alive = true;
    void window.electronAPI?.poetry?.facets().then(result => { if (alive && result.ok) setFacets(result.data); }).catch(() => {});
    return () => { alive = false; };
  }, [revision]);
  const selection = React.useRef(0);
  useEffect(() => () => { selection.current++; }, []);
  const openPoem = React.useCallback(async (id: number, from?: number, to?: number) => {
    const request = ++selection.current;
    try {
      const result = await window.electronAPI.poetry.detail(id);
      if (request !== selection.current) return;
      if (result.ok && result.data) { setInitialVerse(from); setInitialTo(to); setPoem(result.data); } else setFailed(true);
    } catch { if (request === selection.current) setFailed(true); }
  }, []);
  useEffect(() => {
    const open = () => { const target = consumePoetryReference(); if (target) void openPoem(target.poemId, target.from, target.to); };
    open(); window.addEventListener(POETRY_OPEN_EVENT, open);
    return () => window.removeEventListener(POETRY_OPEN_EVENT, open);
  }, [openPoem]);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      setLoading(true);
      const api = window.electronAPI?.poetry;
      if (!api) { setFailed(true); setLoading(false); return; }
      void api.search({ query, after, limit: 40, language, poetId, era: era || undefined, meter: meter || undefined, theme: theme || undefined, variant: variant || undefined, location: location || undefined }).then(result => {
        if (!alive) return;
        setLoading(false);
        if (!result.ok) { setFailed(true); return; }
        setFailed(false); setNext(result.data.next);
        setMatchedQuery(query);
        setItems(result.data.items);
        if (resultsElement.current) resultsElement.current.scrollTop = 0;
      }).catch(() => { if (alive) { setFailed(true); setLoading(false); } });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, after, language, era, meter, theme, variant, location, poetId, revision]);
  if (poem) return <PoetryReader key={`${poem.id}:${initialVerse}:${initialTo}`} initialVerse={initialVerse} initialTo={initialTo} poem={poem} onBack={() => setPoem(null)} onPoet={id => { setPoem(null); setPoetId(id); setQuery(''); setEra(''); setMeter(''); setTheme(''); setVariant(''); setLocation(''); setAfter(0); }} />;
  return <section dir={dir} className="flex h-full min-h-0 flex-col bg-canvas p-3 sm:p-5">
    <h1 className="text-xl font-semibold leading-loose">{t('navBayan')}</h1>
    {failed && <button type="button" disabled={installing} onClick={() => void install()} className="rounded border border-subtle p-3">{t('bayanInstall')}</button>}
    {provision?.phase === 'error' && <p role="alert">{t(provision.error === 'python' ? 'bayanPythonRequired' : provision.error === 'integrity' ? 'bayanIntegrityError' : 'bayanUnavailable')}</p>}
    {installing && <div role="status" className="rounded border border-subtle p-3"><p>{t(provision.phase === 'importing' ? 'bayanImporting' : 'bayanDownloading')}</p><output>{provision.phase === 'importing' ? provision.imported.toLocaleString(lang) : t('bayanDownloadProgress', { downloaded: (provision.downloaded / 1048576).toLocaleString(lang, { maximumFractionDigits: 1 }), total: provision.total === null ? '—' : (provision.total / 1048576).toLocaleString(lang, { maximumFractionDigits: 1 }), percent: provision.total ? Math.min(100, provision.downloaded / provision.total * 100).toLocaleString(lang, { maximumFractionDigits: 0 }) : '—' })}</output>{provision.total !== null && provision.phase === 'downloading' && <progress aria-label={t('bayanDownloading')} value={provision.downloaded} max={provision.total} className="block w-full" />}</div>}
    <nav className="border-b border-subtle py-3" aria-label={t('navBayan')}><span aria-current="page">{t('bayanPoetry')}</span></nav>
    <div className="flex shrink-0 flex-wrap items-center gap-2 py-3 [&>button]:rounded-xl [&>button]:border [&>button]:border-subtle [&>button]:px-3 [&>button]:py-2 [&>button]:text-sm [&>button]:leading-relaxed [&>button:hover]:bg-surface [&>button:focus-visible]:outline-2 [&>button:focus-visible]:outline-pale-sky-500 [&>button[aria-pressed=true]]:bg-pale-sky-500/15 [&>button[aria-pressed=true]]:text-pale-sky-500 [&>button[aria-expanded=true]]:bg-pale-sky-500/15">
      {poetId !== undefined && <button type="button" onClick={() => { setPoetId(undefined); setAfter(0); }}>{t('bayanAll')}</button>}
      {(['ar', 'en'] as const).map(value => { const count = facets?.languages.find(item => item.language === value)?.count ?? 0; return <button type="button" key={value} aria-pressed={language === value} onClick={() => { setLanguage(value); setPoetId(undefined); setAfter(0); setEra(''); setMeter(''); setTheme(''); setVariant(''); setLocation(''); }} className="rounded-lg border border-subtle px-3 py-2">{t(value === 'ar' ? 'bayanArabic' : 'bayanEnglish')} · {count || t('bayanComingSoon')}</button>; })}
      <button type="button" aria-expanded={panel === 'filters'} onClick={() => setPanel(current => togglePoetryPanel(current, 'filters'))}>{t('bayanFilters')}</button>
      <button type="button" aria-expanded={panel === 'poet'} onClick={() => setPanel(current => togglePoetryPanel(current, 'poet'))}>{t('bayanPoets')}</button>
    </div>
    {panel === 'filters' && <aside aria-label={t('bayanFilters')} className="grid gap-3 rounded-xl border border-subtle bg-surface p-3 sm:grid-cols-3 lg:grid-cols-5">
      {([{ key: 'bayanEra', value: era, update: setEra, options: facets?.eras }, { key: 'bayanMeter', value: meter, update: setMeter, options: facets?.meters }, { key: 'bayanTheme', value: theme, update: setTheme, options: facets?.themes }, { key: 'bayanLanguageType', value: variant, update: setVariant, options: variants ?? undefined }, { key: 'bayanLocation', value: location, update: setLocation, options: facets?.locations }] as const).map(filter => <label key={filter.key}>{t(filter.key)}<select value={filter.value} onChange={event => { filter.update(event.target.value); setAfter(0); }} className="block w-full rounded border border-subtle bg-canvas p-2"><option value="">{t('bayanAll')}</option>{filter.options?.map(option => <option key={option} value={option}>{option}</option>)}</select></label>)}
    </aside>}
    {panel === 'poet' && <PoetBrowser key={`${language}:${era}:${location}`} language={language} era={era} location={location} onPoet={id => { setPoetId(id); setAfter(0); setPanel(null); }} />}
    <input type="search" dir="auto" aria-label={t('bayanSearch')} placeholder={t('bayanSearch')} value={query} onChange={event => { setQuery(event.target.value); setAfter(0); }} className="my-4 rounded-lg border border-subtle bg-surface p-3 text-start" />
    {loading && <p role="status" className="pb-2 text-sm text-muted">{t('bayanLoading')}</p>}
    <div ref={resultsElement} aria-busy={loading} className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {failed ? <p role="alert">{t('bayanUnavailable')}</p> : !items.length ? !loading && <p role="status">{t('bayanEmpty')}</p> : items.map(item => <article key={item.id} dir={item.language === 'ar' ? 'rtl' : 'ltr'} className="rounded-2xl border border-subtle bg-surface p-4 sm:p-5 text-start leading-loose transition-colors hover:border-pale-sky-500/50 focus-within:border-pale-sky-500">
        <h2 className="font-semibold text-lg leading-loose"><button type="button" className="w-full text-start rounded focus-visible:outline-2 focus-visible:outline-pale-sky-500" onClick={() => void openPoem(item.id)}>{item.title || item.poetName}</button></h2><p className="text-sm text-pale-sky-500">{item.poetName}</p><p className="mt-2 border-t border-subtle pt-2 text-xs text-muted leading-loose">{[item.meter, item.theme, t('bayanVerseCountShort', { count: item.verseCount.toLocaleString(lang) })].filter(Boolean).join(' · ')}</p>
        {item.match && <PoetryExcerpt lines={item.match.lines} query={matchedQuery} onOpen={() => void openPoem(item.id, item.match!.from, item.match!.from + item.match!.lines.length - 1)} />}
      </article>)}
      </div>
      {!failed && <div className="flex justify-between gap-3"><button type="button" disabled={loading || !after || history.key !== cursorKey || !history.cursors.length} onClick={() => { setLoading(true); setAfter(history.cursors.at(-1)!); setHistory(value => ({ ...value, cursors: value.cursors.slice(0, -1) })); }}>{t('bayanPrevious')}</button><button type="button" disabled={loading || next === null} onClick={() => { if (next === null) return; setLoading(true); setHistory(value => ({ key: cursorKey, cursors: [...(value.key === cursorKey ? value.cursors : []), after] })); setAfter(next); }}>{t('bayanNext')}</button></div>}
    </div>
  </section>;
}
