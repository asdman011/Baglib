'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Copy, Download, FolderOpen, Play, Pause, Search, Settings2, Volume2, X } from 'lucide-react';
import type { QuranCommentary, QuranMushafPage, QuranPassage, QuranReaderCatalog, QuranReadQuery, QuranRichNode, QuranSearchHit } from '../../../shared/types/quran';
import type { TranslationKey } from '../../translations';
import { useWorkspace } from '../context/WorkspaceContext';
import { QuranMushafView } from './QuranMushafView';
import { QuranAudioPlayer, type QuranAudioState } from './QuranAudioPlayer';

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
}) {
  return <div className="space-y-4">
    {passage.basmala && <p dir="rtl" lang="ar" className="font-reading text-2xl leading-[2.5] text-center py-3">{passage.basmala}</p>}
    {passage.ayahs.map(ayah => {
      const isAyahPlaying = activeAudio?.surah === passage.surah && activeAudio?.ayah === ayah.number && activeAudio?.isPlaying;
      return <article
        key={ayah.number}
        className={`min-w-0 rounded-2xl border bg-surface p-4 sm:p-6 transition-all ${
          isAyahPlaying
            ? 'border-emerald-500/80 bg-emerald-500/5 ring-1 ring-emerald-500/30 shadow-sm'
            : 'border-subtle'
        }`}
        aria-label={`${passage.surah}:${ayah.number}`}
      >
        <div dir="rtl" lang="ar" className="font-reading text-[1.65rem] sm:text-3xl text-start leading-[2.5] break-words">
          {ayah.words.map(word => {
            const isWordActive = isAyahPlaying && activeAudio?.activeWordIndex === word.position;
            return <React.Fragment key={word.position}><span className={`${showWords && !word.marker ? 'inline-flex flex-col items-center align-top mx-1 max-w-full' : ''} ${isWordActive ? 'text-amber-600 dark:text-amber-400 font-bold bg-amber-500/20 rounded-md px-1 transition-all' : ''}`}>
              <span>{word.text}</span>
              {showWords && !word.marker && <>{showMeanings && <span dir="ltr" lang="en" className="font-sans text-xs leading-relaxed text-muted text-center max-w-40 break-words">{word.meaning || t('quranWordUnavailable')}</span>}{word.transliteration && <span dir="ltr" lang="en" className="font-sans text-xs leading-relaxed text-pale-sky-600 dark:text-pale-sky-300">{word.transliteration}</span>}</>}
            </span>{' '}</React.Fragment>;
          })}
        </div>
        {ayah.translation && <div dir="ltr" lang="en" className="mt-5 border-t border-subtle pt-4 text-base leading-loose text-start">
          <p>{ayah.translation.text}</p>
          {ayah.translation.notes.length > 0 && <details className="mt-3 text-sm text-muted"><summary className="cursor-pointer">{t('quranFootnotes', { count: ayah.translation.notes.length })}</summary><ol className="list-decimal ps-6 space-y-3 mt-3">{ayah.translation.notes.map((note, index) => <li key={index}>{note}</li>)}</ol></details>}
        </div>}
        <div className="flex flex-wrap justify-between items-center gap-3 mt-4 text-sm text-muted">
          <span dir="ltr">{new Intl.NumberFormat(lang).format(passage.surah)}:{new Intl.NumberFormat(lang).format(ayah.number)}</span>
          <div className="flex flex-wrap gap-2">
            {onPlayAyah && <button type="button" onClick={() => onPlayAyah(ayah.number)} title={isAyahPlaying ? t('quranAudioPause') : t('quranAudioPlay')} aria-label={isAyahPlaying ? t('quranAudioPause') : t('quranAudioPlay')} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors ${isAyahPlaying ? 'bg-emerald-600 text-white border-emerald-600' : 'border-subtle hover:bg-pale-sky-500/10'}`}>{isAyahPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}{t(isAyahPlaying ? 'quranAudioPause' : 'quranAudioPlay')}</button>}
            <button type="button" onClick={() => onCopy(ayah.words.map(word => word.text).join(' ') + (ayah.translation ? `\n\n${ayah.translation.text}` : '') + `\n${passage.surah}:${ayah.number}`)} className="rounded-lg border border-subtle p-2" title={t('quranCopyAyah')} aria-label={t('quranCopyAyah')}><Copy className="size-4" /></button>
            {onViewInMushaf && <button type="button" onClick={() => onViewInMushaf(ayah.number)} title={t('quranViewInMushaf')} aria-label={t('quranViewInMushaf')} className="inline-flex items-center gap-1.5 rounded-lg border border-subtle px-3 py-2 text-xs"><BookOpen className="size-4" />{t('quranViewInMushaf')}</button>}
            {onCommentary && <button type="button" onClick={() => onCommentary(ayah.number)} aria-expanded={selected === ayah.number} className="inline-flex items-center gap-2 rounded-lg border border-subtle px-3 py-2"><BookOpen className="size-4" />{t('quranCatTafsir')}</button>}
          </div>
        </div>
        {selected === ayah.number && <aside className="mt-4 border-t border-subtle pt-4" aria-label={t('quranCatTafsir')}>
          {commentary ? <><p dir="ltr" className="text-sm text-muted mb-3">{commentary.from} – {commentary.to}</p><div dir="rtl" lang="ar" className="font-reading text-xl leading-[2.2] break-words space-y-3"><RichText nodes={commentary.nodes} /></div></> : <p role="status">{t('quranLoading')}</p>}
        </aside>}
      </article>;
    })}
  </div>;
}

export function QuranReaderView() {
  const { t, lang, dir } = useWorkspace();
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [selection, setSelection] = useState({ script: '', translation: '', meanings: '', transliteration: '', tafsir: '' });
  const [readerMode, setReaderMode] = useState<'study' | 'mushaf'>('study');
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
  const [checked, setChecked] = useState(['quran-script/312', 'translation/193', 'tafsir/22', 'translation/92', 'quran-metadata/70', 'mushaf-layout/569']);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [noticeInfo, setNoticeInfo] = useState<{ key: TranslationKey; params?: Record<string, string | number>; details?: string } | null>(null);
  const [error, setError] = useState(false);
  const refresh = useRef(0);
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
        setCatalog(result.data);
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
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = api()?.onChanged(() => { clearTimeout(timer); timer = setTimeout(() => { void load(); }, 500); });
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

  const perform = async (action: () => Promise<void>) => { setBusy(true); setError(false); setNotice(''); try { await action(); } catch { setError(true); } finally { setBusy(false); } };

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
  const [activeReciterId, setActiveReciterId] = useState('');

  const reciters = catalog.sources.filter(s => s.kind === 'recitation');

  useEffect(() => {
    if (!activeReciterId && reciters.length > 0) {
      setActiveReciterId(reciters[0].id);
    }
  }, [reciters, activeReciterId]);

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

  const selectors = [['script', 'script', 'quranScriptChoice'], ['translation', 'translation', 'quranTranslationChoice'], ['meanings', 'word-translation', 'quranMeaningsChoice'], ['transliteration', 'word-transliteration', 'quranTransliterationChoice'], ['tafsir', 'tafsir', 'quranTafsirChoice']] as const;

  return <section dir={dir} className="flex-1 min-h-0 min-w-0 overflow-y-auto p-4 sm:p-6 text-main" aria-label={t('quranRead')}>
    <header className="flex flex-wrap justify-between items-center gap-3 mb-5">
      <div>
        <h1 className="text-2xl font-display font-bold leading-relaxed">{t('navQuran')}</h1>
        <p className="text-sm text-muted leading-relaxed">{t('quranReaderHint')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Study Reader vs Mushaf View segmented switcher */}
        <div className="flex rounded-xl border border-subtle bg-surface p-1">
          <button
            type="button"
            onClick={() => setReaderMode('study')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              readerMode === 'study' ? 'bg-pale-sky-600 text-white shadow-xs' : 'text-muted hover:text-main'
            }`}
          >
            {t('quranModeStudy')}
          </button>
          <button
            type="button"
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

    {(panel === 'setup' || (!selection.script && !loading)) && <div className="rounded-2xl border border-subtle bg-surface p-4 mb-5 space-y-4">
      <p className="text-sm leading-relaxed text-muted">{t('quranSetupPickerHint')}</p>
      <div className="grid gap-3 sm:grid-cols-2">{catalog.presets.map(preset => <div key={preset.id} className="flex flex-wrap items-center gap-2 border border-subtle rounded-xl p-3"><label className="flex gap-2 items-center flex-1 min-w-0"><input type="checkbox" checked={checked.includes(preset.id)} onChange={event => setChecked(previous => event.target.checked ? [...previous, preset.id] : previous.filter(id => id !== preset.id))} /><span dir="auto" className="text-sm break-words">{preset.title}</span></label>{preset.installed ? <span className="text-xs text-muted">{t('quranInstalled')}</span> : <button type="button" disabled={busy} title={t('quranDownload')} aria-label={`${t('quranDownload')} ${preset.title}`} onClick={() => void perform(async () => { const result = await api().download(preset.id); if (!result.ok) throw new Error(); setNotice('quranQulDownloadHint'); })} className="border border-subtle rounded-lg p-2 disabled:opacity-50"><Download className="size-4" /></button>}{preset.id === 'translation/193' && <p className="w-full text-xs text-muted leading-relaxed">{t('quranInlineFormatHint')}</p>}</div>)}</div>
      <button type="button" disabled={busy || !checked.length} onClick={() => void perform(async () => { const result = await api().setup(checked); if (!result.ok) throw new Error(); if (result.data) { const absent = [...result.data.missing, ...result.data.failed].map(id => catalog.presets.find(preset => preset.id === id)?.title || id).join(' · '); setNotice('quranSetupResults', { installed: result.data.installed.length, missing: result.data.missing.length, failed: result.data.failed.length }, absent); } })} className="inline-flex items-center gap-2 bg-pale-sky-600 text-white rounded-xl px-4 py-2 disabled:opacity-50"><FolderOpen className="size-4" />{t('quranImportSelected')}</button>
      {busy && <p role="status" className="text-sm">{t('quranInstalling')}</p>}
    </div>}

    {notice && <p role="status" className="rounded-xl bg-pale-sky-500/10 p-3 mb-4 text-sm leading-relaxed">{notice}</p>}
    {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 mb-4 text-sm">{t('quranReaderError')}</p>}

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
          onSelectAyah={setSelectedMushafAyah}
          onNavigatePage={page => {
            setMushafPageNumber(page);
            setSelectedMushafAyah(null);
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
          <QuranPassageView
            passage={passage}
            t={t}
            lang={lang}
            selected={panel === 'tafsir' ? selected : null}
            commentary={commentaryKey === selectedKey ? commentary : null}
            showWords={Boolean(selection.meanings || selection.transliteration)}
            showMeanings={Boolean(selection.meanings)}
            onViewInMushaf={mushafSource && profile === 'hafs' ? handleViewInMushaf : undefined}
            onCommentary={selection.tafsir && profile === 'hafs' ? ayah => { setCommentary(null); setPanel('tafsir'); setSelected(selected === ayah ? null : ayah); } : undefined}
            onCopy={text => { void api().copyText(text).then(result => { if (result.ok) setNotice('quranCopied'); else setError(true); }).catch(() => setError(true)); }}
            activeAudio={audioState}
            onPlayAyah={handlePlayAyah}
          />
          {!passage.ayahs.length && <p className="text-muted">{t('quranNoAyahs')}</p>}
          <div className="flex flex-wrap justify-between gap-3 mt-5"><button type="button" disabled={from <= 1} onClick={() => setFrom(Math.max(1, from - 20))} className="inline-flex items-center gap-2 rounded-xl border border-subtle px-4 py-2 disabled:opacity-40"><ChevronLeft className="size-4 rtl:rotate-180" />{t('quranPrevious')}</button><button type="button" disabled={!passage.next} onClick={() => { if (passage.next) setFrom(passage.next); }} className="inline-flex items-center gap-2 rounded-xl border border-subtle px-4 py-2 disabled:opacity-40">{t('quranNext')}<ChevronRight className="size-4 rtl:rotate-180" /></button></div>
        </>}
      </>
    )}

    {!selection.script && loading && <p role="status">{t('quranLoading')}</p>}
    {panel && <button type="button" onClick={() => { setPanel(null); setSelected(null); }} className="inline-flex items-center gap-2 text-sm text-muted mt-5"><X className="size-4" />{t('quranClosePanel')}</button>}

    {/* Quran Recorded Audio Player */}
    {audioPlayerOpen && (
      <QuranAudioPlayer
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
      />
    )}
  </section>;
}
