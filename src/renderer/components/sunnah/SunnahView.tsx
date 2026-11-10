'use client';

import { IslamicReaderHeader, IslamicReaderPanel } from '../islamic/IslamicReaderChrome';
import type { ReaderTab } from '../islamic/reader-chrome';
import { saveContinueReading } from '../islamic/continue-reading';
import { HadithActions } from './HadithActions';
import { SunnahResearchPanel } from './SunnahResearchPanel';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpenText, Check, Languages, LoaderCircle, Search, Upload } from 'lucide-react';
import type { SunnahAPI, SunnahCatalog, SunnahChapter, SunnahCollectionId } from '../../../shared/types/sunnah';
import type { TranslationKey } from '../../translations';
import { useWorkspace } from '../context/WorkspaceContext';
import { normalizeSunnahSearch } from '../../libs/sunnah/text';
import { SunnahChapterView } from './SunnahChapterView';
import './sunnah.css';
import { SunnahSearch, type SunnahSearchScope, type SunnahSearchTarget } from './SunnahSearch';
import { SunnahInsightsPanel } from './SunnahInsightsPanel';
import { consumeSunnahReference } from '../../utils/study-navigation';

import { collectionKeys } from '../../utils/sunnah-collections';
import { useCompanionContext } from '../../utils/companion-context';
import { validStudyTarget } from '../../../shared/study-notes';
export { collectionKeys };

interface Position {
  collection: SunnahCollectionId;
  chapter: number;
  hadith: string;
  mode: 'single' | 'chapter';
  english: boolean;
  size: number;
}

const defaultPosition: Position = { collection: 'Bukhari', chapter: 1, hadith: '', mode: 'single', english: true, size: 24 };
const positionKey = 'baglib:sunnah:position:v1';

function restorePosition(): Position {
  try {
    const saved = JSON.parse(localStorage.getItem(positionKey) || 'null') as Partial<Position> | null;
    if (!saved) return defaultPosition;
    return {
      collection: saved.collection && Object.hasOwn(collectionKeys, saved.collection) ? saved.collection : defaultPosition.collection,
      chapter: Number.isSafeInteger(saved.chapter) && saved.chapter! >= 0 ? saved.chapter! : 1,
      hadith: typeof saved.hadith === 'string' ? saved.hadith : '',
      mode: saved.mode === 'chapter' ? 'chapter' : 'single',
      english: saved.english !== false,
      size: typeof saved.size === 'number' && saved.size >= 20 && saved.size <= 34 ? saved.size : 24,
    };
  } catch { return defaultPosition; }
}

export function SunnahView() {
  const { t, lang, dir } = useWorkspace();
  const [catalog, setCatalog] = useState<SunnahCatalog | null>(null);
  const [chapter, setChapter] = useState<SunnahChapter | null>(null);
  const [position, setPosition] = useState<Position>(defaultPosition);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SunnahSearchScope>('chapter');
  const openSearchHit = (target: SunnahSearchTarget) => {
    setPosition(previous => ({ ...previous, ...target, mode: 'single' }));
    setQuery('');
    viewport.current?.scrollTo({ top: 0 });
  };
  const [retry, setRetry] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [readerTab, setReaderTab] = useState<ReaderTab>('commentary');
  const [insights, setInsights] = useState(false);
  const [visibleCount, setVisibleCount] = useState(24);
  const viewport = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);
  const requestedReference = useRef<SunnahSearchTarget | null>(null);

  useEffect(() => {
    const open = (event: Event) => {
      const target = consumeSunnahReference() || (event as CustomEvent<SunnahSearchTarget>).detail;
      requestedReference.current = target;
      setPosition(previous => ({ ...previous, ...target, mode: 'single' }));
      setQuery('');
    };
    window.addEventListener('baglib:sunnah-open', open);
    return () => window.removeEventListener('baglib:sunnah-open', open);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const api: SunnahAPI | undefined = window.electronAPI?.sunnah;
    const pending = consumeSunnahReference();
    if (pending) requestedReference.current = pending;
    const restored = restorePosition();
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const result = await api?.catalog();
      if (cancelled) return;
      if (!result?.ok) {
        setError(api ? 'sunnahReadError' : 'sunnahDesktopRequired');
      } else {
        setCatalog(result.data);
        const saved = requestedReference.current ? { ...restored, ...requestedReference.current, mode: 'single' as const } : restored;
        const collection = result.data?.collections.find(item => item.id === saved.collection) ?? result.data?.collections[0];
        const firstChapter = collection?.chapters.find(item => item.number === saved.chapter) ?? collection?.chapters[0];
        setPosition(collection && firstChapter ? { ...saved, collection: collection.id, chapter: firstChapter.number } : saved);
        requestedReference.current = null;
      }
      setReady(true);
      setLoading(false);
    };
    void load().catch(() => {
      if (!cancelled) { setError('sunnahReadError'); setLoading(false); }
    });
    return () => { mounted.current = false; cancelled = true; };
  }, [retry]);

  useEffect(() => {
    if (!ready || !catalog) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setChapter(null);
      const result = await (window.electronAPI.sunnah as SunnahAPI).chapter(position.collection, position.chapter);
      if (cancelled) return;
      if (result.ok) {
        setChapter(result.data);
        setVisibleCount(24);
        setPosition(previous => {
          const target = previous.hadith === 'last' ? result.data.hadiths.at(-1) : result.data.hadiths.find(item => item.id === previous.hadith) ?? result.data.hadiths[0];
          return target && previous.hadith !== target.id ? { ...previous, hadith: target.id } : previous;
        });
      }
      else setError('sunnahReadError');
      setLoading(false);
      viewport.current?.scrollTo({ top: 0 });
    };
    void load().catch(() => { if (!cancelled) { setError('sunnahReadError'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [ready, catalog, position.collection, position.chapter, retry]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(positionKey, JSON.stringify(position)); } catch {}
  }, [position, ready]);

  const collection = catalog?.collections.find(item => item.id === position.collection);
  const chapterIndex = collection?.chapters.findIndex(item => item.number === position.chapter) ?? -1;
  const hadithIndex = Math.max(0, chapter?.hadiths.findIndex(item => item.id === position.hadith) ?? 0);
  const hadith = chapter?.hadiths[hadithIndex];
  useEffect(() => {
    if (!hadith || loading) return;
    void saveContinueReading('sunnah', { target: 'sunnah:' + position.collection + ':' + position.chapter + ':' + hadith.id, label: t(collectionKeys[position.collection]) + ' · ' + hadith.number }).catch(() => setError('sunnahSaveFailed'));
  }, [hadith, loading, position.collection, position.chapter, t]);
  // The companion note pane links to the hadith on screen.
  useCompanionContext('sunnah', () => {
    if (!hadith) return null;
    const target = `sunnah:${position.collection}:${position.chapter}:${hadith.id}`;
    return validStudyTarget(target) ? { kind: 'hadith', target, label: `${t(collectionKeys[position.collection])} ${hadith.number}` } : null;
  }, [hadith?.id, position.collection, position.chapter, t]);
  const results = useMemo(() => {
    if (!chapter) return [];
    const terms = normalizeSunnahSearch(query).split(' ').filter(Boolean);
    if (!terms.length) return chapter.hadiths;
    return chapter.hadiths.filter(item => {
      const haystack = normalizeSunnahSearch([item.number, item.text.ar.full, item.text.ar.isnad, item.text.ar.matn,
        item.text.en.full, item.text.en.isnad, item.text.en.matn, item.section.title.ar, item.section.title.en].join(' '));
      return terms.every(term => haystack.includes(term));
    });
  }, [chapter, query]);
  const single = position.mode === 'single' && !query.trim();
  const visibleHadiths = single ? (hadith ? [hadith] : []) : results.slice(0, visibleCount);
  const hasMore = !single && visibleCount < results.length;

  useEffect(() => {
    const button = more.current;
    if (!button || !hasMore || loading || importing) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setVisibleCount(count => count + 24);
    }, { root: viewport.current, rootMargin: '600px' });
    observer.observe(button);
    return () => observer.disconnect();
  }, [hasMore, visibleCount, loading, importing]);

  const selectChapter = (number: number) => {
    setPosition(previous => ({ ...previous, chapter: number, hadith: '' }));
    setQuery('');
  };
  const focusHadith = (id: string) => {
    setPosition(previous => ({ ...previous, hadith: id, mode: 'single' }));
    setQuery('');
    viewport.current?.scrollTo({ top: 0 });
  };
  const importCorpus = async () => {
    const api: SunnahAPI | undefined = window.electronAPI?.sunnah;
    if (!api) { setError('sunnahDesktopRequired'); return; }
    setImporting(true);
    setError(null);
    try {
      const result = await api.importCorpus(lang);
      if (!mounted.current) return;
      if (!result.ok) setError('sunnahImportError');
      else if (result.data) {
        const first = result.data.collections[0];
        setCatalog(result.data);
        setPosition(previous => ({ ...previous, collection: first.id, chapter: first.chapters[0].number, hadith: '' }));
        setReady(true);
        setQuery('');
      }
    } catch { if (mounted.current) setError('sunnahImportError'); }
    finally { if (mounted.current) setImporting(false); }
  };
  const previousDisabled = loading || importing || !chapter || (position.mode === 'single' ? hadithIndex <= 0 && chapterIndex <= 0 : chapterIndex <= 0);
  const nextDisabled = loading || importing || (position.mode === 'single'
    ? !chapter || !collection || (hadithIndex >= chapter.hadiths.length - 1 && chapterIndex >= collection.chapters.length - 1)
    : !collection || chapterIndex >= collection.chapters.length - 1);
  const move = (offset: number) => {
    if (position.mode === 'single') {
      const target = chapter?.hadiths[hadithIndex + offset];
      if (target) focusHadith(target.id);
      else {
        const adjacent = collection?.chapters[chapterIndex + offset];
        if (adjacent) {
          setPosition(previous => ({ ...previous, chapter: adjacent.number, hadith: offset < 0 ? 'last' : '' }));
          setQuery('');
        }
      }
    } else {
      const target = collection?.chapters[chapterIndex + offset];
      if (target) selectChapter(target.number);
    }
  };

  return <section className="sunnah-workspace flex-1 min-h-0 flex flex-col" dir={dir} aria-label={t('navSunnah')}>
    <IslamicReaderHeader title={t('navSunnah')} t={t} panelOpen={panelOpen} onPanelToggle={() => setPanelOpen(value => !value)} picker={catalog && <div className="grid min-w-0 w-full grid-cols-1 gap-2 sm:grid-cols-3 [&_label]:min-w-0 [&_label>span]:sr-only [&_select]:w-full">      <label><span>{t('sunnahCollection')}</span><select value={position.collection} disabled={importing} onChange={event => {
        const next = catalog.collections.find(item => item.id === event.target.value)!;
        setPosition(previous => ({ ...previous, collection: next.id, chapter: next.chapters[0].number, hadith: '' }));
        setQuery('');
      }}>{catalog.collections.map(item => <option key={item.id} value={item.id}>{t(collectionKeys[item.id])}</option>)}</select></label>
      <label className="sunnah-chapter-select"><span>{t('sunnahChapter')}</span><select value={position.chapter} disabled={importing} onChange={event => selectChapter(Number(event.target.value))}>
        {collection?.chapters.map(item => <option key={item.number} value={item.number}>{item.number} · {item.title[lang] || item.title.ar || item.title.en}</option>)}
      </select></label>
      <label><span>{t('sunnahHadith')}</span><select value={hadith?.id || ''} disabled={loading || importing || !chapter} onChange={event => focusHadith(event.target.value)}>
        {chapter?.hadiths.map((item, index) => <option key={item.id} value={item.id}>{t('sunnahHadithPosition', { number: item.number || '—', index: index + 1, total: chapter.hadiths.length })}</option>)}
      </select></label></div>} settings={<div className="space-y-4">        <div className="sunnah-mode" role="group" aria-label={t('sunnahViewMode')}>
          {(['single', 'chapter'] as const).map(mode => <button type="button" key={mode} aria-pressed={position.mode === mode}
            onClick={() => { setPosition(previous => ({ ...previous, mode })); setQuery(''); }}>
            {t(mode === 'single' ? 'sunnahSingle' : 'sunnahContinuous')}
          </button>)}
        </div>
        <button type="button" className="sunnah-button" aria-pressed={position.english} onClick={() => setPosition(previous => ({ ...previous, english: !previous.english }))}>
          <Languages size={17} /><span>{t('sunnahEnglish')}</span>{position.english && <Check size={14} />}
        </button>
        {catalog?.research && <button type="button" className="sunnah-button" aria-pressed={insights} onClick={() => setInsights(value => !value)}><span>{t('sunnahInsights')}</span></button>}
        <label className="sunnah-size"><span>{t('sunnahFontSize')}</span><input type="range" min={20} max={34} step={2} value={position.size}
          onChange={event => setPosition(previous => ({ ...previous, size: Number(event.target.value) }))} /></label>
<button type="button" disabled={loading || importing} onClick={() => void importCorpus()}>{t('sunnahConnectResearch')}</button><p className="text-xs text-muted">{catalog && t(catalog.research ? 'sunnahResearchReady' : 'sunnahResearchFallback', {count:catalog.hadithCount,collections:catalog.collections.length})}</p><p className="text-xs text-muted">{t(catalog?.research ? 'sunnahResearchSubtitle' : 'sunnahSubtitle')}</p></div>} />
    <div className="relative flex flex-1 min-h-0">
    {panelOpen && <IslamicReaderPanel active={readerTab} onTab={setReaderTab} onClose={() => setPanelOpen(false)} t={t}>
      {hadith && chapter && <>
        {readerTab === 'translation' && <p dir="ltr" lang="en" className="leading-loose whitespace-pre-wrap">{hadith.text.en.full || hadith.text.en.matn || t('sunnahMissingEnglish')}</p>}
        {readerTab === 'notes' && <HadithActions key={hadith.id} chapter={chapter} hadith={hadith} showEnglish={position.english} t={t} />}
        {readerTab === 'commentary' && <div dir="rtl" lang="ar" className="font-reading text-xl leading-[2.4] whitespace-pre-wrap">{hadith.comment || t('quranWordUnavailable')}</div>}
        {readerTab === 'related' && (hadith.researchId !== undefined ? <SunnahResearchPanel key={hadith.researchId} id={hadith.researchId} matn={hadith.text.ar.matn || hadith.text.ar.full} initialOpen t={t} /> : <p>{t('quranWordUnavailable')}</p>)}
      </>}
    </IslamicReaderPanel>}
    <div className="sunnah-scroll flex-1 min-w-0 min-h-0 overflow-auto" ref={viewport} style={{ '--sunnah-font-size': `${position.size}px` } as React.CSSProperties}>
      {catalog?.research && insights && <SunnahInsightsPanel catalog={catalog} lang={lang} t={t} onChapter={(id, number) => {
        setPosition(previous => ({ ...previous, collection: id, chapter: number, hadith: '' }));
        setQuery('');
        setInsights(false);
      }} />}
      {catalog && <div className="sunnah-navigation">
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" className="sunnah-icon-button" disabled={previousDisabled} onClick={() => move(-1)} aria-label={t(position.mode === 'single' ? 'sunnahPreviousHadith' : 'sunnahPreviousChapter')}><ArrowLeft className="rtl:rotate-180" size={18} /></button>
          <span className="text-xs text-muted">{t('sunnahRecordCount', { count: chapter?.hadithCount ?? 0 })}</span>
          <button type="button" className="sunnah-icon-button" disabled={nextDisabled} onClick={() => move(1)} aria-label={t(position.mode === 'single' ? 'sunnahNextHadith' : 'sunnahNextChapter')}><ArrowRight className="rtl:rotate-180" size={18} /></button>
        </div>
        <div className="flex flex-wrap gap-2 min-w-0">
          <label className="text-sm"><span className="sr-only">{t('sunnahScope')}</span><select className="sunnah-button max-w-full" value={scope} onChange={event => setScope(event.target.value as SunnahSearchScope)}>
            <option value="all">{t('sunnahScopeAll')}</option><option value="collection">{t('sunnahScopeCollection')}</option><option value="chapter">{t('sunnahScopeChapter')}</option>
          </select></label>
          <label className="sunnah-search"><Search size={16} /><input type="search" maxLength={500} value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(24); }} placeholder={t(catalog.research ? 'sunnahResearchSearch' : 'sunnahBasicSearch')} aria-label={t(catalog.research ? 'sunnahResearchSearch' : 'sunnahBasicSearch')} disabled={loading || importing} /></label>
        </div>
      </div>}
      {error && <div role="alert" className="sunnah-message text-amber-700 dark:text-amber-300"><p>{t(error)}</p><button type="button" className="sunnah-button" onClick={() => setRetry(value => value + 1)}>{t('sunnahRetry')}</button></div>}
      {(loading || importing) && <div role="status" className="sunnah-message"><LoaderCircle size={24} className="animate-spin" /><p>{t(importing || !catalog ? 'sunnahPreparing' : 'sunnahLoading')}</p></div>}
      {!loading && !importing && !catalog && <div className="sunnah-welcome"><BookOpenText size={42} /><h2>{t('sunnahWelcome')}</h2><p>{t('sunnahImportHint')}</p><button type="button" className="sunnah-button" onClick={() => void importCorpus()}><Upload size={17} />{t('sunnahImport')}</button></div>}
      {query.trim() && (scope !== 'chapter' || catalog?.research) && <SunnahSearch query={query} scope={scope} collection={position.collection} chapter={position.chapter} t={t} onOpen={openSearchHit} />}
      {!loading && !importing && chapter && !(query.trim() && (scope !== 'chapter' || catalog?.research)) && <>
        {query.trim() && <p role="status" className="px-5 pb-4 text-sm text-muted">{t('sunnahSearchCount', { count: results.length })}</p>}
        <SunnahChapterView calm onStudy={tab => { setReaderTab(tab); setPanelOpen(true); }} chapter={chapter} hadiths={visibleHadiths} showEnglish={position.english} single={single} t={t} onFocus={focusHadith} />
        {hasMore && <div className="flex justify-center p-4"><button type="button" className="sunnah-button" ref={more} onClick={() => setVisibleCount(count => count + 24)}>{t('sunnahMore')}</button></div>}
        {visibleHadiths.length === 0 && <p className="sunnah-message">{t('sunnahNoResults')}</p>}
      </>}
      <footer className="sunnah-source">
        <details><summary>{t('sunnahAbout')}</summary><div className="space-y-3 mt-3 leading-relaxed">
          <p>{t(catalog?.research ? 'sunnahMasterAttribution' : 'sunnahAttribution')}</p><p>{t(catalog?.research ? 'sunnahResearchNotice' : 'sunnahAnnotationNotice')}</p><p>{t('sunnahMissingNotice')}</p>
          {catalog && <p>{t('sunnahCorpusCount', { count: catalog.hadithCount })}</p>}
          <p>{t('sunnahCitation')}</p>
          <button type="button" className="sunnah-button" disabled={loading || importing} onClick={() => void importCorpus()}><Upload size={16} />{t('sunnahImport')}</button>
        </div></details>
      </footer>
    </div></div>
  </section>;
}
