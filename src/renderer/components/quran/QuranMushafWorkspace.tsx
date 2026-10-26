'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Languages, Layers, Lightbulb, Play, X } from 'lucide-react';
import type { QuranAyahTheme, QuranRichNode } from '../../../shared/types/quran';
import type { TranslationKey } from '../../translations';
import { QuranMushafView } from './QuranMushafView';
import { QuranTranslationText } from './QuranTranslationText';
import { normalizeArabicText } from '../../../shared/utils/text-normalizer';

type Reference = { surah: number; ayah: number; wordText?: string };
type Tool = 'translation' | 'tafsir' | 'topics' | 'transliteration' | 'similar' | 'morphology' | 'mutashabihat' | 'explore';
type WindowState = { id: number; tool: Tool; reference: Reference; side: 'left' | 'right' };
type Props = React.ComponentProps<typeof QuranMushafView> & {
  selection: { script: string; translation: string; tafsir: string; transliteration: string; meanings: string };
  onStartAudio: (reference: Reference) => void;
  canPlay: boolean;
  studyTarget?: Reference | null;
  onStudyTargetConsumed?: () => void;
  onNavigateAyah?: (reference: Reference) => void;
};
const labels: Record<Tool, TranslationKey> = {
  translation: 'quranCatTranslation', tafsir: 'quranCatTafsir', topics: 'quranCatTopics',
  transliteration: 'quranCatTransliteration', similar: 'quranCatSimilar', morphology: 'quranCatMorphology',
  mutashabihat: 'quranCatMutashabihat', explore: 'quranReadingOptions',
};
function Rich({ nodes }: { nodes: QuranRichNode[] }) {
  return <>{nodes.map((node, index) => node.tag === 'text' ? <React.Fragment key={index}>{node.text}</React.Fragment> : React.createElement(node.tag, { key: index }, node.tag === 'br' ? undefined : <Rich nodes={node.children || []} />))}</>;
}

function StudyContent({ tool, reference, page, selection, t, onNavigateAyah }: Pick<Props, 'page' | 'selection' | 't' | 'onNavigateAyah'> & { tool: Tool; reference: Reference }) {
  const [content, setContent] = useState<React.ReactNode>(null);
  const [failed, setFailed] = useState(false);
  const [loadedKey, setLoadedKey] = useState('');
  const key = JSON.stringify([tool, reference, page.pageNumber, selection]);
  useEffect(() => {
    let alive = true;
    const api = window.electronAPI.quran;
    const load = async () => {
      if (page.profile !== 'hafs') {
        if (alive) { setContent(<p>{t('quranCompatibleStudyUnavailable')}</p>); setFailed(false); setLoadedKey(key); }
        return;
      }
      const results: React.ReactNode[] = [];
      const references = ['translation', 'tafsir', 'topics'].includes(tool)
        ? [...new Map(page.words.map(word => [`${word.surah}:${word.ayah}`, { surah: word.surah, ayah: word.ayah }])).values()]
        : [reference];
      const seen = new Set<string>();
      for (const location of references) {
        if (!alive) return;
        const citation = `${location.surah}:${location.ayah}`;
        let wordPosition: number | undefined;
        if (reference.wordText && ['morphology', 'transliteration', 'mutashabihat'].includes(tool)) {
          const passage = await api.read({ script: selection.script, ...location, from: location.ayah });
          if (!passage.ok) throw new Error(passage.error);
          const normalize = (text: string) => normalizeArabicText(text, { normalizeTaaMarbuta: false, normalizeAlefMaksura: false, normalizeWawHamza: false, normalizeYaaHamza: false });
          const candidates = passage.data.ayahs.find(ayah => ayah.number === location.ayah)?.words.filter(word => !word.marker && normalize(word.text) === normalize(reference.wordText!)) || [];
          if (candidates.length === 1) wordPosition = candidates[0].position;
        }
        let body: React.ReactNode = null;
        if (tool === 'translation' || tool === 'transliteration') {
          if (tool === 'translation' ? !selection.translation : !selection.transliteration) throw new Error('missing-source');
          const result = await api.read({ script: selection.script, surah: location.surah, from: location.ayah, translation: tool === 'translation' ? selection.translation : undefined, transliteration: tool === 'transliteration' ? selection.transliteration : undefined });
          if (!result.ok) throw new Error(result.error);
          const ayah = result.data.ayahs.find(value => value.number === location.ayah);
          body = tool === 'translation' && ayah?.translation ? <QuranTranslationText translation={ayah.translation} t={t} /> : <p dir="ltr">{ayah?.words.filter(word => !word.marker && (!wordPosition || word.position === wordPosition)).map(word => word.transliteration || t('quranWordUnavailable')).join(' ')}</p>;
        } else if (tool === 'tafsir') {
          if (!selection.tafsir) throw new Error('missing-source');
          const result = await api.commentary({ script: selection.script, pack: selection.tafsir, ...location });
          if (!result.ok) throw new Error(result.error);
          const group = `${result.data.from}-${result.data.to}`;
          if (seen.has(group)) continue;
          seen.add(group);
          body = <div dir="rtl" lang="ar" className="font-reading text-xl leading-[2.2]"><p dir="ltr" className="text-xs">{group}</p><Rich nodes={result.data.nodes} /></div>;
        } else if (tool === 'topics') {
          const result = await api.ayahTopics(location);
          if (!result.ok) throw new Error(result.error);
          body = <ul>{result.data.map(topic => <li key={topic.topicId} className="mb-3"><p dir="auto" className="font-semibold">{topic.arabicName || topic.name}</p><p dir="auto">{topic.description}</p></li>)}</ul>;
        } else if (tool === 'similar') {
          const result = await api.similarAyahs(location);
          if (!result.ok) throw new Error(result.error);
          const matches: React.ReactNode[] = [];
          for (const match of result.data.slice(0, 50)) {
            const [surah, ayah] = match.matchedAyahKey.split(':').map(Number);
            const passage = await api.read({ script: selection.script, surah, from: ayah });
            if (!alive) return;
            const text = passage.ok ? passage.data.ayahs.find(value => value.number === ayah)?.words.map(word => word.text).join(' ') : '';
            matches.push(<button key={match.matchedAyahKey} type="button" onClick={() => onNavigateAyah?.({ surah, ayah })} className="block w-full text-start py-2 border-b border-subtle"><span dir="ltr">{match.matchedAyahKey}</span><span dir="rtl" className="block font-reading text-xl leading-loose">{text}</span></button>);
          }
          body = <div>{result.data.length === 0 && t('quranNoSimilarAyahs')}{matches}</div>;
        } else if (tool === 'morphology') {
          const result = await api.morphology({ script: selection.script, ...location });
          if (!result.ok) throw new Error(result.error);
          const words = result.data.filter(word => !wordPosition || Number(word.location.split(':')[2]) === wordPosition);
          body = words.length ? <div>{words.map(word => <section key={word.location} className="py-2 border-b border-subtle"><p dir="ltr">{word.location}</p><dl>{([['root', 'quranMorphologyRoot'], ['lemma', 'quranMorphologyLemma'], ['stem', 'quranMorphologyStem']] as const).map(([field, label]) => <div key={field}><dt className="text-xs">{t(label)}</dt><dd dir={word[field] ? 'rtl' : undefined} className={word[field] ? 'font-reading text-xl leading-loose' : 'text-xs text-muted'}>{word[field] || t('quranWordUnavailable')}</dd></div>)}</dl></section>)}</div> : <p>{t('quranWordUnavailable')}</p>;
        } else if (tool === 'mutashabihat') {
          const result = await api.mutashabihat({ script: selection.script, ...location });
          if (!result.ok) throw new Error(result.error);
          const phrases = result.data.filter(phrase => !wordPosition || phrase.ranges.some(([from, to]) => wordPosition! >= from && wordPosition! <= to));
          body = phrases.length ? <div>{phrases.map(phrase => <section key={phrase.id} className="py-2 border-b border-subtle"><p dir="rtl" className="font-reading text-xl leading-loose">{phrase.text}</p><p dir="ltr">{phrase.references.join(' · ')}</p></section>)}</div> : <p>{t('quranNoSimilarAyahs')}</p>;
        } else {
          body = <p>{t('quranWordUnavailable')}</p>;
        }
        results.push(<section key={citation} className="border-b border-subtle py-3 text-sm leading-loose"><p dir="ltr" className="text-xs text-muted">{citation}</p>{reference.wordText && wordPosition && <p dir="rtl" className="font-reading text-xl">{reference.wordText}</p>}{reference.wordText && !wordPosition && ['morphology','transliteration','mutashabihat'].includes(tool) && <p className="text-xs text-muted">{t('quranAyahAlignmentFallback')}</p>}{body}</section>);
      }
      if (alive) { setContent(results); setFailed(false); setLoadedKey(key); }
    };
    void load().catch(() => { if (alive) { setFailed(true); setLoadedKey(key); } });
    return () => { alive = false; };
  }, [key, tool, reference, page, selection, t, onNavigateAyah]);
  return loadedKey !== key ? <p role="status">{t('quranLoading')}</p> : failed ? <p role="alert">{t('quranReaderError')}</p> : <>{content}</>;
}

export function QuranMushafWorkspace(props: Props) {
  const { page, t, selection, studyTarget, onStudyTargetConsumed } = props;
  const [windows, setWindows] = useState<WindowState[]>([]);
  const sequence = useRef(0);
  const [menu, setMenu] = useState<{ reference: Reference; x: number; y: number } | null>(null);
  const [showThemes, setShowThemes] = useState(false);
  const [themes, setThemes] = useState<QuranAyahTheme[]>([]);
  const [positions, setPositions] = useState<{ theme: QuranAyahTheme; top: number; height: number; left: number }[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const menuElement = useRef<HTMLDivElement>(null);
  const open = useCallback((tool: Tool, reference: Reference, side: 'left' | 'right') => {
    setWindows(previous => [...previous, { id: ++sequence.current, tool, reference, side }]);
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
    void Promise.all(surahs.map(surah => window.electronAPI.quran.ayahThemes({ surah }))).then(results => {
      if (!alive) return;
      const groups = new Map<string, QuranAyahTheme>();
      for (const theme of results.flatMap(result => result.ok ? result.data : [])) {
        const key = `${theme.surahNumber}:${theme.ayahFrom}:${theme.ayahTo}`;
        const existing = groups.get(key);
        groups.set(key, existing ? { ...existing, theme: `${existing.theme}\n${theme.theme}` } : theme);
      }
      setThemes([...groups.values()]);
    }).catch(() => { if (alive) setThemes([]); });
    return () => { alive = false; };
  }, [showThemes, page]);
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
          .map(group => group.getBoundingClientRect());
        if (!boxes.length) return [];
        const top = Math.min(...boxes.map(box => box.top));
        const bottom = Math.max(...boxes.map(box => box.bottom));
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
    <QuranMushafView {...props} onContextAyah={(reference, point) => setMenu({ reference, ...point })} onExploreAyah={reference => open('explore', reference, 'left')} />
    <nav aria-label={t('quranReadingOptions')} className="quran-edge absolute right-0 top-1/3 z-20 flex flex-col gap-2 p-3 rounded-s-2xl bg-surface/95 border border-subtle shadow-lg">
      {([['tafsir', BookOpen], ['translation', Languages], ['topics', Layers]] as const).map(([tool, Icon]) => <button key={tool} type="button" title={t(labels[tool])} aria-label={t(labels[tool])} onClick={() => open(tool, pageStart, 'right')} className="p-2 rounded-xl hover:bg-emerald-500/15"><Icon className="size-5" /></button>)}
      <button type="button" title={t('quranCatTheme')} aria-label={t('quranCatTheme')} aria-pressed={showThemes} onClick={() => setShowThemes(value => !value)} className="p-2 rounded-xl hover:bg-emerald-500/15"><Lightbulb className="size-5" /></button>
    </nav>
    {props.canPlay && <div className="quran-edge absolute bottom-2 start-1/2 -translate-x-1/2 z-20 p-3"><button type="button" title={t('quranAudioPlay')} aria-label={t('quranAudioPlay')} onClick={() => props.onStartAudio(pageStart)} className="rounded-full bg-emerald-700 p-4 text-white shadow-lg"><Play className="size-6" /></button></div>}
    {showThemes && page.profile === 'hafs' && positions.map(({ theme, top, height, left }, index) => <aside key={`${theme.surahNumber}:${theme.ayahFrom}:${theme.ayahTo}:${index}`} style={{ top, height, left, maxWidth: `max(0px, min(7rem, calc(100% - ${left}px - 56px)))` }} className="absolute pointer-events-none border-s-4 border-y-2 border-amber-600 rounded-s-lg ps-2 text-xs text-amber-700 dark:text-amber-300 overflow-hidden whitespace-pre-line" dir="ltr"><span dir="auto">{theme.theme}</span></aside>)}
    {(['left', 'right'] as const).map(side => <div key={side} className="absolute top-20 bottom-20 z-30 flex flex-col gap-3 overflow-auto pointer-events-none max-w-[calc(100%-5rem)]" style={{ [side]: 56, width: 'min(25rem, calc(100% - 5rem))' }}>{windows.filter(window => window.side === side).map(window => {
      return <aside key={window.id} role="region" aria-label={t(labels[window.tool])} dir={props.dir} className="shrink-0 pointer-events-auto rounded-2xl border border-subtle bg-surface shadow-xl overflow-auto resize" style={{ width: '100%', height: windows.filter(candidate => candidate.side === side).length > 1 ? 230 : 420, minWidth: 180, minHeight: 100, maxWidth: '100%', maxHeight: '70vh' }}>
        <header className="sticky top-0 bg-surface border-b border-subtle flex items-center justify-between gap-2 p-3"><h2 className="text-sm font-semibold">{t(labels[window.tool])}</h2><button type="button" aria-label={t('quranClosePanel')} onClick={() => setWindows(previous => previous.filter(candidate => candidate.id !== window.id))}><X className="size-4" /></button></header>
        <div className="p-3">{(window.tool === 'explore' ? ['morphology', 'transliteration', 'mutashabihat', 'similar'] as Tool[] : [window.tool]).map(tool => <section key={tool}><h3 className="font-semibold text-sm">{t(labels[tool])}</h3><StudyContent tool={tool} reference={window.reference} page={page} selection={selection} t={t} onNavigateAyah={props.onNavigateAyah} /></section>)}</div>
      </aside>;
    })}</div>)}
    {menu && <><div className="fixed inset-0 z-40" onPointerDown={() => setMenu(null)} /><div ref={menuElement} role="menu" onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...(menuElement.current?.querySelectorAll<HTMLButtonElement>('button') || [])];
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }} className="fixed z-50 rounded-xl border border-subtle bg-surface p-2 shadow-xl max-h-[70vh] overflow-auto" style={{ left: Math.max(0, Math.min(menu.x, globalThis.innerWidth - 240)), top: Math.max(0, Math.min(menu.y, globalThis.innerHeight - 340)), width: 230 }}>{(['morphology', 'transliteration', 'mutashabihat', 'similar', 'tafsir', 'translation', 'topics'] as Tool[]).map(tool => <button key={tool} type="button" role="menuitem" onClick={() => open(tool, menu.reference, 'left')} className="block w-full text-start px-3 py-2 text-sm rounded-lg hover:bg-emerald-500/15">{t(labels[tool])}</button>)}</div></>}
  </div>;
}
