'use client';

import { IslamicReaderPanel } from '../islamic/IslamicReaderChrome';
import { PersonalCommentary } from '../knowledge/PersonalCommentary';
import type { ReaderTab } from '../islamic/reader-chrome';
import { QuranActionMenu } from '../actions/QuranActionMenu';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NoteMarker } from '../notes/NoteMarker';
import { usePassageHighlightActions, usePassageHighlights } from '../../hooks/usePassageHighlights';
import { PASSAGE_HIGHLIGHT_COLORS, compareWords, parseQuranHighlight, quranRangeLocation, wordInRange, type WordRef } from '../../../shared/passage-highlights';
import type { MenuItemProps } from '../ui/Menu';
import { colorKeys } from '../reader/ReaderMarkupBar';
import { useNoteMarkers } from '../../hooks/useNoteMarkers';
import { passageNote } from '../actions/passage-actions';
import { BookOpen, Languages, Layers, Lightbulb, ListTree, Play, Type, MoreHorizontal } from 'lucide-react';
import type { QuranAyahTheme, QuranSimilarAyah, QuranTopic } from '../../../shared/types/quran';
import type { SunnahSearchHit } from '../../../shared/types/sunnah';
import type { TranslationKey } from '../../translations';
import { QuranMushafView } from './QuranMushafView';
import { QuranTranslationText } from './QuranTranslationText';
import { QuranRichText, quranHtmlText } from './QuranRichText';
import { QuranTopicDrawer } from './QuranTopicDrawer';
import { QuranSimilarAyahsDrawer } from './QuranSimilarAyahsDrawer';
import { QuranAyahDeckDialog } from './QuranAyahDeckDialog';
import { collectionKeys } from '../../utils/sunnah-collections';
import { openSunnahReference } from '../../utils/study-navigation';
import { groupThemeLabels } from './quran-theme-labels';
import { quranStudyReferences } from '../../../shared/quran-study-scope';
import { normalizeArabicText } from '../../../shared/utils/text-normalizer';

type Reference = { surah: number; ayah: number; wordText?: string; wholePage?: boolean };
type Tool = 'translation' | 'meanings' | 'tafsir' | 'topics' | 'themes' | 'transliteration' | 'similar' | 'morphology' | 'mutashabihat' | 'explore';
type WindowState = { id: number; tool: Tool; reference: Reference; side: 'left' | 'right' };
type Props = React.ComponentProps<typeof QuranMushafView> & {
  panelOpen?: boolean;
  onPanelChange?: (open: boolean) => void;
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
          // The panel header names the ayah; show the passage range only when the tafsir covers several ayahs.
          body = <div dir="rtl" lang="ar" className="font-reading text-xl leading-[2.2]">{result.data.from !== result.data.to && <p dir="ltr" className="text-xs">{result.data.from}–{result.data.to}</p>}<QuranRichText nodes={result.data.nodes} /></div>;
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
  const { page, t, selection, metadata, studyTarget, onStudyTargetConsumed, onNavigateAyah, onPanelChange } = props;
  const [notesTab, setNotesTab] = useState(false);
  const [windows, setWindows] = useState<WindowState[]>([]);
  const [menu, setMenu] = useState<{ reference: Reference; x: number; y: number } | null>(null);
  const [showThemes, setShowThemes] = useState(false);
  const [deckFrom, setDeckFrom] = useState<Reference | null>(null);
  const [themes, setThemes] = useState<QuranAyahTheme[]>([]);
  const [positions, setPositions] = useState<{ theme: QuranAyahTheme; top: number; height: number; left: number }[]>([]);
  // KEY-337: ayahs on this page that have notes show a small marker in the page margin; it opens them beside the text.
  const noteCounts = useNoteMarkers();
  // KEY-340: colour highlights on ayahs and word ranges, and the menu items that set or remove them.
  const quranHighlights = usePassageHighlights('quran:');
  const highlightActions = usePassageHighlightActions();
  const highlightItems = (reference: Reference & { range?: { start: WordRef; end: WordRef } }): MenuItemProps[] => {
    const range = reference.range ?? { start: { surah: reference.surah, ayah: reference.ayah, word: 0 }, end: { surah: reference.surah, ayah: reference.ayah, word: Number.MAX_SAFE_INTEGER } };
    const location = reference.range ? quranRangeLocation(page.profile, range.start, range.end) : `quran:${page.profile}:${reference.surah}:${reference.ayah}`;
    const text = page.words.filter(word => word.type !== 'aya-mark' && wordInRange({ surah: word.surah, ayah: word.ayah, word: word.wordIndex }, range)).map(word => word.canonicalText || word.textHafs || '').join(' ').trim();
    const overlapping = quranHighlights.filter(item => { const other = parseQuranHighlight(item.location); return other && other.profile === page.profile && compareWords(other.start, range.end) <= 0 && compareWords(range.start, other.end) <= 0; });
    return [
      ...(reference.range ? [{ id: 'copy-selection', label: t('passageCopySelection'), onClick: () => navigator.clipboard.writeText(text) }] : []),
      { id: 'highlight', label: t('passageHighlight'), children: [
        ...PASSAGE_HIGHLIGHT_COLORS.map(color => ({ id: 'highlight-' + color, label: t(colorKeys[color]), onClick: async () => { if (overlapping.length) await highlightActions.remove(overlapping.map(item => item.id)); await highlightActions.save(location, color, text); } })),
        ...(overlapping.length ? [{ id: 'highlight-remove', label: t('passageHighlightRemove'), onClick: () => highlightActions.remove(overlapping.map(item => item.id)) }] : []),
      ] },
    ];
  };
  const notedAyahs = useMemo(() => {
    const seen = new Map<string, Reference & { count: number }>();
    for (const word of page.words) {
      const key = `quran:${word.surah}:${word.ayah}`;
      const count = noteCounts.get(key);
      if (count && !seen.has(key)) seen.set(key, { surah: word.surah, ayah: word.ayah, count });
    }
    return [...seen.values()];
  }, [page.words, noteCounts]);
  const [notePositions, setNotePositions] = useState<{ surah: number; ayah: number; count: number; top: number; left: number }[]>([]);
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
    setNotesTab(false);
    onPanelChange?.(true);
    setWindows([{ id: 1, tool, reference, side }]);
    setMenu(null);
  }, [onPanelChange]);
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
    const container = root.current;
    if (!container || !notedAyahs.length) { setNotePositions([]); return; }
    const position = () => {
      const origin = container.getBoundingClientRect();
      const surface = container.querySelector('.mushaf-svg-surface')?.getBoundingClientRect();
      if (!surface) return;
      setNotePositions(notedAyahs.flatMap(ayah => {
        // Mushaf SVGs may zero-pad the numbers, so compare them as numbers (as the theme markers do).
        const boxes = [...container.querySelectorAll<Element>('[data-surah][data-aya]')]
          .filter(element => Number(element.getAttribute('data-surah')) === ayah.surah && Number(element.getAttribute('data-aya')) === ayah.ayah)
          .map(element => element.getBoundingClientRect())
          .filter(box => box.width > 0 && box.height > 0 && box.bottom > surface.top && box.top < surface.bottom);
        if (!boxes.length) return [];
        // The marker sits in the left margin, level with the line where the ayah starts.
        return [{ ...ayah, top: Math.max(...boxes.map(box => box.top)) - origin.top, left: Math.max(4, surface.left - origin.left - 34) }];
      }));
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(container);
    const surface = container.querySelector('.mushaf-svg-surface');
    if (surface) observer.observe(surface);
    container.addEventListener('scroll', position, true);
    const late = setTimeout(position, 400);
    return () => { observer.disconnect(); container.removeEventListener('scroll', position, true); clearTimeout(late); };
  }, [notedAyahs, page]);
  useEffect(() => {
    if (!menu) return;
    const previous = document.activeElement as HTMLElement | null;
    menuElement.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(null); };
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('keydown', close); if (previous?.isConnected) previous.focus(); };
  }, [menu]);
  const pageStart = { surah: page.surahStart, ayah: page.ayahStart };
  return <div ref={root} className="group/quran relative h-full min-h-0" data-quran-workspace data-page-profile={page.profile}>
    <style>{`
      [data-immersive] .quran-edge { opacity:0; transition:opacity .18s; }
      [data-immersive] .quran-edge:hover,[data-immersive] .quran-edge:focus-within { opacity:1; }
      [data-immersive] [data-quran-mushaf]>div:nth-child(2) { opacity:0; }
      [data-immersive] [data-quran-mushaf]>div:nth-child(2):hover,[data-immersive] [data-quran-mushaf]>div:nth-child(2):focus-within { opacity:1; }
    `}</style>
    <QuranMushafView {...props} highlights={quranHighlights} cardSource={props.selection} onContextAyah={(reference, point) => setMenu({ reference, ...point })} onExploreAyah={reference => open('explore', reference, 'left')} />
    {props.panelOpen !== undefined && <button type="button" data-quran-ayah-actions title={t('ribbonMoreActions')} aria-label={t('ribbonMoreActions')} onClick={event => { const r = event.currentTarget.getBoundingClientRect(); setMenu({ reference: props.selectedAyah || pageStart, x:r.x, y:r.bottom }); }} className="absolute top-3 end-5 rounded-lg border border-subtle bg-surface p-2 opacity-0 group-hover/quran:opacity-100 group-focus-within/quran:opacity-100 focus:opacity-100"><MoreHorizontal size={18} /></button>}
    {/* KEY-323: with the study panel (KEY-305) the edge tools are hidden; keep the margin theme markers reachable. */}
    {props.panelOpen !== undefined && page.profile === 'hafs' && <button type="button" data-quran-theme-toggle title={t('quranCatTheme')} aria-label={t('quranCatTheme')} aria-pressed={showThemes} onClick={() => setShowThemes(value => !value)} className={`absolute top-3 end-16 rounded-lg border border-subtle bg-surface p-2 group-hover/quran:opacity-100 group-focus-within/quran:opacity-100 focus:opacity-100 ${showThemes ? 'opacity-100 text-emerald-600' : 'opacity-0'}`}><Lightbulb size={18} /></button>}
    {props.panelOpen === undefined && <>    <nav aria-label={t('quranReadingOptions')} className="quran-edge absolute right-0 top-1/3 z-20 flex flex-col gap-2 p-3 rounded-s-2xl bg-surface/95 border border-subtle shadow-lg">
      {([['tafsir', BookOpen], ['translation', Languages], ['meanings', Type], ['topics', Layers], ['themes', ListTree]] as const).map(([tool, Icon]) => <button key={tool} type="button" title={t(labels[tool])} aria-label={t(labels[tool])} onClick={() => open(tool, { ...pageStart, wholePage: true }, 'right')} className="p-2 rounded-xl hover:bg-emerald-500/15"><Icon className="size-5" /></button>)}
      <button type="button" title={t('quranCatTheme')} aria-label={t('quranCatTheme')} aria-pressed={showThemes} onClick={() => setShowThemes(value => !value)} className="p-2 rounded-xl hover:bg-emerald-500/15"><Lightbulb className="size-5" /></button>
    </nav>
    {props.canPlay && <div className="quran-edge absolute bottom-3 inset-x-0 z-20 flex justify-center pointer-events-none"><button type="button" title={t('quranAudioPlay')} aria-label={t('quranAudioPlay')} onClick={() => props.onStartAudio(pageStart)} data-quran-play-button className="pointer-events-auto rounded-full bg-emerald-700 p-4 text-white shadow-lg"><Play className="size-6" /></button></div>}
</>}
    {showThemes && page.profile === 'hafs' && positions.map(({ theme, top, height, left }, index) => <aside key={`${theme.surahNumber}:${theme.ayahFrom}:${theme.ayahTo}:${index}`} data-quran-theme-marker data-surah={theme.surahNumber} data-ayah-from={theme.ayahFrom} data-ayah-to={theme.ayahTo} aria-label={`${theme.theme} · ${theme.surahNumber}:${theme.ayahFrom}–${theme.ayahTo}`} style={{ top, height, left, maxWidth: `max(0px, min(7rem, calc(100% - ${left}px - 56px)))` }} className="absolute pointer-events-none border-s-4 border-y-2 border-amber-600 rounded-s-lg ps-2 text-xs text-amber-700 dark:text-amber-300 overflow-hidden whitespace-pre-line" dir="ltr"><span dir="auto">{theme.theme}</span></aside>)}
    {notePositions.map(({ surah, ayah, count, top, left }) => <div key={`${surah}:${ayah}`} data-quran-note-marker data-surah={surah} data-ayah={ayah} className="absolute z-10" style={{ top, left }}>
      <NoteMarker count={count} t={t} onOpen={() => passageNote(`quran:${page.profile}:${surah}:${ayah}`, `${surah}:${ayah}`)} />
    </div>)}
    {(props.panelOpen ?? windows.length > 0) && (() => {
      const panel = windows[0] || { id: 0, tool: 'tafsir' as Tool, reference: { ...pageStart, wholePage: true }, side: 'right' as const };
      const active: ReaderTab = panel.tool === 'tafsir' ? 'commentary' : panel.tool === 'translation' ? 'translation' : 'related';
      return <IslamicReaderPanel active={notesTab ? 'notes' : active} t={t} recitation onClose={() => { setWindows([]); props.onPanelChange?.(false); }} onTab={tab => {
        setNotesTab(tab === 'notes');
        if (tab === 'recitation') { props.onStartAudio(panel.reference); props.onPanelChange?.(false); return; }
        if (tab !== 'notes') open(tab === 'commentary' ? 'tafsir' : tab === 'translation' ? 'translation' : 'explore', panel.reference, 'right');
      }}>
        {notesTab ? <PersonalCommentary key={page.profile + ':' + panel.reference.surah + ':' + panel.reference.ayah} reference={'quran:' + page.profile + ':' + panel.reference.surah + ':' + panel.reference.ayah} /> : <>
        <p dir="ltr" className="text-xs text-muted">{panel.reference.surah}:{panel.reference.ayah}</p>
        {panel.tool === 'topics' && page.profile === 'hafs' && <button type="button" onClick={() => setTopicDrawer({ topics:[], active:null })} className="text-xs underline">{t('quranTopicBrowse')}</button>}
        <div className="flex flex-wrap gap-2 text-xs mb-3">{(['meanings','topics','themes','transliteration','similar','morphology','mutashabihat'] as Tool[]).map(tool => <button key={tool} type="button" aria-label={t(labels[tool])} className="rounded-lg border border-subtle px-2 py-1" onClick={() => open(tool,panel.reference,'right')}>{t(labels[tool])}</button>)}<button type="button" aria-label={t('quranCatTheme')} onClick={() => setShowThemes(value => !value)}>{t('quranCatTheme')}</button></div>
        {(panel.tool === 'explore' ? ['morphology', 'meanings', 'transliteration', 'mutashabihat', 'similar'] as Tool[] : [panel.tool]).map(tool => <section key={tool}><h3 className="font-semibold text-sm">{t(labels[tool])}</h3>{['similar','mutashabihat','topics','themes'].includes(tool) && <p className="text-xs text-muted leading-relaxed">{t('quranConnectionSource',{resource:t(labels[tool])})}</p>}<StudyContent tool={tool} reference={panel.reference} page={page} selection={selection} metadata={metadata} t={t} lang={props.lang} onNavigateAyah={onNavigateAyah} onOpenTopics={openTopics} onOpenSimilar={openSimilar} /></section>)}
        </>}
      </IslamicReaderPanel>;
    })()}
    {menu && <QuranActionMenu portal anchor={{ x: menu.x, y: menu.y }} extra={highlightItems(menu.reference)} onClose={() => setMenu(null)} input={{ reference: menu.reference, script: selection.script, profile: page.profile, language: props.lang, t,
        tafsir: selection.tafsir ? () => open('tafsir',menu.reference,'left') : undefined,
        translation: selection.translation ? () => open('translation',menu.reference,'left') : undefined,
        play: props.canPlay ? () => props.onStartAudio(menu.reference) : undefined,
      }} toolsLabel={t('quranReadingOptions')}
      tools={(['morphology','meanings','transliteration','mutashabihat','similar','topics','themes'] as Tool[]).map(tool => ({id:tool,label:t(labels[tool])}))}
      onTool={tool=>open(tool as Tool,menu.reference,'left')}
      makeDeck={page.profile === 'hafs' ? { label: t('quranMakeDeck'), onClick: () => setDeckFrom(menu.reference) } : undefined} />}
    {deckFrom && <QuranAyahDeckDialog reference={deckFrom} lang={props.lang} t={t} onClose={() => setDeckFrom(null)} />}
    {topicDrawer && <QuranTopicDrawer topics={topicDrawer.topics} activeTopic={topicDrawer.active} onSelectTopic={topic => setTopicDrawer(current => ({ topics: current?.topics.some(item => item.topicId === topic.topicId) ? current.topics : [...(current?.topics || []), topic], active: topic }))} onSelectAyah={navigateFromDrawer} onClose={() => setTopicDrawer(null)} t={t} lang={props.lang} dir={props.dir} onSearch={searchTopics} onLoadTopics={loadTopics} />}
    {similarDrawer && <QuranSimilarAyahsDrawer surah={similarDrawer.reference.surah} ayah={similarDrawer.reference.ayah} similarAyahs={similarDrawer.items} surahs={props.surahs} script={selection.script} t={t} lang={props.lang} dir={props.dir} onClose={() => setSimilarDrawer(null)} onNavigateAyah={navigateFromDrawer} onCopy={props.onCopyText} />}
  </div>;
}
