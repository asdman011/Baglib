'use client';

import { IslamicReaderHeader } from '../islamic/IslamicReaderChrome';
import { readerProfileSelection } from '../islamic/reader-chrome';
import { saveContinueReading, continueReading, CONTINUE_KEY } from '../islamic/continue-reading';
import { ContextMenu } from '../ui/ContextMenu';
import { quranActions } from '../actions/quran-actions';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Copy, CopyCheck, Layers, Play, Pause, X, Maximize2, Minimize2 } from 'lucide-react';
import type { QuranAyahTheme, QuranCommentary, QuranMushafPage, QuranPassage, QuranReaderCatalog, QuranStructure, QuranSurahIntro } from '../../../shared/types/quran';
import type { TranslationKey } from '../../translations';
import { useWorkspace } from '../context/WorkspaceContext';
import { QuranMushafWorkspace } from './QuranMushafWorkspace';
import { QuranAudioPlayer, type QuranAudioState } from './QuranAudioPlayer';
import { QuranSurahIntroCard } from './QuranSurahIntroCard';
import { QuranAyahInspector } from './QuranAyahInspector';
import { PersonalCommentary } from '../knowledge/PersonalCommentary';
import { QuranTranslationText } from './QuranTranslationText';
import { QuranRichText } from './QuranRichText';
import { QuranStructureNav } from './QuranStructureNav';
import { quranLocalizedSource } from '../../../shared/quran-structure';
import type { QuranAyahDetails } from '../../../shared/types/quran';
import { consumeQuranAyah, QURAN_OPEN_EVENT, type QuranTarget } from '../../utils/quran-navigation';
import { QuranKhatmahDock } from './QuranKhatmah';
import { quranActionError } from '../../utils/quran-errors';
import { quranPageKeyDelta, quranReadingKeyTarget } from './quran-page-keys';
import { useCompanionContext } from '../../utils/companion-context';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;
const emptyCatalog: QuranReaderCatalog = { sources: [], presets: [] };
const emptySelection = { script: '', translation: '', meanings: '', transliteration: '', ayahTransliteration: '', tafsir: '' };

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
  onOpenSimilar,
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
  onOpenSimilar?: (ayah: number) => void;
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
        <ContextMenu as="article" items={quranActions({ reference: { surah: passage.surah, ayah: ayah.number }, script: '', profile: passage.profile, language: lang, text: ayah.words.filter(word => !word.marker).map(word => word.text).join(' '), t,
          tafsir: onCommentary ? () => onCommentary(ayah.number) : undefined,
          translation: ayah.translation ? () => document.querySelector<HTMLElement>('[data-quran-translation="'+ayah.number+'"]')?.scrollIntoView({block:'nearest'}) : undefined,
          play: onPlayAyah ? () => onPlayAyah(ayah.number) : undefined,
        })}
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
          {ayah.translation && <div data-quran-translation={ayah.number} dir="ltr" lang="en" className="mt-5 border-t border-subtle pt-4 text-base leading-loose text-start">
            <QuranTranslationText translation={ayah.translation} t={t} />
          </div>}
          <div className="flex flex-wrap justify-between items-center gap-3 mt-4 text-sm text-muted">
            <span dir="ltr">{new Intl.NumberFormat(lang).format(passage.surah)}:{new Intl.NumberFormat(lang).format(ayah.number)}</span>
            <div className="flex flex-wrap gap-2">
              {onPlayAyah && <button type="button" onClick={() => onPlayAyah(ayah.number)} title={isAyahPlaying ? t('quranAudioPause') : t('quranAudioPlay')} aria-label={isAyahPlaying ? t('quranAudioPause') : t('quranAudioPlay')} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors ${isAyahPlaying ? 'bg-emerald-600 text-white border-emerald-600' : 'border-subtle hover:bg-pale-sky-500/10'}`}>{isAyahPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}{t(isAyahPlaying ? 'quranAudioPause' : 'quranAudioPlay')}</button>}
              <button type="button" onClick={() => onCopy(ayah.words.map(word => word.text).join(' ') + (ayah.translation ? `\n\n${ayah.translation.text}` : '') + `\n${passage.surah}:${ayah.number}`)} className="rounded-lg border border-subtle p-2" title={t('quranCopyAyah')} aria-label={t('quranCopyAyah')}><Copy className="size-4" /></button>
              {onViewInMushaf && <button type="button" onClick={() => onViewInMushaf(ayah.number)} title={t('quranViewInMushaf')} aria-label={t('quranViewInMushaf')} className="inline-flex items-center gap-1.5 rounded-lg border border-subtle px-3 py-2 text-xs"><BookOpen className="size-4" />{t('quranViewInMushaf')}</button>}
              {onOpenTopics && <button type="button" onClick={() => onOpenTopics(ayah.number)} title={t('quranTopics')} aria-label={t('quranTopics')} className="inline-flex items-center gap-1.5 rounded-lg border border-subtle px-3 py-2 text-xs hover:bg-pale-sky-500/10 transition-colors"><Layers className="size-4 text-emerald-600 dark:text-emerald-400" />{t('quranTopics')}</button>}
              {onOpenSimilar && <button type="button" onClick={() => onOpenSimilar(ayah.number)} title={t('quranSimilarAyahs')} aria-label={t('quranSimilarAyahs')} className="inline-flex items-center gap-1.5 rounded-lg border border-subtle px-3 py-2 text-xs hover:bg-pale-sky-500/10 transition-colors"><CopyCheck className="size-4 text-emerald-600 dark:text-emerald-400" />{t('quranSimilarAyahs')}</button>}
              {onCommentary && <button type="button" onClick={() => onCommentary(ayah.number)} aria-expanded={selected === ayah.number} className="inline-flex items-center gap-2 rounded-lg border border-subtle px-3 py-2"><BookOpen className="size-4" />{t('quranCatTafsir')}</button>}
            </div>
          </div>
          {selected === ayah.number && <aside className="mt-4 border-t border-subtle pt-4" aria-label={t('quranCatTafsir')}>
            {commentary ? <><p dir="ltr" className="text-sm text-muted mb-3">{commentary.from} – {commentary.to}</p><div dir="rtl" lang="ar" className="font-reading text-xl leading-[2.2] break-words space-y-3"><QuranRichText nodes={commentary.nodes} /></div></> : <p role="status">{t('quranLoading')}</p>}
          </aside>}
        </ContextMenu>
      </React.Fragment>;
    })}
  </div>;
}

export function QuranReaderView({ visible = true, navigation }: { visible?: boolean; navigation?: React.ReactNode }) {
  const { t, lang, dir } = useWorkspace();
  const root = useRef<HTMLElement>(null);
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [selection, setSelection] = useState(emptySelection);
  const [structure, setStructure] = useState<QuranStructure | null>(null);
  const [layoutId, setLayoutId] = useState('');
  const [pageNumber, setPageNumber] = useState(1);
  const [page, setPage] = useState<QuranMushafPage | null>(null);
  const [surahs, setSurahs] = useState<QuranPassage['surahs']>([]);
  const [immersive, setImmersive] = useState(false);
  const options = false;
  const [panelOpen, setPanelOpen] = useState(false);
  const [controlsHost, setControlsHost] = useState<HTMLDivElement | null>(null);
  const [setup, setSetup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [notice, setNotice] = useState<TranslationKey | null>(null);
  const [activeReciterId, setActiveReciterId] = useState('');
  const [audioAyah, setAudioAyah] = useState({ surah: 1, ayah: 1 });
  const [audioOpen, setAudioOpen] = useState(false);
  const [audioState, setAudioState] = useState<QuranAudioState | null>(null);
  const [inspected, setInspected] = useState<{ surah: number; ayah: number } | null>(null);
  const [details, setDetails] = useState<QuranAyahDetails | null>(null);
  const [inspectionError, setInspectionError] = useState(false);
  const [studyTarget, setStudyTarget] = useState<{ surah: number; ayah: number } | null>(null);
  const [pendingTarget, setPendingTarget] = useState<QuranTarget | null>(null);
  const [targetKhatmah, setTargetKhatmah] = useState<string | undefined>();
  const [intro, setIntro] = useState<QuranSurahIntro | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const api = () => (typeof window !== "undefined" ? window.electronAPI?.quran : undefined);
  const identity = useRef('');
  const customized = useRef(new Set<string>());
  const profile = catalog.sources.find(source => source.id === selection.script)?.profile;
  // The companion note pane links to the selected ayah.
  useCompanionContext('quran', () => {
    if (!inspected || !profile) return null;
    const name = (lang === 'ar' ? surahs.find(surah => surah.number === inspected.surah)?.arabic : surahs.find(surah => surah.number === inspected.surah)?.name) || '';
    return { kind: 'quran', target: `quran:${profile}:${inspected.surah}:${inspected.ayah}`, label: `${name} ${inspected.surah}:${inspected.ayah}`.trim() };
  }, [inspected?.surah, inspected?.ayah, profile, lang, surahs]);
  const layouts = catalog.sources.filter(source => source.kind === 'mushaf-layout' || (source.kind === 'glyph-layout' && source.profile === profile && profile === 'hafs'));
  const layout = layouts.find(source => source.id === layoutId) || layouts.find(source => source.kind === 'mushaf-layout') || layouts[0];
  const svgLayoutId = catalog.sources.find(source => source.kind === 'mushaf-layout' && source.profile === profile)?.id;
  const reciters = catalog.sources.filter(source => source.kind === 'recitation' && source.profile === profile);
  const missing = catalog.presets.filter(preset => !preset.installed && !preset.importOnly);
  const surahInfo = quranLocalizedSource(catalog.sources, 'surah-info', lang);
  const topicSource = quranLocalizedSource(catalog.sources, 'ayah-topics', lang);
  const themeSource = quranLocalizedSource(catalog.sources, 'ayah-theme', lang);
  const metadata = useMemo(() => ({ topics: topicSource?.id, themes: themeSource?.id, derived: topicSource?.language === 'ar' || themeSource?.language === 'ar' }), [topicSource, themeSource]);
  const queryKey = JSON.stringify([layout?.id, pageNumber, selection.script]);
  const [loadedKey, setLoadedKey] = useState('');
  const selectors = [['script', 'script', 'quranScriptChoice'], ['translation', 'translation', 'quranTranslationChoice'], ['meanings', 'word-translation', 'quranMeaningsChoice'], ['transliteration', 'word-transliteration', 'quranTransliterationChoice'], ['ayahTransliteration', 'ayah-transliteration', 'quranAyahTransliterationChoice'], ['tafsir', 'tafsir', 'quranTafsirChoice']] as const;

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const client = api();
      if (!client) {
        if (alive) setError('quranDesktopRequired');
        return;
      }
      try {
        const result = await client.readerCatalog();
        if (!alive) return;
        if (!result.ok) throw new Error(result.error);
        const next = JSON.stringify(result.data);
        if (identity.current === next) return;
        identity.current = next;
        setCatalog(result.data);
        setSelection(previous => {
          const sources = result.data.sources;
          if (sources.some(source => source.id === previous.script)) {
            const profile = sources.find(source => source.id === previous.script)?.profile;
            const next = { ...previous };
            for (const [field, kind] of [['translation', 'translation'], ['tafsir', 'tafsir'], ['meanings', 'word-translation'], ['transliteration', 'word-transliteration'], ['ayahTransliteration', 'ayah-transliteration']] as const) {
              if (!customized.current.has(field) && !next[field]) next[field] = sources.find(source => source.kind === kind && source.profile === profile)?.id || '';
              if (next[field] && !sources.some(source => source.id === next[field])) next[field] = '';
            }
            return next;
          }
          const script = sources.find(source => source.kind === 'script' && source.profile === 'hafs') || sources.find(source => source.kind === 'script');
          const find = (kind: string) => sources.find(source => source.kind === kind && source.profile === script?.profile)?.id || '';
          return { script: script?.id || '', translation: find('translation'), tafsir: find('tafsir'), meanings: find('word-translation'), transliteration: find('word-transliteration'), ayahTransliteration: find('ayah-transliteration') };
        });
        setActiveReciterId(previous => result.data.sources.some(source => source.id === previous) ? previous : result.data.sources.find(source => source.kind === 'recitation')?.id || '');
      } catch (cause) { if (alive) setError(quranActionError(cause)); }
    };
    void refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const client = api();
    const unsubscribe = client?.onChanged(() => { if (!timer) timer = setTimeout(() => { timer = undefined; void refresh(); }, 300); });
    return () => { alive = false; clearTimeout(timer); unsubscribe?.(); };
  }, []);

  useEffect(() => {
    if (!layout) return;
    let alive = true;
    const timer = setTimeout(() => {
    setLoading(true);
    setError(null);
    void api()?.mushafPage({ pack: layout.id, page: pageNumber, script: selection.script }).then(result => {
      if (!alive) return;
      if (!result.ok) throw new Error(result.error);
      setPage(result.data);
      setLoadedKey(queryKey);
    }).catch(cause => { if (alive) setError(quranActionError(cause)); }).finally(() => { if (alive) setLoading(false); });
    }, 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [layout, pageNumber, queryKey, selection.script]);

  useEffect(() => {
    if (!selection.script) return;
    let alive = true;
    const client = api();
    if (!client) return;
    void client.read({ script: selection.script, surah: 1, from: 1 }).then(result => { if (alive && result.ok) setSurahs(result.data.surahs); }).catch(() => {});
    return () => { alive = false; };
  }, [selection.script]);

  useEffect(() => {
    if (profile !== 'hafs') return;
    let alive = true;
    void api()?.structure().then(result => { if (alive && result.ok) setStructure(result.data); }).catch(() => {});
    return () => { alive = false; };
  }, [profile, catalog]);

  useEffect(() => {
    if (!inspected) return;
    let alive = true;
    const client = api();
    if (!client) return;
    const timer = setTimeout(() => {
    setDetails(null); setInspectionError(false);
    void client.inspectAyah({ script: selection.script, layout: svgLayoutId, ...inspected }).then(result => {
      if (!alive) return;
      if (result.ok) setDetails(result.data); else setInspectionError(true);
    }).catch(() => { if (alive) setInspectionError(true); });
    }, 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [inspected, selection.script, svgLayoutId]);

  const leaveFullscreen = () => {
    setImmersive(false);
    if (document.fullscreenElement === root.current) void document.exitFullscreen().catch(() => {});
  };
  useEffect(() => {
    const changed = () => { if (!document.fullscreenElement) setImmersive(false); };
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  const jump = useCallback(async (surah: number, ayah: number) => {
    if (!layout) return;
    const client = api();
    if (!client) return;
    try {
      const result = await client.mushafPageForAyah({ pack: layout.id, surah, ayah, script: selection.script });
      if (!result.ok) throw new Error(result.error);
      setPageNumber(result.data.pageNumber);
    } catch (cause) { setError(quranActionError(cause)); }
  }, [layout, selection.script]);
  const jumpReference = useCallback((reference: { surah: number; ayah: number }) => { setAudioOpen(false); setAudioState(null); void jump(reference.surah, reference.ayah); }, [jump]);
  const navigatePage = useCallback((number: number) => {
    setPageNumber(number); setInspected(null); setAudioOpen(false); setAudioState(null);
  }, []);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (!visible || !page || loading || loadedKey !== queryKey || options || setup || inspected || showIntro || document.querySelector('dialog[open],[aria-modal="true"]') || !quranReadingKeyTarget(event.target)) return;
      const delta = quranPageKeyDelta(event, dir);
      if (!delta) return;
      event.preventDefault();
      const target = Math.max(1, Math.min(page.totalPages, pageNumber + delta));
      if (target !== pageNumber) navigatePage(target);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [visible, page, loading, loadedKey, queryKey, options, setup, inspected, showIntro, dir, pageNumber, navigatePage]);
  const clearStudyTarget = useCallback(() => setStudyTarget(null), []);
  useEffect(() => {
    const open = () => {
      const target = consumeQuranAyah();
      if (!target) return;
      setSelection(previous => previous.script === target.script ? previous : { ...emptySelection, script: target.script });
      setPendingTarget(target);
      if ('page' in target) { setLayoutId(target.layout); setTargetKhatmah(target.khatmah); }
      setAudioOpen(false); setAudioState(null);
    };
    const timer = setTimeout(open, 0);
    window.addEventListener(QURAN_OPEN_EVENT, open);
    return () => { clearTimeout(timer); window.removeEventListener(QURAN_OPEN_EVENT, open); };
  }, []);
  useEffect(() => {
    if (!pendingTarget || !layout || selection.script !== pendingTarget.script) return;
    if ('page' in pendingTarget) {
      if (layout.id !== pendingTarget.layout) return;
      const timer = setTimeout(() => { setPageNumber(pendingTarget.page); setStudyTarget(null); setPendingTarget(null); }, 0);
      return () => clearTimeout(timer);
    }
    let alive = true;
    const client = api();
    if (!client) return;
    void client.mushafPageForAyah({ pack: layout.id, surah: pendingTarget.surah, ayah: pendingTarget.ayah, script: selection.script }).then(result => {
      if (!alive) return;
      if (result.ok) {
        setPageNumber(result.data.pageNumber);
        setStudyTarget({ surah: pendingTarget.surah, ayah: pendingTarget.ayah });
        setPendingTarget(null);
      } else setError('quranReaderError');
    }).catch(() => { if (alive) setError('quranReaderError'); });
    return () => { alive = false; };
  }, [pendingTarget, layout, selection.script]);
  const restoredPosition = useRef(false);
  useEffect(() => {
    if (!catalog.sources.length || restoredPosition.current) return;
    restoredPosition.current = true;
    if (pendingTarget) return;
    let alive = true;
    void window.electronAPI.settings.get(CONTINUE_KEY + '.quran').then(value => {
      const saved = continueReading(value, 'quran');
      if (!alive || !saved) return;
      const [, savedProfile, surah, ayah] = saved.target.split(':');
      const script = catalog.sources.find(source => source.kind === 'script' && source.profile === savedProfile)?.id;
      if (script) { setSelection(readerProfileSelection(catalog.sources, script)); setPendingTarget({ script, surah: +surah, ayah: +ayah }); }
    }).catch(() => setError('quranStorageError'));
    return () => { alive = false; };
  }, [catalog, pendingTarget]);
  useEffect(() => {
    if (!page || page.profile !== profile || loadedKey !== queryKey || pendingTarget || !visible) return;
    const location = inspected || { surah: page.surahStart, ayah: page.ayahStart };
    void saveContinueReading('quran', { target: 'quran:' + profile + ':' + location.surah + ':' + location.ayah, label: ((lang === 'ar' ? surahs.find(surah => surah.number === location.surah)?.arabic : surahs.find(surah => surah.number === location.surah)?.name) || String(location.surah)) + ' ' + location.surah + ':' + location.ayah }).catch(() => setError('quranStorageError'));
  }, [page, profile, loadedKey, queryKey, pendingTarget, visible, inspected, lang, surahs]);
  const pageSurah = page?.surahStart;
  useEffect(() => {
    if (!pageSurah || !showIntro) return;
    let alive = true;
    const client = api();
    if (!client) return;
    void client.surahIntro({ surah: pageSurah, pack: surahInfo?.id }).then(result => { if (alive) setIntro(result.ok ? result.data : null); }).catch(() => { if (alive) setIntro(null); });
    return () => { alive = false; };
  }, [pageSurah, showIntro, surahInfo?.id]);

  const copy = (text: string) => {
    const client = api();
    if (!client) return;
    void client.copyText(text).then(result => { if (result.ok) setNotice('quranCopied'); else setError('quranReaderError'); }).catch(() => setError('quranReaderError'));
  };
  const changeScript = (script: string) => {
    setAudioOpen(false); setAudioState(null); setInspected(null); setPage(null); setPageNumber(1); setLayoutId('');
    setStudyTarget(null); setPendingTarget(null); setDetails(null); setIntro(null); setPanelOpen(false); setActiveReciterId(catalog.sources.find(source => source.kind === 'recitation' && source.profile === catalog.sources.find(source => source.id === script)?.profile)?.id || '');
    setSelection(readerProfileSelection(catalog.sources, script));
  };
  const startAudio = (reference: { surah: number; ayah: number }) => { setAudioAyah(reference); setAudioOpen(true); };
  return <section ref={root} dir={dir} data-quran-reader data-quran-profile={profile} data-immersive={immersive || undefined} className={immersive ? 'fixed inset-0 z-[100] flex flex-col bg-canvas text-main overflow-hidden' : 'relative flex flex-col flex-1 min-h-0 min-w-0 h-full overflow-hidden text-main'} aria-label={t('quranRead')}>
    <style>{`
      [data-immersive] .quran-side-controls { opacity:0; transition:opacity .18s; }
      [data-immersive] .quran-side-controls:hover,[data-immersive] .quran-side-controls:focus-within { opacity:1; }
    `}</style>
    <IslamicReaderHeader title={t('navQuran')} t={t} panelOpen={panelOpen} onPanelToggle={() => setPanelOpen(value => !value)}
      picker={<><div className="min-w-0 flex-1 max-w-60"><select aria-label={t('quranSurah')} value={page?.surahStart || 1} onChange={event => jumpReference({ surah: Number(event.target.value), ayah: 1 })} className="w-full min-w-0 bg-surface border border-subtle rounded-lg p-2 text-xs">{surahs.map(surah => <option key={surah.number} value={surah.number}>{surah.number} · {(lang === 'ar' ? surah.arabic : surah.name) || t('quranSurahNumber', { number: surah.number })}</option>)}</select></div>{structure && page?.profile === 'hafs' && <select aria-label={t('quranJuz')} value={structure.juz.find(item => { const [surah, ayah] = item.last.split(':').map(Number); return surah > page.surahStart || (surah === page.surahStart && ayah >= page.ayahStart); })?.number || 1} onChange={event => { const item = structure.juz.find(item => item.number === Number(event.target.value)); if (item) { const [surah, ayah] = item.first.split(':').map(Number); jumpReference({surah, ayah}); } }} className="max-w-24">{structure.juz.map(item => <option key={item.number} value={item.number}>{t('quranJuz')} {item.number.toLocaleString(lang)}</option>)}</select>}</>}
      profile={<select data-reader-profile aria-label={t('quranScriptChoice')} value={selection.script} onChange={event => changeScript(event.target.value)}>{catalog.sources.filter(source => source.kind === 'script').map(source => <option key={source.id} value={source.id}>{t(source.profile === 'warsh' ? 'quranProfileWarsh' : 'quranProfileHafs')}</option>)}</select>}
      settings={<div className="space-y-3">
              {selectors.map(([key, kind, label]) => <label key={key} className="flex flex-col gap-1 my-3 text-sm">{t(label)}<select value={selection[key]} disabled={key !== 'script' && profile !== 'hafs'} onChange={event => { customized.current.add(key); if (key === 'script') changeScript(event.target.value); else setSelection(previous => ({ ...previous, [key]: event.target.value })); }} className="rounded-lg bg-surface border border-subtle p-2">{key !== 'script' && <option value="">{t('quranOff')}</option>}{catalog.sources.filter(source => source.kind === kind && (key === 'script' || source.profile === profile)).map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>)}
      <label className="flex flex-col gap-1 my-3 text-sm">{t('quranCatLayout')}<select value={layout?.id || ''} onChange={event => setLayoutId(event.target.value)} className="rounded-lg bg-surface border border-subtle p-2">{layouts.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>
      <label className="flex flex-col gap-1 my-3 text-sm">{t('quranCatFont')}<select className="rounded-lg bg-surface border border-subtle p-2" disabled><option>{(layout?.kind === 'glyph-layout' || profile === 'warsh') ? catalog.sources.find(source => source.kind === 'font' && source.profile === profile)?.title || t('quranWordUnavailable') : t('quranVectorOutlines')}</option></select></label>
      {page?.layoutMode === 'adapted' && <p className="text-xs text-muted leading-relaxed">{t('quranAdaptedWarshLayout')}</p>}
        {navigation}
        <div ref={setControlsHost} data-quran-secondary-controls />
        <button type="button" onClick={() => setShowIntro(value => !value)}>{t('quranSurahIntro')}</button>
              {structure && page?.profile === 'hafs' && <QuranStructureNav structure={structure} page={page} t={t} lang={lang} onNavigate={jumpReference} />}
        <button type="button" onClick={() => setSetup(value => !value)}>{t('quranChooseResources')}</button>
              <button type="button" data-quran-fullscreen={immersive ? 'exit' : 'enter'} aria-label={t(immersive ? 'quranExitFullscreen' : 'quranEnterFullscreen')} title={t(immersive ? 'quranExitFullscreen' : 'quranEnterFullscreen')} onClick={() => { if (immersive) leaveFullscreen(); else { setImmersive(true); void root.current?.requestFullscreen?.().catch(() => {}); } }} className="p-2">{immersive ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}</button>
        <button type="button" onClick={() => startAudio({surah: page?.surahStart || 1, ayah: page?.ayahStart || 1})}>{t('quranAudioPlay')}</button>
      </div>} />
    {error && <p role="alert" className="absolute top-16 inset-x-3 mx-auto z-50 w-fit max-w-[90%] rounded-xl bg-surface border border-red-500 p-3 text-sm">{t(error)}<button type="button" aria-label={t('quranClosePanel')} onClick={() => setError(null)} className="ms-2"><X className="size-4" /></button></p>}
    {notice && <p role="status" className="sr-only">{t(notice)}</p>}
    {page && loadedKey === queryKey && layout && <QuranKhatmahDock key={targetKhatmah} script={selection.script} layout={layout.id} page={page.pageNumber} visible={visible && !loading} targetPlan={targetKhatmah} />}
    <div className="relative flex-1 min-h-0">{page && loadedKey === queryKey && layout && page.profile === profile ? <QuranMushafWorkspace
      panelOpen={panelOpen} onPanelChange={setPanelOpen} controlsHost={controlsHost} page={page} selection={selection} metadata={metadata} surahs={surahs} t={t} lang={lang} dir={dir} immersive={immersive} loading={loading}
      selectedAyah={inspected} onSelectAyah={setInspected} onNavigatePage={navigatePage}
      onCopyText={copy} activeAudio={audioState} canPlay={reciters.length > 0} onStartAudio={startAudio}
      studyTarget={studyTarget} onStudyTargetConsumed={clearStudyTarget} onNavigateAyah={jumpReference}
    /> : <div className="flex h-full items-center justify-center p-16"><p role="status" className="text-sm text-muted max-w-lg leading-loose">{t(loading ? 'quranLoading' : 'quranMushafLayoutRequired')}</p></div>}</div>

    {setup && <aside data-quran-popup className="absolute end-3 sm:end-14 top-16 z-40 w-96 max-w-[85%] max-h-[calc(100%-5rem)] overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable] rounded-2xl border border-subtle bg-surface p-4 shadow-xl">
      <button type="button" aria-label={t('quranClosePanel')} onClick={() => setSetup(false)} className="p-2"><X className="size-4" /></button>
      <p className="text-sm leading-loose">{t('quranSetupPickerHint')}</p>
      <div className="space-y-2 my-3">{catalog.presets.filter(preset => preset.id !== 'mushaf-layout/warsh-svg').map(preset => <p key={preset.id} dir="auto" className="text-sm">{preset.title} · {t(preset.installed ? 'quranInstalled' : 'quranNotInstalled')}</p>)}</div>
      <button type="button" className="rounded-lg border border-subtle p-2 text-sm" disabled={!missing.length} onClick={() => { const client = api(); if (client) void client.downloadBatch(missing.map(preset => preset.id)).then(result => { if (!result.ok) setError('quranReaderError'); }).catch(() => setError('quranReaderError')); }}>{t('quranDownload')}</button>
      <button type="button" className="rounded-lg border border-subtle p-2 text-sm ms-2" onClick={() => { const client = api(); if (client) void client.signIn().then(result => { if (!result.ok) setError(quranActionError(new Error(result.error))); }).catch(() => setError('quranNetworkError')); }}>{t('quranSignIn')}</button>
      <button type="button" className="rounded-lg border border-subtle p-2 text-sm mt-2" onClick={() => { const client = api(); if (client) void client.setup(catalog.presets.filter(preset => preset.id !== 'mushaf-layout/warsh-svg').map(preset => preset.id)).then(result => { if (!result.ok || result.data?.failed.length) setError('quranReaderError'); }).catch(() => setError('quranReaderError')); }}>{t('quranImportSelected')}</button>
    </aside>}
    {showIntro && intro && <aside data-quran-popup className="absolute start-3 sm:start-14 top-16 z-40 w-96 max-w-[85%] max-h-[calc(100%-5rem)] overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable] bg-surface rounded-2xl border border-subtle shadow-xl"><QuranSurahIntroCard intro={intro} t={t} surah={surahs.find(surah => surah.number === intro.surahNumber)} derived={surahInfo?.language === 'ar'} onClose={() => setShowIntro(false)} /></aside>}
    {inspected && <QuranAyahInspector floating reference={inspected} details={details} error={inspectionError} surahName={(lang === 'ar' ? surahs.find(surah => surah.number === inspected.surah)?.arabic : surahs.find(surah => surah.number === inspected.surah)?.name) || t('quranSurahNumber', { number: inspected.surah })} t={t} dir={dir} onClose={() => setInspected(null)} onCopy={copy} onStudy={() => { setStudyTarget(inspected); setInspected(null); }} commentary={<PersonalCommentary key={`${inspected.surah}:${inspected.ayah}`} reference={`quran:${profile}:${inspected.surah}:${inspected.ayah}`} />} />}
    {audioOpen && <div data-quran-audio-dock className="absolute bottom-3 inset-x-0 mx-auto z-40 w-[min(54rem,calc(100%-2.5rem))] max-h-[70%] overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable] [&>div]:!relative [&>div]:!inset-auto [&>div]:!m-0 [&>div]:!max-w-none"><QuranAudioPlayer surah={audioAyah.surah} ayah={audioAyah.ayah} surahCount={surahs.find(surah => surah.number === audioAyah.surah)?.count || 300} reciters={reciters} activeReciterId={activeReciterId} onSelectReciter={setActiveReciterId} t={t} lang={lang} dir={dir} onAyahChange={(surah, ayah) => { setAudioAyah({ surah, ayah }); void jump(surah, ayah); }} onAudioStateChange={setAudioState} onClose={() => { setAudioOpen(false); setAudioState(null); }} /></div>}
  </section>;
}
