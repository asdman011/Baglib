'use client';

import { QuranActionMenu } from '../actions/QuranActionMenu';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Languages, Layers, Lightbulb, ListTree, Play, Type, X } from 'lucide-react';
import type { QuranAyahTheme, QuranSimilarAyah, QuranTopic } from '../../../shared/types/quran';
import type { SunnahSearchHit } from '../../../shared/types/sunnah';
import type { TranslationKey } from '../../translations';
import { QuranMushafView } from './QuranMushafView';
import { QuranTranslationText } from './QuranTranslationText';
import { QuranRichText, quranHtmlText } from './QuranRichText';
import { QuranTopicDrawer } from './QuranTopicDrawer';
import { QuranSimilarAyahsDrawer } from './QuranSimilarAyahsDrawer';
import { collectionKeys } from '../../utils/sunnah-collections';
import { openSunnahReference } from '../../utils/study-navigation';
import { groupThemeLabels } from './quran-theme-labels';
import { quranStudyReferences } from '../../../shared/quran-study-scope';
import { normalizeArabicText } from '../../../shared/utils/text-normalizer';

type Reference = { surah: number; ayah: number; wordText?: string; wholePage?: boolean };
type Tool = 'translation' | 'meanings' | 'tafsir' | 'topics' | 'themes' | 'transliteration' | 'similar' | 'morphology' | 'mutashabihat' | 'explore';
type WindowState = { id: number; tool: Tool; reference: Reference; side: 'left' | 'right' };
type Props = React.ComponentProps<typeof QuranMushafView> & {
  selection: { script: string; translation: string; tafsir: string; transliteration: string; meanings: string; ayahTransliteration: string };
  metadata: { topics?: string; themes?: string; derived: boolean };
  onStartAudio: (reference: Reference) => void;
  canPlay: boolean;
  studyTarget?: Reference | null;
  onStudyTargetConsumed?: () => void;
  onNavigateAyah?: (reference: Reference) => void;
};
const labels: Record<Tool, TranslationKey> = {
  translation: 'quranCatTranslation', meanings: 'quranCatMeanings', tafsir: 'quranCatTafsir', topics: 'quranCatTopics', themes: 'quranThemes',
  transliteration: 'quranCatTransliteration', similar: 'quranCatSimilar', morphology: 'quranCatMorphology',
  mutashabihat: 'quranCatMutashabihat', explore: 'quranReadingOptions',
};
function RootHadiths({ root, t }: { root: string; t: Props['t'] }) {
  const [hits, setHits] = useState<SunnahSearchHit[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const load = async () => {
    setState('loading');
    try {
      const result = await window.electronAPI?.sunnah?.search?.({ root: root.replace(/\s+/gu, '') });
      if (!result?.ok) throw new Error('Search unavailable');
      setHits(result.data); setState('idle');
    } catch { setState('failed'); }
  };
  return <div className="mt-1">
    <button type="button" aria-expanded={hits !== null} disabled={state === 'loading'} onClick={() => { if (hits) setHits(null); else void load(); }} className="text-xs underline">{t('quranRootHadiths')}</button>
    {state === 'loading' && <p role="status" className="text-xs">{t('quranLoading')}</p>}
    {state === 'failed' && <p role="alert" className="text-xs">{t('sunnahResearchError')}</p>}
    {hits && (hits.length ? <><p className="text-xs text-muted">{t('sunnahRelatedLimit')}</p><ul>{hits.slice(0, 30).map(hit => <li key={hit.hadith.id}><button type="button" className="block w-full text-start py-1 border-b border-subtle" onClick={() => openSunnahReference({ collection: hit.chapter.collection, chapter: hit.chapter.number, hadith: hit.hadith.id })}><span className="block text-xs text-muted">{t(collectionKeys[hit.chapter.collection])} · {t('sunnahHadithNumber', { number: hit.hadith.number })}</span><span dir="rtl" lang="ar" className="block font-reading leading-loose">{(hit.hadith.text.ar.matn || hit.hadith.text.ar.full).slice(0, 140)}</span></button></li>)}</ul></> : <p className="text-xs">{t('sunnahNoResults')}</p>)}
  </div>;
}

function StudyContent({ tool, reference, page, selection, metadata, t, lang, onNavigateAyah, onOpenTopics, onOpenSimilar }: Pick<Props, 'page' | 'selection' | 'metadata' | 't' | 'lang' | 'onNavigateAyah'> & { tool: Tool; reference: Reference; onOpenTopics: (topics: QuranTopic[], active: QuranTopic | null) => void; onOpenSimilar: (reference: Reference, items: QuranSimilarAyah[]) => void }) {
  const [content, setContent] = useState<React.ReactNode>(null);
  const [failed, setFailed] = useState(false);
  const [loadedKey, setLoadedKey] = useState('');
  const key = JSON.stringify([tool, reference, page.pageNumber, selection, metadata, lang]);
  useEffect(() => {
    let alive = true;
    const api = typeof window !== "undefined" ? window.electronAPI?.quran : undefined;
    const load = async () => {
      if (!api) {
        if (alive) setFailed(true);
        return;
      }
      if (page.profile !== 'hafs') {
        if (alive) { setContent(<p>{t('quranCompatibleStudyUnavailable')}</p>); setFailed(false); setLoadedKey(key); }
        return;
      }
      const results: React.ReactNode[] = [];
      const references = quranStudyReferences(tool, reference, page.words);
      const seen = new Set<string>();
      for (const location of references) {
        if (!alive) return;
        const citation = `${location.surah}:${location.ayah}`;
        let wordPosition: number | undefined;
        if (reference.wordText && ['morphology', 'transliteration', 'mutashabihat', 'meanings'].includes(tool)) {
          const passage = await api.read({ script: selection.script, ...location, from: location.ayah });
          if (!passage.ok) throw new Error(passage.error);
          const normalize = (text: string) => normalizeArabicText(text, { normalizeTaaMarbuta: false, normalizeAlefMaksura: false, normalizeWawHamza: false, normalizeYaaHamza: false });
          const candidates = passage.data.ayahs.find(ayah => ayah.number === location.ayah)?.words.filter(word => !word.marker && normalize(word.text) === normalize(reference.wordText!)) || [];
          if (candidates.length === 1) wordPosition = candidates[0].position;
        }
        let body: React.ReactNode = null;
        if (tool === 'translation' || tool === 'transliteration') {
          if (tool === 'translation' ? !selection.translation : !selection.transliteration && !selection.ayahTransliteration) throw new Error('missing-source');
          const wholeAyah = tool === 'transliteration' && !wordPosition ? selection.ayahTransliteration || undefined : undefined;
          const result = await api.read({ script: selection.script, surah: location.surah, from: location.ayah, translation: tool === 'translation' ? selection.translation : undefined, transliteration: tool === 'transliteration' ? selection.transliteration || undefined : undefined, ayahTransliteration: wholeAyah });
          if (!result.ok) throw new Error(result.error);
          const ayah = result.data.ayahs.find(value => value.number === location.ayah);
          body = tool === 'translation' && ayah?.translation ? <QuranTranslationText translation={ayah.translation} t={t} /> : <>{ayah?.transliteration && <p dir="ltr" lang="en" data-quran-ayah-transliteration><QuranRichText nodes={ayah.transliteration} /></p>}{selection.transliteration && <p dir="ltr" className={ayah?.transliteration ? 'text-xs text-muted' : undefined}>{ayah?.words.filter(word => !word.marker && (!wordPosition || word.position === wordPosition)).map(word => word.transliteration || t('quranWordUnavailable')).join(' ')}</p>}</>;
        } else if (tool === 'meanings') {
          if (!selection.meanings) throw new Error('missing-source');
          const result = await api.read({ script: selection.script, surah: location.surah, from: location.ayah, meanings: selection.meanings });
          if (!result.ok) throw new Error(result.error);
          const words = result.data.ayahs.find(value => value.number === location.ayah)?.words.filter(word => !word.marker && (!wordPosition || word.position === wordPosition)) || [];
          body = <dl data-quran-word-meanings>{words.map(word => <div key={word.position} className="flex items-baseline justify-between gap-3 border-b border-subtle py-1"><dt dir="rtl" lang="ar" className="font-reading text-xl leading-loose">{word.text}</dt><dd dir="ltr" lang="en" className="text-sm text-end">{word.meaning || t('quranWordUnavailable')}</dd></div>)}</dl>;
        } else if (tool === 'themes') {
          const result = await api.ayahThemes({ ...location, pack: metadata.themes });
          if (!result.ok) throw new Error(result.error);
          const entries = groupThemeLabels(result.data).filter(theme => { const group = `${theme.surahNumber}:${theme.ayahFrom}:${theme.ayahTo}`; if (seen.has(group)) return false; seen.add(group); return true; });
          if (!entries.length) { if (references.length === 1) body = <p>{t('quranNoThemes')}</p>; else continue; }
          else body = <ul>{entries.map(theme => <li key={`${theme.ayahFrom}:${theme.ayahTo}`} className="mb-3"><p className="text-xs text-muted">{t('quranThemeAyahs', { from: theme.ayahFrom, to: theme.ayahTo })}</p><p dir="auto" className="font-semibold whitespace-pre-line">{theme.theme}</p>{theme.keywords.length > 0 && <p dir="auto" className="text-xs text-muted"><span>{t('quranThemeKeywords')}: </span>{theme.keywords.join(' · ')}</p>}</li>)}</ul>;
        } else if (tool === 'tafsir') {
          if (!selection.tafsir) throw new Error('missing-source');
          const result = await api.commentary({ script: selection.script, pack: selection.tafsir, ...location });
          if (!result.ok) throw new Error(result.error);
          const group = `${result.data.from}-${result.data.to}`;
          if (seen.has(group)) continue;
          seen.add(group);
          body = <div dir="rtl" lang="ar" className="font-reading text-xl leading-[2.2]"><p dir="ltr" className="text-xs">{group}</p><QuranRichText nodes={result.data.nodes} /></div>;
        } else if (tool === 'topics') {
          const result = await api.ayahTopics({ ...location, pack: metadata.topics });
          if (!result.ok) throw new Error(result.error);
          body = <ul>{result.data.map(topic => <li key={topic.topicId} className="mb-3"><button type="button" dir="auto" className="block w-full text-start underline-offset-2 hover:underline" onClick={() => onOpenTopics(result.data, topic)}><span className="font-semibold">{lang === 'ar' ? topic.arabicName || topic.name : topic.name}</span></button>{topic.description && <p dir="auto">{quranHtmlText(topic.description)}</p>}</li>)}</ul>;
        } else if (tool === 'similar') {
          const result = await api.similarAyahs(location);
          if (!result.ok) throw new Error(result.error);
          const matches: React.ReactNode[] = [];
          for (const match of result.data.slice(0, 50)) {
            const [surah, ayah] = match.matchedAyahKey.split(':').map(Number);
            const passage = await api.read({ script: selection.script, surah, from: ayah });
            if (!alive) return;
            const text = passage.ok ? passage.data.ayahs.find(value => value.number === ayah)?.words.map(word => word.text).join(' ') : '';
            matches.push(<button key={match.matchedAyahKey} type="button" onClick={() => onNavigateAyah?.({ surah, ayah })} className="block w-full text-start py-2 border-b border-subtle"><span dir="ltr">{match.matchedAyahKey}</span><span className="ms-3 text-xs text-muted">{t('quranSimilarityScore', { score: match.score })}</span><span dir="rtl" className="block font-reading text-xl leading-loose">{text}</span></button>);
          }
          body = <div>{result.data.length === 0 && t('quranNoSimilarAyahs')}{result.data.length > 0 && <button type="button" className="text-xs underline" onClick={() => onOpenSimilar(location, result.data)}>{t('quranViewSimilarAyahs')}</button>}{matches}</div>;
        } else if (tool === 'morphology') {
          const result = await api.morphology({ script: selection.script, ...location });
          if (!result.ok) throw new Error(result.error);
          const words = result.data.filter(word => !wordPosition || Number(word.location.split(':')[2]) === wordPosition);
          body = words.length ? <div>{words.map(word => <section key={word.location} className="py-2 border-b border-subtle"><p dir="ltr">{word.location}</p><dl>{([['root', 'quranMorphologyRoot'], ['lemma', 'quranMorphologyLemma'], ['stem', 'quranMorphologyStem']] as const).map(([field, label]) => <div key={field}><dt className="text-xs">{t(label)}</dt><dd dir={word[field] ? 'rtl' : undefined} className={word[field] ? 'font-reading text-xl leading-loose' : 'text-xs text-muted'}>{word[field] || t('quranWordUnavailable')}</dd>{field === 'root' && word.root && <RootHadiths root={word.root} t={t} />}</div>)}</dl></section>)}</div> : <p>{t('quranWordUnavailable')}</p>;
        } else if (tool === 'mutashabihat') {
          const result = await api.mutashabihat({ script: selection.script, ...location });
          if (!result.ok) throw new Error(result.error);
          const phrases = result.data.filter(phrase => !wordPosition || phrase.ranges.some(([from, to]) => wordPosition! >= from && wordPosition! <= to));
          body = phrases.length ? <div>{phrases.map(phrase => <section key={phrase.id} className="py-2 border-b border-subtle"><p dir="rtl" className="font-reading text-xl leading-loose">{phrase.text}</p><p dir="ltr" className="flex flex-wrap gap-x-2">{phrase.references.map(item => { const [surah, ayah] = item.split(':').map(Number); return <button key={item} type="button" className="underline" onClick={() => onNavigateAyah?.({ surah, ayah })}>{item}</button>; })}</p></section>)}</div> : <p>{t('quranNoSimilarAyahs')}</p>;
        } else {
          body = <p>{t('quranWordUnavailable')}</p>;
        }
        results.push(<section key={citation} className="border-b border-subtle py-3 text-sm leading-loose"><p dir="ltr" className="text-xs text-muted">{citation}</p>{reference.wordText && wordPosition && <p dir="rtl" className="font-reading text-xl">{reference.wordText}</p>}{reference.wordText && !wordPosition && ['morphology','transliteration','mutashabihat','meanings'].includes(tool) && <p className="text-xs text-muted">{t('quranAyahAlignmentFallback')}</p>}{body}</section>);
      }
      if (metadata.derived && ['topics', 'themes'].includes(tool)) results.push(<p key="derived" className="pt-3 text-xs text-muted">{t('quranArabicCopyNotice')}</p>);
      if (tool === 'meanings') results.push(<p key="alignment" className="pt-3 text-xs text-muted">{t('quranAlignmentNotice')}</p>);
      if (alive) { setContent(results); setFailed(false); setLoadedKey(key); }
    };
    void load().catch(() => { if (alive) { setFailed(true); setLoadedKey(key); } });
    return () => { alive = false; };
  }, [key, tool, reference, page, selection, metadata, t, lang, onNavigateAyah, onOpenTopics, onOpenSimilar]);
  return loadedKey !== key ? <p role="status">{t('quranLoading')}</p> : failed ? <p role="alert">{t('quranReaderError')}</p> : <>{content}</>;
}

export function QuranMushafWorkspace(props: Props) {
  const { page, t, selection, metadata, studyTarget, onStudyTargetConsumed, onNavigateAyah } = props;
  const [windows, setWindows] = useState<WindowState[]>([]);
  const sequence = useRef(0);
  const [menu, setMenu] = useState<{ reference: Reference; x: number; y: number } | null>(null);
  const [showThemes, setShowThemes] = useState(false);
  const [themes, setThemes] = useState<QuranAyahTheme[]>([]);
  const [positions, setPositions] = useState<{ theme: QuranAyahTheme; top: number; height: number; left: number }[]>([]);
  const [topicDrawer, setTopicDrawer] = useState<{ topics: QuranTopic[]; active: QuranTopic | null } | null>(null);
  const [similarDrawer, setSimilarDrawer] = useState<{ reference: Reference; items: QuranSimilarAyah[] } | null>(null);
  const openTopics = useCallback((topics: QuranTopic[], active: QuranTopic | null) => setTopicDrawer({ topics, active }), []);
  const openSimilar = useCallback((reference: Reference, items: QuranSimilarAyah[]) => setSimilarDrawer({ reference, items }), []);
  const searchTopics = useCallback(async (text: string) => { const result = await window.electronAPI.quran.searchTopics({ text, pack: metadata.topics }); if (!result.ok) throw new Error(result.error); return result.data; }, [metadata.topics]);
  const loadTopics = useCallback(async (ids: number[]) => { const result = await window.electronAPI.quran.topics({ ids, pack: metadata.topics }); if (!result.ok) throw new Error(result.error); return result.data; }, [metadata.topics]);
  const navigateFromDrawer = useCallback((surah: number, ayah: number) => { setTopicDrawer(null); setSimilarDrawer(null); onNavigateAyah?.({ surah, ayah }); }, [onNavigateAyah]);
  const root = useRef<HTMLDivElement>(null);
  const menuElement = useRef<HTMLDivElement>(null);
  const studyPanel = useRef<HTMLElement>(null);
  const activePanelId = windows[0]?.id;
  useEffect(() => {
    if (!activePanelId) return;
    const previous = document.activeElement as HTMLElement | null;
    studyPanel.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [activePanelId]);
  const open = useCallback((tool: Tool, reference: Reference, side: 'left' | 'right') => {
    setWindows([{ id: ++sequence.current, tool, reference, side }]);
    setMenu(null);
  }, []);
  useEffect(() => {
    if (!studyTarget) return;
    const timer = setTimeout(() => { open('explore', studyTarget, 'left'); onStudyTargetConsumed?.(); }, 0);
    return () => clearTimeout(timer);
  }, [studyTarget, onStudyTargetConsumed, open]);
  useEffect(() => {
    if (!showThemes || page.profile !== 'hafs') return;
    let alive = true;
    const surahs = [...new Set(page.words.map(word => word.surah))];
    if (!window.electronAPI?.quran) return;
    void Promise.all(surahs.map(surah => window.electronAPI.quran.ayahThemes({ surah, pack: metadata.themes }))).then(results => {
      if (!alive) return;
      setThemes(groupThemeLabels(results.flatMap(result => result.ok ? result.data : [])));
    }).catch(() => { if (alive) setThemes([]); });
    return () => { alive = false; };
  }, [showThemes, page, metadata.themes]);
  useEffect(() => {
    const container = root.current;
    if (!container || !showThemes || page.profile !== 'hafs') return;
    const position = () => {
      const origin = container.getBoundingClientRect();
      const surface = container.querySelector('.mushaf-svg-surface')?.getBoundingClientRect();
      if (!surface) return;
      setPositions(themes.flatMap(theme => {
        const boxes = [...container.querySelectorAll<SVGGElement>('[data-surah][data-aya]')]
          .filter(group => Number(group.getAttribute('data-surah')) === Number(theme.surahNumber) && Number(group.getAttribute('data-aya')) >= theme.ayahFrom && Number(group.getAttribute('data-aya')) <= theme.ayahTo)
          .map(group => group.getBoundingClientRect())
          .filter(box => box.width > 0 && box.height > 0 && box.bottom > surface.top && box.top < surface.bottom);
        if (!boxes.length) return [];
        const top = Math.max(surface.top, Math.min(...boxes.map(box => box.top)));
        const bottom = Math.min(surface.bottom, Math.max(...boxes.map(box => box.bottom)));
        return [{ theme, top: top - origin.top, height: bottom - top, left: surface.right - origin.left + 8 }];
      }));
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(container);
    const surface = container.querySelector('.mushaf-svg-surface');
    if (surface) observer.observe(surface);
    container.addEventListener('scroll', position, true);
    return () => { observer.disconnect(); container.removeEventListener('scroll', position, true); };
  }, [themes, showThemes, page]);
  useEffect(() => {
    if (!menu) return;
    const previous = document.activeElement as HTMLElement | null;
    menuElement.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(null); };
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('keydown', close); if (previous?.isConnected) previous.focus(); };
  }, [menu]);
  const pageStart = { surah: page.surahStart, ayah: page.ayahStart };
  return <div ref={root} className="relative h-full min-h-0" data-quran-workspace>
    <style>{`
      [data-immersive] .quran-edge { opacity:0; transition:opacity .18s; }
      [data-immersive] .quran-edge:hover,[data-immersive] .quran-edge:focus-within { opacity:1; }
      [data-immersive] [data-quran-mushaf]>div:nth-child(2) { opacity:0; }
      [data-immersive] [data-quran-mushaf]>div:nth-child(2):hover,[data-immersive] [data-quran-mushaf]>div:nth-child(2):focus-within { opacity:1; }
    `}</style>
    <QuranMushafView {...props} cardSource={props.selection} onContextAyah={(reference, point) => setMenu({ reference, ...point })} onExploreAyah={reference => open('explore', reference, 'left')} />
    <nav aria-label={t('quranReadingOptions')} className="quran-edge absolute right-0 top-1/3 z-20 flex flex-col gap-2 p-3 rounded-s-2xl bg-surface/95 border border-subtle shadow-lg">
      {([['tafsir', BookOpen], ['translation', Languages], ['meanings', Type], ['topics', Layers], ['themes', ListTree]] as const).map(([tool, Icon]) => <button key={tool} type="button" title={t(labels[tool])} aria-label={t(labels[tool])} onClick={() => open(tool, { ...pageStart, wholePage: true }, 'right')} className="p-2 rounded-xl hover:bg-emerald-500/15"><Icon className="size-5" /></button>)}
      <button type="button" title={t('quranCatTheme')} aria-label={t('quranCatTheme')} aria-pressed={showThemes} onClick={() => setShowThemes(value => !value)} className="p-2 rounded-xl hover:bg-emerald-500/15"><Lightbulb className="size-5" /></button>
    </nav>
    {props.canPlay && <div className="quran-edge absolute bottom-3 inset-x-0 z-20 flex justify-center pointer-events-none"><button type="button" title={t('quranAudioPlay')} aria-label={t('quranAudioPlay')} onClick={() => props.onStartAudio(pageStart)} data-quran-play-button className="pointer-events-auto rounded-full bg-emerald-700 p-4 text-white shadow-lg"><Play className="size-6" /></button></div>}
    {showThemes && page.profile === 'hafs' && positions.map(({ theme, top, height, left }, index) => <aside key={`${theme.surahNumber}:${theme.ayahFrom}:${theme.ayahTo}:${index}`} data-quran-theme-marker data-surah={theme.surahNumber} data-ayah-from={theme.ayahFrom} data-ayah-to={theme.ayahTo} aria-label={`${theme.theme} · ${theme.surahNumber}:${theme.ayahFrom}–${theme.ayahTo}`} style={{ top, height, left, maxWidth: `max(0px, min(7rem, calc(100% - ${left}px - 56px)))` }} className="absolute pointer-events-none border-s-4 border-y-2 border-amber-600 rounded-s-lg ps-2 text-xs text-amber-700 dark:text-amber-300 overflow-hidden whitespace-pre-line" dir="ltr"><span dir="auto">{theme.theme}</span></aside>)}
    {windows.map(panel => <aside ref={studyPanel} key={panel.id} data-quran-study-panel role="region" aria-label={t(labels[panel.tool])} dir={props.dir} style={{ resize: 'both' }} className={`absolute top-20 z-30 h-[min(36rem,calc(100%-11rem))] w-[min(25rem,calc(100%-1.5rem))] max-w-[calc(100%-1.5rem)] sm:max-w-[calc(100%-7rem)] max-h-[calc(100%-11rem)] min-h-28 min-w-48 flex flex-col rounded-2xl border border-subtle bg-surface shadow-xl overflow-hidden ${panel.side === 'left' ? 'start-3 sm:start-14' : 'end-3 sm:end-14'}`} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setWindows([]); } }}>
      <header className="shrink-0 border-b border-subtle flex items-center justify-between gap-2 p-3"><h2 className="text-sm font-semibold">{t(labels[panel.tool])}</h2>{panel.tool === 'topics' && page.profile === 'hafs' && <button type="button" onClick={() => setTopicDrawer({ topics: [], active: null })} className="ms-auto text-xs underline">{t('quranTopicBrowse')}</button>}<button type="button" aria-label={t('quranClosePanel')} onClick={() => setWindows([])} className="rounded-lg p-2 focus-visible:outline-emerald-500"><X className="size-4" /></button></header>
      <div tabIndex={0} aria-label={t(labels[panel.tool])} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable] break-words select-text p-4 leading-loose focus-visible:outline-emerald-500">{(panel.tool === 'explore' ? ['morphology', 'meanings', 'transliteration', 'mutashabihat', 'similar'] as Tool[] : [panel.tool]).map(tool => <section key={tool}><h3 className="font-semibold text-sm">{t(labels[tool])}</h3>{['similar', 'mutashabihat', 'topics', 'themes'].includes(tool) && <p className="text-xs text-muted leading-relaxed">{t('quranConnectionSource', { resource: t(labels[tool]) })}</p>}<StudyContent tool={tool} reference={panel.reference} page={page} selection={selection} metadata={metadata} t={t} lang={props.lang} onNavigateAyah={onNavigateAyah} onOpenTopics={openTopics} onOpenSimilar={openSimilar} /></section>)}</div>
    </aside>)}
    {menu && <QuranActionMenu portal anchor={{ x: menu.x, y: menu.y }} onClose={() => setMenu(null)} input={{ reference: menu.reference, script: selection.script, profile: page.profile, language: props.lang, t,
        tafsir: selection.tafsir ? () => open('tafsir',menu.reference,'left') : undefined,
        translation: selection.translation ? () => open('translation',menu.reference,'left') : undefined,
        play: props.canPlay ? () => props.onStartAudio(menu.reference) : undefined,
      }} toolsLabel={t('quranReadingOptions')}
      tools={(['morphology','meanings','transliteration','mutashabihat','similar','topics','themes'] as Tool[]).map(tool => ({id:tool,label:t(labels[tool])}))}
      onTool={tool=>open(tool as Tool,menu.reference,'left')} />}
    {topicDrawer && <QuranTopicDrawer topics={topicDrawer.topics} activeTopic={topicDrawer.active} onSelectTopic={topic => setTopicDrawer(current => ({ topics: current?.topics.some(item => item.topicId === topic.topicId) ? current.topics : [...(current?.topics || []), topic], active: topic }))} onSelectAyah={navigateFromDrawer} onClose={() => setTopicDrawer(null)} t={t} lang={props.lang} dir={props.dir} onSearch={searchTopics} onLoadTopics={loadTopics} />}
    {similarDrawer && <QuranSimilarAyahsDrawer surah={similarDrawer.reference.surah} ayah={similarDrawer.reference.ayah} similarAyahs={similarDrawer.items} surahs={props.surahs} script={selection.script} t={t} lang={props.lang} dir={props.dir} onClose={() => setSimilarDrawer(null)} onNavigateAyah={navigateFromDrawer} onCopy={props.onCopyText} />}
  </div>;
}
