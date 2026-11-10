'use client';
import React, { useEffect, useState } from 'react';
import { BookMarked, BookOpenText, Feather, Search } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { CONTINUE_KEY, CONTINUE_KINDS, continueReading, type ContinueKind, type ContinueReading } from './continue-reading';
import { navigateStudyReference } from '../../utils/study-navigation';
import { StudySourcesSearch } from '../search/StudySourcesSearch';
import { useKhatmah } from '../quran/useKhatmah';
import { khatmahStats, localDate, pageRanges } from '../../../shared/khatmah';
import { openQuranPage } from '../../utils/quran-navigation';
import type { QuranWirdConfig } from '../../../shared/quran-wird';
import { QuranWirdSettingsModal } from '../dashboard/QuranWirdSettingsModal';

const entries = [
  { kind:'quran', view:'quran', label:'navQuran', Icon:BookMarked },
  { kind:'sunnah', view:'sunnah', label:'navSunnah', Icon:BookOpenText },
  { kind:'poetry', view:'bayan', label:'navBayan', Icon:Feather },
] as const;
export function IslamicStudiesHub() {
  const { t, lang, dir, setViewMode, books, openBookForReading } = useWorkspace();
  const [positions, setPositions] = useState<Partial<Record<ContinueKind, ContinueReading | null>>>({});
  const [query, setQuery] = useState('');
  const [failed, setFailed] = useState(false);
  const [wird, setWird] = useState<QuranWirdConfig | null>(null);
  const [wirdSettings, setWirdSettings] = useState(false);
  const khatmah = useKhatmah();
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const saved = await Promise.all(CONTINUE_KINDS.map(async kind => [kind, continueReading(await window.electronAPI.settings.get(CONTINUE_KEY + '.' + kind),kind)] as const));
        const config = await window.electronAPI.studyWird.getConfig();
        if (alive) { setPositions(Object.fromEntries(saved)); setWird(config); setFailed(false); }
      } catch { if (alive) setFailed(true); }
    };
    void load();
    window.addEventListener('baglib:continue-reading',load);
    return () => { alive = false; window.removeEventListener('baglib:continue-reading',load); };
  }, []);
  const open = (target: string) => { void navigateStudyReference(target, books, openBookForReading, () => {}).catch(() => setFailed(true)); };
  const today = localDate();
  return <section data-islamic-hub dir={dir} className="min-h-0 flex-1 overflow-auto bg-canvas p-4 text-main sm:p-8">
    <div className="mx-auto max-w-5xl space-y-7">
      <header><h1 className="font-display text-2xl font-semibold leading-loose">{t('islamicHub')}</h1><p className="text-sm leading-loose text-muted">{t('islamicHubHint')}</p></header>
      <label className="flex items-center gap-3 rounded-2xl border border-subtle bg-surface px-4 py-3"><Search size={18} className="shrink-0 text-muted" /><input type="search" dir="auto" data-islamic-search value={query} maxLength={500} onChange={event => setQuery(event.target.value)} aria-label={t('islamicSearch')} placeholder={t('islamicSearch')} className="min-w-0 flex-1 bg-transparent text-sm leading-loose outline-none" /></label>
      {query.trim() && <StudySourcesSearch query={query} onLeave={() => setQuery('')} />}
      {(failed || khatmah.error) && <p role="alert">{t(khatmah.error || 'quranStorageError')}</p>}
      <section aria-label={t('islamicContinue')}><h2 className="mb-3 text-sm font-semibold text-muted">{t('islamicContinue')}</h2><div className="grid gap-4 sm:grid-cols-3">
        {entries.map(({kind,view,label,Icon}) => <article key={kind} data-islamic-entry={kind} className="min-w-0 rounded-2xl border border-subtle bg-surface p-5">
          <button type="button" onClick={() => setViewMode(view)} className="mb-4 flex w-full items-center gap-3 text-start font-semibold leading-loose"><Icon size={22} className="text-primary-text" />{t(label)}</button>
          {positions[kind] ? <button type="button" data-continue-reading={kind} onClick={() => open(positions[kind]!.target)} className="block w-full break-words text-start text-sm leading-loose text-primary-text hover:underline"><span className="block text-xs text-muted">{t('islamicContinue')}</span><bdi>{positions[kind]!.label}</bdi></button> : <p className="text-xs leading-loose text-muted">{t('islamicNoPosition')}</p>}
        </article>)}
      </div></section>
      <section className="rounded-2xl border border-subtle bg-surface p-5"><h2 className="font-semibold leading-loose">{t('statisticsWird')}</h2>
        {wird && <><p className="my-2 text-sm leading-loose">{t(wird.profile === 'warsh' ? 'quranProfileWarsh' : 'quranProfileHafs')} · {t('statisticsQuranPosition', {surah:wird.currentPosition.surah.toLocaleString(lang), ayah:wird.currentPosition.ayah.toLocaleString(lang)})}</p><p className="text-xs text-muted">{t(wird.lastCompletedDate === today ? 'khatmahTodayDone' : 'todayWirdStepSubtitle')}</p><button type="button" className="mt-3 rounded-lg border border-subtle px-3 py-2 text-sm" onClick={() => open('quran:' + wird.profile + ':' + wird.currentPosition.surah + ':' + wird.currentPosition.ayah)}>{t('khatmahReadToday')}</button></>}
        <button type="button" className="ms-2 mt-3 rounded-lg border border-subtle px-3 py-2 text-sm" onClick={() => setWirdSettings(true)}>{t('quranWirdSettingsButton')}</button>
      </section>
      <section><h2 className="mb-3 font-semibold">{t('khatmahProgress')}</h2>{!khatmah.loading && !khatmah.plans.length && <p className="rounded-2xl border border-dashed border-subtle p-5 text-sm leading-loose text-muted">{t('khatmahEmpty')}</p>}
        <div className="grid gap-4 sm:grid-cols-2">{khatmah.plans.map(plan => { const stats=khatmahStats(plan,today); return <article key={plan.id} className="rounded-2xl border border-subtle bg-surface p-5 space-y-3"><h3 dir="auto" className="font-semibold">{plan.title}</h3><p className="text-xs text-muted">{t(plan.binding.profile === 'warsh' ? 'quranProfileWarsh' : 'quranProfileHafs')}</p><progress aria-label={t('khatmahProgress')} max={604} value={stats.completed} className="w-full accent-primary" /><p className="text-sm">{t('khatmahProgressValue',{pages:stats.completed.toLocaleString(lang),percent:stats.percent.toLocaleString(lang,{maximumFractionDigits:1})})}</p><p className="text-sm leading-loose">{stats.todayPages.length ? t('khatmahPages',{pages:pageRanges(stats.todayPages)}) : t(plan.paused ? 'khatmahPaused' : 'khatmahTodayDone')}</p><button type="button" disabled={!stats.todayPages.length} className="rounded-lg border border-subtle px-3 py-2 text-sm disabled:opacity-40" onClick={() => openQuranPage({script:plan.script,layout:plan.layout,page:stats.todayPages[0],khatmah:plan.id})}>{t('khatmahReadToday')}</button></article>; })}</div>
      </section>
    </div>
    <QuranWirdSettingsModal isOpen={wirdSettings} onClose={() => setWirdSettings(false)} onSaved={setWird} />
  </section>;
}
