'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Copy, Download, FolderOpen, Layers, Play, Pause, Search, Settings2, Volume2, X, Maximize2, Minimize2 } from 'lucide-react';
import type { QuranAyahTheme, QuranCommentary, QuranMushafPage, QuranPassage, QuranReaderCatalog, QuranReadQuery, QuranRichNode, QuranSearchHit, QuranSurahIntro, QuranTopic } from '../../../shared/types/quran';
import type { TranslationKey } from '../../translations';
import { useWorkspace } from '../context/WorkspaceContext';
import { QuranMushafView } from './QuranMushafView';
import { QuranAudioPlayer, type QuranAudioState } from './QuranAudioPlayer';
import { QuranSurahIntroCard } from './QuranSurahIntroCard';
import { QuranTopicDrawer } from './QuranTopicDrawer';
import { QuranAyahInspector } from './QuranAyahInspector';
import { QuranTranslationText } from './QuranTranslationText';
import type { QuranAyahDetails } from '../../../shared/types/quran';
import { consumeQuranAyah, QURAN_OPEN_EVENT } from '../../utils/quran-navigation';
import { quranActionError } from '../../utils/quran-errors';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;
const emptyCatalog: QuranReaderCatalog = { sources: [], presets: [] };

function RichText({ nodes }: { nodes: QuranRichNode[] }) {
  return <>{nodes.map((node, index) => node.tag === 'text' ? <React.Fragment key={index}>{node.text}</React.Fragment> : React.createElement(node.tag, { key: index }, node.tag === 'br' ? undefined : <RichText nodes={node.children || []} />))}</>;
}

export function QuranPassageView({
  passage,
  t,
  lang,
  onCommentary,
  onCopy,
  onViewInMushaf,
  commentary,
  selected,
  showWords,
  showMeanings = showWords,
  activeAudio,
  onPlayAyah,
  themes,
  onOpenTopics,
  onInspectAyah,
}: {
  passage: QuranPassage;
  t: Translate;
  lang: 'ar' | 'en';
  onCommentary?: (ayah: number) => void;
  onCopy: (text: string) => void;
  onViewInMushaf?: (ayah: number) => void;
  commentary: QuranCommentary | null;
  selected: number | null;
  showWords: boolean;
  showMeanings?: boolean;
  activeAudio?: { surah: number; ayah: number; isPlaying: boolean; activeWordIndex: number | null } | null;
  onPlayAyah?: (ayah: number) => void;
  themes?: QuranAyahTheme[];
  onOpenTopics?: (ayah: number) => void;
  onInspectAyah?: (ayah: number) => void;
}) {
  const [hoveredWord, setHoveredWord] = useState<{ ayah: number; position: number } | null>(null);
  return <div className="space-y-4">
    {passage.basmala && <p dir="rtl" lang="ar" className="font-reading text-2xl leading-[2.5] text-center py-3">{passage.basmala}</p>}
    {passage.ayahs.map(ayah => {
      const isAyahPlaying = activeAudio?.surah === passage.surah && activeAudio?.ayah === ayah.number && activeAudio?.isPlaying;
      const themeStartingHere = themes?.find(t => t.ayahFrom === ayah.number);
      return <React.Fragment key={ayah.number}>
        {themeStartingHere && (
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/10 text-amber-900 dark:text-amber-200 border border-amber-500/20 text-xs font-medium my-2">
            <span className="font-bold">{t('quranTheme')}:</span>
            <span className="flex-1">{themeStartingHere.theme}</span>
            <span className="text-[11px] opacity-75 shrink-0">
              ({themeStartingHere.ayahFrom}–{themeStartingHere.ayahTo})
            </span>
          </div>
        )}
        <article
          className={`min-w-0 rounded-2xl border bg-surface p-4 sm:p-6 transition-all ${
            isAyahPlaying || hoveredWord?.ayah === ayah.number
              ? 'border-emerald-500/80 bg-emerald-500/5 ring-1 ring-emerald-500/30 shadow-sm'
              : 'border-subtle has-[[data-quran-word]:hover]:bg-emerald-500/5 has-[[data-quran-word]:hover]:shadow-[0_0_18px_rgb(16_185_129_/_0.15)] has-[[data-quran-word]:focus-visible]:bg-emerald-500/5'
          }`}
          aria-label={`${passage.surah}:${ayah.number}`}
        >
          <div dir="rtl" lang="ar" className="font-reading text-[1.65rem] sm:text-3xl text-start leading-[2.5] break-words">
            {ayah.words.map(word => {
              const isWordActive = isAyahPlaying && activeAudio?.activeWordIndex === word.position;
              return <React.Fragment key={word.position}><span data-quran-word onPointerEnter={() => setHoveredWord({ ayah: ayah.number, position: word.position })} onPointerLeave={() => setHoveredWord(null)} onFocus={() => setHoveredWord({ ayah: ayah.number, position: word.position })} onBlur={() => setHoveredWord(null)} role={word.marker ? undefined : 'button'} tabIndex={word.marker ? undefined : 0} aria-label={word.marker ? undefined : `${t('quranAyahInspector')} ${passage.surah}:${ayah.number}`} onClick={() => onInspectAyah?.(ayah.number)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onInspectAyah?.(ayah.number); } }} className={`${hoveredWord?.ayah === ayah.number && hoveredWord.position === word.position ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' : ''} cursor-pointer rounded-md hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10 focus-visible:text-emerald-600 focus-visible:outline-emerald-500 ${showWords && !word.marker ? 'inline-flex flex-col items-center align-top mx-1 max-w-full' : ''} ${isWordActive ? 'text-amber-600 dark:text-amber-400 font-bold bg-amber-500/20 rounded-md px-1 transition-all' : ''}`}>
                <span>{word.text}</span>
                {showWords && !word.marker && <>{showMeanings && <span dir="ltr" lang="en" className="font-sans text-xs leading-relaxed text-muted text-center max-w-40 break-words">{word.meaning || t('quranWordUnavailable')}</span>}{word.transliteration && <span dir="ltr" lang="en" className="font-sans text-xs leading-relaxed text-pale-sky-600 dark:text-pale-sky-300">{word.transliteration}</span>}</>}
              </span>{' '}</React.Fragment>;
            })}
          </div>
          {ayah.translation && <div dir="ltr" lang="en" className="mt-5 border-t border-subtle pt-4 text-base leading-loose text-start">
            <QuranTranslationText translation={ayah.translation} t={t} />
          </div>}
          <div className="flex flex-wrap justify-between items-center gap-3 mt-4 text-sm text-muted">
            <span dir="ltr">{new Intl.NumberFormat(lang).format(passage.surah)}:{new Intl.NumberFormat(lang).format(ayah.number)}</span>
            <div className="flex flex-wrap gap-2">
              {onPlayAyah && <button type="button" onClick={() => onPlayAyah(ayah.number)} title={isAyahPlaying ? t('quranAudioPause') : t('quranAudioPlay')} aria-label={isAyahPlaying ? t('quranAudioPause') : t('quranAudioPlay')} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors ${isAyahPlaying ? 'bg-emerald-600 text-white border-emerald-600' : 'border-subtle hover:bg-pale-sky-500/10'}`}>{isAyahPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}{t(isAyahPlaying ? 'quranAudioPause' : 'quranAudioPlay')}</button>}
              <button type="button" onClick={() => onCopy(ayah.words.map(word => word.text).join(' ') + (ayah.translation ? `\n\n${ayah.translation.text}` : '') + `\n${passage.surah}:${ayah.number}`)} className="rounded-lg border border-subtle p-2" title={t('quranCopyAyah')} aria-label={t('quranCopyAyah')}><Copy className="size-4" /></button>
              {onViewInMushaf && <button type="button" onClick={() => onViewInMushaf(ayah.number)} title={t('quranViewInMushaf')} aria-label={t('quranViewInMushaf')} className="inline-flex items-center gap-1.5 rounded-lg border border-subtle px-3 py-2 text-xs"><BookOpen className="size-4" />{t('quranViewInMushaf')}</button>}
              {onOpenTopics && <button type="button" onClick={() => onOpenTopics(ayah.number)} title={t('quranTopics')} aria-label={t('quranTopics')} className="inline-flex items-center gap-1.5 rounded-lg border border-subtle px-3 py-2 text-xs hover:bg-pale-sky-500/10 transition-colors"><Layers className="size-4 text-emerald-600 dark:text-emerald-400" />{t('quranTopics')}</button>}
              {onCommentary && <button type="button" onClick={() => onCommentary(ayah.number)} aria-expanded={selected === ayah.number} className="inline-flex items-center gap-2 rounded-lg border border-subtle px-3 py-2"><BookOpen className="size-4" />{t('quranCatTafsir')}</button>}
            </div>
          </div>
          {selected === ayah.number && <aside className="mt-4 border-t border-subtle pt-4" aria-label={t('quranCatTafsir')}>
            {commentary ? <><p dir="ltr" className="text-sm text-muted mb-3">{commentary.from} – {commentary.to}</p><div dir="rtl" lang="ar" className="font-reading text-xl leading-[2.2] break-words space-y-3"><RichText nodes={commentary.nodes} /></div></> : <p role="status">{t('quranLoading')}</p>}
          </aside>}
        </article>
      </React.Fragment>;
    })}
  </div>;
}

export function QuranReaderView() {
  const { t, lang, dir } = useWorkspace();
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [selection, setSelection] = useState({ script: '', translation: '', meanings: '', transliteration: '', tafsir: '' });
  const [activeReciterId, setActiveReciterId] = useState('');
  const [readerMode, setReaderMode] = useState<'study' | 'mushaf'>('mushaf');
  const root = useRef<HTMLElement>(null);
  const [immersive, setImmersive] = useState(false);
  const [inspected, setInspected] = useState<{ surah: number; ayah: number } | null>(null);
  const [inspection, setInspection] = useState<{ key: string; details: QuranAyahDetails | null; error: boolean } | null>(null);
  const [surah, setSurah] = useState(1);
  const [from, setFrom] = useState(1);
  const [mushafPageNumber, setMushafPageNumber] = useState(1);
  const [mushafPageData, setMushafPageData] = useState<QuranMushafPage | null>(null);
  const [selectedMushafAyah, setSelectedMushafAyah] = useState<{ surah: number; ayah: number } | null>(null);
  const [mushafLoading, setMushafLoading] = useState(false);
  const [passage, setPassage] = useState<QuranPassage | null>(null);
  const [loadedKey, setLoadedKey] = useState('');
  const [search, setSearch] = useState('');
  const [searchHits, setHits] = useState<QuranSearchHit[]>([]);
  const [hitsKey, setHitsKey] = useState('');
  const [panel, setPanel] = useState<'setup' | 'options' | 'tafsir' | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [commentary, setCommentary] = useState<QuranCommentary | null>(null);
  const [commentaryKey, setCommentaryKey] = useState('');
  const [surahIntro, setSurahIntro] = useState<QuranSurahIntro | null>(null);
  const [showSurahIntro, setShowSurahIntro] = useState(false);
  const [surahThemes, setSurahThemes] = useState<QuranAyahTheme[]>([]);
  const [topicDrawerOpen, setTopicDrawerOpen] = useState(false);
  const [ayahTopicsList, setAyahTopicsList] = useState<QuranTopic[]>([]);
  const [activeTopic, setActiveTopic] = useState<QuranTopic | null>(null);
  const [checked, setChecked] = useState(['quran-script/312', 'translation/193', 'tafsir/22', 'translation/92', 'quran-metadata/70', 'mushaf-layout/569', 'recitation/957', 'recitation/959', 'surah-info/3', 'ayah-theme/62', 'ayah-topics/45']);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [noticeInfo, setNoticeInfo] = useState<{ key: TranslationKey; params?: Record<string, string | number>; details?: string } | null>(null);
  const [error, setError] = useState(false);
  const [operationError, setOperationError] = useState<TranslationKey | null>(null);
  const refresh = useRef(0);
  const catalogIdentity = useRef('');
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [revision, setRevision] = useState(0);
  const api = () => window.electronAPI?.quran;
  const setNotice = (key: TranslationKey | '', params?: Record<string, string | number>, details?: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNoticeInfo(key ? { key, params, details } : null);
    if (key === 'quranCopied') {
      noticeTimer.current = setTimeout(() => setNoticeInfo(null), 3000);
    }
  };
  const notice = noticeInfo ? t(noticeInfo.key, noticeInfo.params) + (noticeInfo.details ? ` ${noticeInfo.details}` : '') : '';

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const generation = ++refresh.current;
      try {
        const result = await api()?.readerCatalog();
        if (!alive || generation !== refresh.current) return;
        if (!result?.ok) { setError(true); return; }
        const identity = JSON.stringify(result.data);
        if (identity === catalogIdentity.current) return;
        catalogIdentity.current = identity;
        setCatalog(result.data);
        setActiveReciterId(previous => result.data.sources.some(source => source.id === previous) ? previous : result.data.sources.find(source => source.kind === 'recitation')?.id || '');
        setRevision(value => value + 1);
        setSelection(previous => {
          const exists = (id: string) => result.data.sources.some(source => source.id === id);
          if (previous.script && exists(previous.script)) return Object.fromEntries(Object.entries(previous).map(([key, id]) => [key, exists(id) ? id : ''])) as typeof previous;
          const script = result.data.sources.find(source => source.kind === 'script' && source.profile === 'hafs') || result.data.sources.find(source => source.kind === 'script');
          const find = (kind: string) => script?.profile === 'hafs' ? result.data.sources.find(source => source.kind === kind)?.id || '' : '';
          return { script: script?.id || '', translation: find('translation'), meanings: '', transliteration: '', tafsir: find('tafsir') };
        });
      } catch { if (alive) setError(true); }
      finally { if (alive) setLoading(false); }
    };
    void load();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = api()?.onChanged(() => { if (timer) return; timer = setTimeout(() => { timer = undefined; void load(); }, 500); });
    return () => { alive = false; clearTimeout(timer); unsubscribe?.(); };
  }, []);

  const queryKey = JSON.stringify([selection.script, selection.translation, selection.meanings, selection.transliteration, surah, from, revision]);
  const searchKey = JSON.stringify([selection.script, search]);
  const hits = hitsKey === searchKey ? searchHits : [];
  const selectedKey = JSON.stringify([selection.script, selection.tafsir, surah, selected]);
  const profile = catalog.sources.find(source => source.id === selection.script)?.profile;
  const mushafSource = catalog.sources.find(source => source.kind === 'mushaf-layout');

  useEffect(() => {
    if (!selection.script) return;
    let alive = true;
    const query: QuranReadQuery = { script: selection.script, surah, from, translation: selection.translation || undefined, meanings: selection.meanings || undefined, transliteration: selection.transliteration || undefined };
    const timer = setTimeout(() => {
      setLoading(true); setError(false); setSelected(null); setCommentary(null);
      void api().read(query).then(result => { if (alive) { if (result.ok) setPassage(result.data); else { setPassage(null); setError(true); } } }).catch(() => { if (alive) { setPassage(null); setError(true); } }).finally(() => { if (alive) { setLoading(false); setLoadedKey(queryKey); } });
    }, 100);
    return () => { alive = false; clearTimeout(timer); };
  }, [selection.script, selection.translation, selection.meanings, selection.transliteration, surah, from, queryKey]);

  useEffect(() => {
    if (!selection.script || !search.trim()) return;
    let alive = true;
    const timer = setTimeout(() => { void api().searchAyahs({ script: selection.script, text: search }).then(result => { if (alive) { if (result.ok) { setHits(result.data); setHitsKey(searchKey); } else setError(true); } }).catch(() => { if (alive) setError(true); }); }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [search, selection.script, searchKey]);

  useEffect(() => {
    if (panel !== 'tafsir' || selected === null || !selection.tafsir) return;
    let alive = true;
    void api().commentary({ script: selection.script, pack: selection.tafsir, surah, ayah: selected }).then(result => { if (alive) { if (result.ok) { setCommentary(result.data); setCommentaryKey(selectedKey); } else { setError(true); setSelected(null); } } }).catch(() => { if (alive) { setError(true); setSelected(null); } });
    return () => { alive = false; };
  }, [panel, selected, selection.tafsir, selection.script, surah, selectedKey]);

  const mushafSourceId = mushafSource?.id;
  const inspectionKey = JSON.stringify([selection.script, mushafSourceId, inspected]);
  useEffect(() => {
    if (!inspected || !selection.script) return;
    let alive = true;
    void window.electronAPI.quran.inspectAyah({ script: selection.script, layout: mushafSourceId, ...inspected }).then(result => {
      if (alive) setInspection({ key: inspectionKey, details: result.ok ? result.data : null, error: !result.ok });
    }).catch(() => { if (alive) setInspection({ key: inspectionKey, details: null, error: true }); });
    return () => { alive = false; };
  }, [inspectionKey, inspected, selection.script, mushafSourceId]);
  useEffect(() => {
    const changed = () => { if (!document.fullscreenElement) setImmersive(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.fullscreenElement && !event.defaultPrevented) setImmersive(false); };
    document.addEventListener('fullscreenchange', changed);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('fullscreenchange', changed); document.removeEventListener('keydown', escape); };
  }, []);
  const leaveImmersive = () => { setImmersive(false); if (document.fullscreenElement === root.current) void document.exitFullscreen().catch(() => {}); };
  const inspect = (reference: { surah: number; ayah: number } | null) => { setPanel(null); setSelected(null); setTopicDrawerOpen(false); setSelectedMushafAyah(reference); setInspected(reference); };
  useEffect(() => {
    if (readerMode !== 'mushaf' || !mushafSourceId || profile === 'warsh') return;
    let alive = true;
    const timer = setTimeout(() => {
      setMushafLoading(true);
      void api().mushafPage({ pack: mushafSourceId, page: mushafPageNumber }).then(result => {
        if (alive) {
          if (result.ok) setMushafPageData(result.data);
          else setError(true);
        }
      }).catch(() => { if (alive) setError(true); }).finally(() => { if (alive) setMushafLoading(false); });
    }, 50);
    return () => { alive = false; clearTimeout(timer); };
  }, [readerMode, mushafSourceId, mushafPageNumber, profile]);

  const perform = async (action: () => Promise<void>) => { setBusy(true); setError(false); setOperationError(null); setNotice(''); try { await action(); } catch (cause) { setOperationError(quranActionError(cause)); } finally { setBusy(false); } };

  const chooseScript = (script: string) => {
    setSurah(1); setFrom(1); setSearch(''); setSelected(null); setPassage(null); setHits([]);
    setSelection({ script, translation: '', meanings: '', transliteration: '', tafsir: catalog.sources.find(source => source.kind === 'tafsir' && source.profile === catalog.sources.find(value => value.id === script)?.profile)?.id || '' });
  };

  const handleViewInMushaf = async (ayahNumber: number) => {
    if (!mushafSource) {
      setPanel('setup');
      return;
    }
    try {
      setMushafLoading(true);
      const result = await api().mushafPageForAyah({ pack: mushafSource.id, surah, ayah: ayahNumber });
      if (result.ok) {
        setMushafPageNumber(result.data.pageNumber);
        setSelectedMushafAyah({ surah, ayah: ayahNumber });
        setReaderMode('mushaf');
      } else {
        setReaderMode('mushaf');
      }
    } catch {
      setReaderMode('mushaf');
    } finally {
      setMushafLoading(false);
    }
  };

  const [audioState, setAudioState] = useState<QuranAudioState | null>(null);
  const [audioPlayerOpen, setAudioPlayerOpen] = useState(false);
  const [audioAyah, setAudioAyah] = useState<{ surah: number; ayah: number }>({ surah: 1, ayah: 1 });

  const reciters = catalog.sources.filter(s => s.kind === 'recitation');

  const handlePlayAyah = (ayahNum: number) => {
    setAudioAyah({ surah, ayah: ayahNum });
    setAudioPlayerOpen(true);
  };

  const handleAudioAyahChange = async (s: number, a: number) => {
    setAudioAyah({ surah: s, ayah: a });
    if (readerMode === 'mushaf' && mushafSource) {
      try {
        const res = await api().mushafPageForAyah({ pack: mushafSource.id, surah: s, ayah: a });
        if (res.ok && res.data.pageNumber !== mushafPageNumber) {
          setMushafPageNumber(res.data.pageNumber);
        }
      } catch {}
    } else if (readerMode === 'study') {
      if (s !== surah) {
        setSurah(s);
        setFrom(a);
      } else if (a < from || a >= from + 20) {
        setFrom(a);
      }
    }
  };

  const hasSurahInfo = catalog.sources.some(s => s.kind === 'surah-info');
  const hasAyahThemes = catalog.sources.some(s => s.kind === 'ayah-theme');
  const hasAyahTopics = catalog.sources.some(s => s.kind === 'ayah-topics');

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
    setSurahIntro(null);
    setSurahThemes([]);
    if (hasSurahInfo) {
      void api().surahIntro({ surah }).then(result => {
        if (alive && result.ok) setSurahIntro(result.data);
      }).catch(() => {});
    }
    if (hasAyahThemes) {
      void api().ayahThemes({ surah }).then(result => {
        if (alive && result.ok) setSurahThemes(result.data);
      }).catch(() => {});
    }
    }, 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [surah, hasSurahInfo, hasAyahThemes]);

  const handleOpenTopics = async (ayahNumber: number) => {
    try {
      const res = await api().ayahTopics({ surah, ayah: ayahNumber });
      if (res.ok) {
        setAyahTopicsList(res.data);
        setActiveTopic(res.data[0] || null);
        setTopicDrawerOpen(true);
      }
    } catch {}
  };

  const handleSearchTopics = async (query: string): Promise<QuranTopic[]> => {
    try {
      const res = await api().searchTopics({ text: query });
      return res.ok ? res.data : [];
    } catch {
      return [];
    }
  };

  const selectors = [['script', 'script', 'quranScriptChoice'], ['translation', 'translation', 'quranTranslationChoice'], ['meanings', 'word-translation', 'quranMeaningsChoice'], ['transliteration', 'word-transliteration', 'quranTransliterationChoice'], ['tafsir', 'tafsir', 'quranTafsirChoice']] as const;
  useEffect(() => {
    const open = () => {
      const target = consumeQuranAyah();
      if (!target) return;
      setSelection(previous => previous.script === target.script ? previous : { script: target.script, translation: '', meanings: '', transliteration: '', tafsir: '' });
      setSurah(target.surah); setFrom(target.ayah); setReaderMode('study'); setSearch('');
      root.current?.scrollTo?.({ top: 0 });
      setInspected(null); setPanel(null); setTopicDrawerOpen(false); setImmersive(false);
      if (document.fullscreenElement === root.current) void document.exitFullscreen().catch(() => {});
    };
    const timer = setTimeout(open, 0);
    window.addEventListener(QURAN_OPEN_EVENT, open);
    return () => { clearTimeout(timer); window.removeEventListener(QURAN_OPEN_EVENT, open); };
  }, []);

  return <section ref={root} dir={dir} data-quran-reader data-immersive={immersive || undefined} className={immersive ? 'fixed inset-0 z-[100] bg-canvas text-main overflow-hidden' : 'relative flex-1 min-h-0 min-w-0 overflow-y-auto p-4 sm:p-6 text-main'} aria-label={t('quranRead')}>
    <header className={`${immersive ? 'hidden' : 'flex'} flex-wrap justify-between items-center gap-3 mb-5`}>
      <div>
        <h1 className="text-2xl font-display font-bold leading-relaxed">{t('navQuran')}</h1>
        <p className="text-sm text-muted leading-relaxed">{t('quranReaderHint')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {readerMode === 'mushaf' && <button type="button" data-quran-fullscreen="enter" aria-label={t('quranEnterFullscreen')} title={t('quranEnterFullscreen')} onClick={() => { setPanel(null); setInspected(null); setAudioPlayerOpen(false); setImmersive(true); void root.current?.requestFullscreen?.().catch(() => {}); }} className="rounded-xl border border-subtle bg-surface p-2"><Maximize2 className="size-4" /></button>}
        {/* Study Reader vs Mushaf View segmented switcher */}
        <div className="flex rounded-xl border border-subtle bg-surface p-1">
          <button
            type="button"
            data-quran-mode="study"
            onClick={() => setReaderMode('study')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              readerMode === 'study' ? 'bg-pale-sky-600 text-white shadow-xs' : 'text-muted hover:text-main'
            }`}
          >
            {t('quranModeStudy')}
          </button>
          <button
            type="button"
            data-quran-mode="mushaf"
            onClick={() => setReaderMode('mushaf')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              readerMode === 'mushaf' ? 'bg-pale-sky-600 text-white shadow-xs' : 'text-muted hover:text-main'
            }`}
          >
            {t('quranModeMushaf')}
          </button>
        </div>

        <button type="button" onClick={() => { setPanel(panel === 'setup' ? null : 'setup'); setSelected(null); }} aria-expanded={panel === 'setup'} className="inline-flex items-center gap-2 rounded-xl border border-subtle bg-surface px-3 py-2 text-sm"><Download className="size-4" />{t('quranChooseResources')}</button>
        {selection.script && <button data-quran-options="true" type="button" onClick={() => { setPanel(panel === 'options' ? null : 'options'); setSelected(null); }} aria-expanded={panel === 'options'} className="inline-flex items-center gap-2 rounded-xl border border-subtle bg-surface px-3 py-2 text-sm"><Settings2 className="size-4" />{t('quranReadingOptions')}</button>}
        {surahIntro && (
          <button
            type="button"
            onClick={() => setShowSurahIntro(prev => !prev)}
            aria-expanded={showSurahIntro}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
              showSurahIntro
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                : 'border-subtle bg-surface text-main'
            }`}
          >
            <BookOpen className="size-4" />
            {t('quranSurahIntro')}
          </button>
        )}
        {reciters.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (!audioPlayerOpen) {
                setAudioAyah({ surah, ayah: from });
              }
              setAudioPlayerOpen(prev => !prev);
            }}
            aria-expanded={audioPlayerOpen}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
              audioPlayerOpen || audioState?.isPlaying
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                : 'border-subtle bg-surface text-main'
            }`}
          >
            <Volume2 className="size-4" />
            {t('quranAudioPlay')}
          </button>
        )}
      </div>
    </header>

    {immersive && <nav aria-label={t('quranReadingOptions')} className="absolute end-2 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2 p-2 rounded-2xl border border-subtle bg-surface/95"><button type="button" data-quran-fullscreen="exit" aria-label={t('quranExitFullscreen')} title={t('quranExitFullscreen')} onClick={leaveImmersive} className="p-2"><Minimize2 className="size-5" /></button><button type="button" aria-label={t('quranModeStudy')} title={t('quranModeStudy')} onClick={() => { leaveImmersive(); setReaderMode('study'); }} className="p-2"><BookOpen className="size-5" /></button><button type="button" aria-label={t('quranChooseResources')} title={t('quranChooseResources')} onClick={() => { setInspected(null); setPanel(panel === 'setup' ? null : 'setup'); }} className="p-2"><Download className="size-5" /></button>{reciters.length > 0 && <button type="button" aria-label={t('quranAudioPlay')} title={t('quranAudioPlay')} onClick={() => { setPanel(null); setInspected(null); setAudioPlayerOpen(previous => !previous); }} className="p-2"><Volume2 className="size-5" /></button>}</nav>}
    {(panel === 'setup' || (!selection.script && !loading)) && <div className={`${immersive ? 'absolute inset-y-0 end-0 z-30 w-[min(28rem,100%)] overflow-auto' : 'rounded-2xl mb-5'} border border-subtle bg-surface p-4 space-y-4`}>
      <button type="button" aria-label={t('quranClosePanel')} onClick={() => setPanel(null)} className="p-2 border border-subtle rounded-lg"><X className="size-4" /></button>
      <p className="text-sm leading-relaxed text-muted">{t('quranSetupPickerHint')}</p>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setChecked(catalog.presets.map(preset => preset.id))} className="border border-subtle rounded-xl px-3 py-2 text-sm">{t('quranSelectAll')}</button><button type="button" onClick={() => setChecked([])} className="border border-subtle rounded-xl px-3 py-2 text-sm">{t('quranClearSelection')}</button><button type="button" disabled={busy || !checked.length} onClick={() => void perform(async () => { const result = await api().downloadBatch(checked); if (!result.ok) throw new Error(result.error); setNotice('quranBatchStarted', { count: result.data.length }); })} className="rounded-xl bg-emerald-700 text-white px-4 py-2 text-sm disabled:opacity-40">{t('quranDownloadSelected', { count: checked.length })}</button><button type="button" onClick={() => void perform(async () => { const result = await api().signIn(); if (!result.ok) throw new Error(result.error); })} className="border border-subtle rounded-xl px-3 py-2 text-sm">{t('quranSignIn')}</button></div>
      <div className="grid gap-3 sm:grid-cols-2">{catalog.presets.map(preset => <div key={preset.id} className="flex flex-wrap items-center gap-2 border border-subtle rounded-xl p-3"><label className="flex gap-2 items-center flex-1 min-w-0"><input type="checkbox" checked={checked.includes(preset.id)} onChange={event => setChecked(previous => event.target.checked ? [...previous, preset.id] : previous.filter(id => id !== preset.id))} /><span dir="auto" className="text-sm break-words">{preset.title}</span></label>{preset.installed ? <span className="text-xs text-muted">{t('quranInstalled')}</span> : <button type="button" disabled={busy} title={t('quranDownload')} aria-label={`${t('quranDownload')} ${preset.title}`} onClick={() => void perform(async () => { const result = await api().download(preset.id); if (!result.ok) throw new Error(result.error); setNotice('quranQulDownloadHint'); })} className="border border-subtle rounded-lg p-2 disabled:opacity-50"><Download className="size-4" /></button>}{preset.id === 'translation/193' && <p className="w-full text-xs text-muted leading-relaxed">{t('quranInlineFormatHint')}</p>}</div>)}</div>
      <button type="button" disabled={busy || !checked.length} onClick={() => void perform(async () => { const result = await api().setup(checked); if (!result.ok) throw new Error(result.error); if (result.data) { const absent = [...result.data.missing, ...result.data.failed].map(id => catalog.presets.find(preset => preset.id === id)?.title || id).join(' · '); setNotice('quranSetupResults', { installed: result.data.installed.length, missing: result.data.missing.length, failed: result.data.failed.length }, absent); } })} className="inline-flex items-center gap-2 bg-pale-sky-600 text-white rounded-xl px-4 py-2 disabled:opacity-50"><FolderOpen className="size-4" />{t('quranImportSelected')}</button>
      {busy && <p role="status" className="text-sm">{t('quranInstalling')}</p>}
    </div>}

    {notice && <p role="status" className={immersive ? 'sr-only' : 'rounded-xl bg-pale-sky-500/10 p-3 mb-4 text-sm leading-relaxed'}>{notice}</p>}
    {error && <p role="alert" className={immersive ? 'absolute top-2 start-20 end-20 z-20 bg-surface p-3 text-sm' : 'rounded-xl bg-red-500/10 p-3 mb-4 text-sm'}>{t('quranReaderError')}</p>}
    {operationError && <p role="alert" className={immersive ? 'absolute top-2 start-20 end-20 z-40 bg-surface p-3 text-sm' : 'rounded-xl bg-red-500/10 p-3 mb-4 text-sm'}>{t(operationError)}</p>}

    {/* Mushaf Mode View */}
    {readerMode === 'mushaf' ? (
      profile === 'warsh' ? (
        <div className="rounded-2xl border border-subtle bg-surface p-6 space-y-4">
          <p className="text-sm leading-relaxed text-muted">{t('quranMushafWarshUnavailable')}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const hafs = catalog.sources.find(s => s.kind === 'script' && s.profile === 'hafs');
                if (hafs) chooseScript(hafs.id);
              }}
              className="rounded-xl bg-pale-sky-600 text-white px-4 py-2 text-sm"
            >
              {t('quranScriptChoice')} (Hafs)
            </button>
            <button
              type="button"
              onClick={() => setReaderMode('study')}
              className="rounded-xl border border-subtle px-4 py-2 text-sm"
            >
              {t('quranModeStudy')}
            </button>
          </div>
        </div>
      ) : !mushafSource ? (
        <div className="rounded-2xl border border-subtle bg-surface p-6 space-y-4">
          <p className="text-sm leading-relaxed text-muted">{t('quranMushafLayoutRequired')}</p>
          <button
            type="button"
            onClick={() => setPanel('setup')}
            className="inline-flex items-center gap-2 bg-pale-sky-600 text-white rounded-xl px-4 py-2 text-sm"
          >
            <Download className="size-4" />
            {t('quranChooseResources')}
          </button>
        </div>
      ) : mushafLoading || !mushafPageData ? (
        <p role="status">{t('quranLoading')}</p>
      ) : (
        <QuranMushafView
          page={mushafPageData}
          surahs={passage?.surahs || [{ number: 1, count: 7 }]}
          t={t}
          lang={lang}
          dir={dir}
          selectedAyah={selectedMushafAyah}
          onSelectAyah={inspect}
          onNavigatePage={page => {
            setMushafPageNumber(page);
            setSelectedMushafAyah(null);
            setInspected(null);
          }}
          onOpenInStudyReader={(s, a) => {
            setSurah(s);
            setFrom(a);
            setReaderMode('study');
          }}
          onCopyText={text => {
            void api().copyText(text).then(result => {
              if (result.ok) setNotice('quranCopied');
              else setError(true);
            }).catch(() => setError(true));
          }}
          activeAudio={audioState}
          onPlayAyah={handlePlayAyah}
          loading={mushafLoading}
          immersive={immersive}
        />
      )
    ) : (
      /* Study Reader Mode View */
      selection.script && <>
        {panel === 'options' && <div className="rounded-2xl border border-subtle bg-surface p-4 mb-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 mb-4">{selectors.map(([key, kind, label]) => <label key={key} className="flex flex-col gap-1 text-sm min-w-0">{t(label)}<select value={selection[key]} disabled={key !== 'script' && profile !== 'hafs'} onChange={event => key === 'script' ? chooseScript(event.target.value) : setSelection(previous => ({ ...previous, [key]: event.target.value }))} className="border border-subtle rounded-xl bg-surface px-3 py-2 w-full min-w-0 disabled:opacity-50">{key !== 'script' && <option value="">{t('quranOff')}</option>}{catalog.sources.filter(source => source.kind === kind && (key === 'script' || source.profile === profile)).map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>)}</div><p className="text-xs text-muted leading-relaxed">{t(profile === 'warsh' ? 'quranWarshNotice' : 'quranAlignmentNotice')}</p></div>}
        {profile === 'warsh' && panel !== 'options' && <p className="text-xs text-muted leading-relaxed mb-4">{t('quranWarshNotice')}</p>}
        <div className="flex flex-wrap items-end gap-3 mb-5"><label className="flex flex-col gap-1 text-sm flex-1 min-w-0">{t('quranSurah')}<select value={surah} onChange={event => { setSurah(Number(event.target.value)); setFrom(1); }} className="rounded-xl border border-subtle bg-surface px-3 py-2 w-full min-w-0">{(passage?.surahs || [{ number: 1, count: 7 }]).map(item => <option key={item.number} value={item.number}>{new Intl.NumberFormat(lang).format(item.number)} · {(lang === 'ar' ? item.arabic : item.name) || t('quranSurahNumber', { number: new Intl.NumberFormat(lang).format(item.number) })}</option>)}</select></label><label className="flex flex-col gap-1 text-sm">{t('quranFromAyah')}<input type="number" min={1} max={passage?.surahs.find(value => value.number === surah)?.count || 300} value={from} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 300) setFrom(value); }} className="w-24 rounded-xl border border-subtle bg-surface px-3 py-2" /></label><label className="flex flex-col gap-1 text-sm w-full sm:flex-1">{t('quranVerseSearch')}<span className="flex gap-2 items-center border border-subtle rounded-xl bg-surface px-3 py-2"><Search className="size-4 shrink-0" /><input maxLength={200} value={search} onChange={event => setSearch(event.target.value)} placeholder={t('quranVerseSearchHint')} className="min-w-0 w-full outline-none bg-transparent" /></span></label></div>
        {search.trim() && <div className="rounded-2xl border border-subtle bg-surface mb-5 p-3 space-y-2"><p className="text-sm text-muted">{t('quranSearchCount', { count: hits.length })}</p>{hits.map(hit => <button key={`${hit.surah}:${hit.ayah}`} type="button" onClick={() => { setSurah(hit.surah); setFrom(hit.ayah); setSearch(''); }} className="block w-full text-start rounded-xl p-3 hover:bg-pale-sky-500/10"><span dir="ltr" className="text-sm text-muted">{hit.surah}:{hit.ayah}</span><span dir="rtl" lang="ar" className="block font-reading text-xl leading-loose">{hit.text}</span></button>)}</div>}
        {loading || loadedKey !== queryKey ? <p role="status">{t('quranLoading')}</p> : passage && <>
          {showSurahIntro && surahIntro && (
            <QuranSurahIntroCard intro={surahIntro} t={t} onClose={() => setShowSurahIntro(false)} />
          )}
          <QuranPassageView
            passage={passage}
            t={t}
            lang={lang}
            selected={panel === 'tafsir' ? selected : null}
            commentary={commentaryKey === selectedKey ? commentary : null}
            showWords={Boolean(selection.meanings || selection.transliteration)}
            showMeanings={Boolean(selection.meanings)}
            onInspectAyah={ayah => inspect({ surah, ayah })}
            onViewInMushaf={mushafSource && profile === 'hafs' ? handleViewInMushaf : undefined}
            onCommentary={selection.tafsir && profile === 'hafs' ? ayah => { setCommentary(null); setPanel('tafsir'); setSelected(selected === ayah ? null : ayah); } : undefined}
            onCopy={text => { void api().copyText(text).then(result => { if (result.ok) setNotice('quranCopied'); else setError(true); }).catch(() => setError(true)); }}
            activeAudio={audioState}
            onPlayAyah={handlePlayAyah}
            themes={surahThemes}
            onOpenTopics={hasAyahTopics ? handleOpenTopics : undefined}
          />
          {!passage.ayahs.length && <p className="text-muted">{t('quranNoAyahs')}</p>}
          <div className="flex flex-wrap justify-between gap-3 mt-5"><button type="button" disabled={from <= 1} onClick={() => setFrom(Math.max(1, from - 20))} className="inline-flex items-center gap-2 rounded-xl border border-subtle px-4 py-2 disabled:opacity-40"><ChevronLeft className="size-4 rtl:rotate-180" />{t('quranPrevious')}</button><button type="button" disabled={!passage.next} onClick={() => { if (passage.next) setFrom(passage.next); }} className="inline-flex items-center gap-2 rounded-xl border border-subtle px-4 py-2 disabled:opacity-40">{t('quranNext')}<ChevronRight className="size-4 rtl:rotate-180" /></button></div>
        </>}
      </>
    )}

    {!selection.script && loading && <p role="status">{t('quranLoading')}</p>}
    {panel && !immersive && <button type="button" onClick={() => { setPanel(null); setSelected(null); }} className="inline-flex items-center gap-2 text-sm text-muted mt-5"><X className="size-4" />{t('quranClosePanel')}</button>}
    {inspected && <QuranAyahInspector reference={inspected} details={inspection?.key === inspectionKey ? inspection.details : null} error={inspection?.key === inspectionKey && inspection.error} surahName={((lang === 'ar' ? passage?.surahs.find(item => item.number === inspected.surah)?.arabic : passage?.surahs.find(item => item.number === inspected.surah)?.name) || t('quranSurahNumber', { number: inspected.surah }))} t={t} dir={dir} onClose={() => setInspected(null)} onCopy={text => { void api().copyText(text).then(result => { if (result.ok) setNotice('quranCopied'); else setError(true); }).catch(() => setError(true)); }} onStudy={() => { leaveImmersive(); setSurah(inspected.surah); setFrom(inspected.ayah); setReaderMode('study'); setInspected(null); }} />}

    {/* Quran Recorded Audio Player */}
    {audioPlayerOpen && (
      <div className={immersive ? 'absolute inset-y-0 end-0 z-30 w-[min(28rem,100%)] bg-surface overflow-y-auto [&>div]:!relative [&>div]:!inset-auto [&>div]:!m-0 [&>div]:!max-w-none' : ''}><QuranAudioPlayer
        surah={audioAyah.surah}
        ayah={audioAyah.ayah}
        surahCount={passage?.surahs.find(s => s.number === audioAyah.surah)?.count || 300}
        reciters={reciters}
        activeReciterId={activeReciterId}
        onSelectReciter={setActiveReciterId}
        t={t}
        lang={lang}
        dir={dir}
        onAyahChange={handleAudioAyahChange}
        onAudioStateChange={setAudioState}
        onClose={() => setAudioPlayerOpen(false)}
      /></div>
    )}

    {/* Quran Topic & Concepts Drawer */}
    {topicDrawerOpen && (
      <QuranTopicDrawer
        topics={ayahTopicsList}
        activeTopic={activeTopic}
        onSelectTopic={topic => setActiveTopic(topic)}
        onSelectAyah={(s, a) => {
          setSurah(s);
          setFrom(a);
          setTopicDrawerOpen(false);
        }}
        onClose={() => setTopicDrawerOpen(false)}
        t={t}
        lang={lang}
        dir={dir}
        onSearch={handleSearchTopics}
      />
    )}
  </section>;
}
