'use client';
import { FeedbackSkeleton } from '../ui/FeedbackSkeleton';

import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { navigateStudyReference, openSunnahReference } from '../../utils/study-navigation';
import { collectionKeys } from '../../utils/sunnah-collections';
import { SITE_SEARCHES, siteSearchUrl, type SiteSearchId } from '../../../shared/site-search';
import type { TranslationKey } from '../../translations';
import type { QuranSearchHit } from '../../../shared/types/quran';
import type { SunnahSearchHit } from '../../../shared/types/sunnah';
import type { PoetrySummary } from '../../../shared/types/poetry';

const SEARCH_DELAY_MS = 250;
const SHOWN = 20;
// The Sunnah search stops at this many hits, so a full page is a lower bound.
const MAX_COUNTED = 200;
const siteNames: Record<SiteSearchId, TranslationKey> = { islamweb: 'siteIslamweb', islamqa: 'siteIslamqa', islamway: 'siteIslamway', core: 'siteCore', jstor: 'siteJstor', pmc: 'sitePmc', sciencedirect: 'siteScienceDirect' };

interface Found { quran: QuranSearchHit[] | null; sunnah: SunnahSearchHit[] | null; poetry: PoetrySummary[] | null }
const nothing: Found = { quran: null, sunnah: null, poetry: null };

/** Each result group names its source, and a source that is not installed says so instead of showing nothing. */
export function StudySourcesSearch({ query, onLeave }: { query: string; onLeave: () => void }) {
  const { t, lang, setViewMode, books, openBookForReading } = useWorkspace();
  const [found, setFound] = useState<Found>(nothing);
  const [busy, setBusy] = useState(false);
  const [completedQuery, setCompletedQuery] = useState('');
  const [retry, setRetry] = useState(0);
  const text = query.trim();

  useEffect(() => {
    if (!text) return;
    let alive = true;
    const timer = setTimeout(() => {
      setBusy(true);
      const api = window.electronAPI;
      const quran = async () => {
        const catalog = await api.quran.readerCatalog();
        const script = catalog.ok ? catalog.data.sources.find(source => source.kind === 'script' && source.profile === 'hafs') : undefined;
        if (!script) return null;
        const result = await api.quran.searchAyahs({ script: script.id, text });
        return result.ok ? result.data : null;
      };
      const sunnah = async () => { const result = await api.sunnah.search?.({ text }); return result?.ok ? result.data : null; };
      const poetry = async () => { const result = await api.poetry.search({ query: text, limit: SHOWN }); return result.ok ? result.data.items : null; };
      void Promise.all([quran().catch(() => null), sunnah().catch(() => null), poetry().catch(() => null)]).then(([ayahs, hadiths, poems]) => {
        if (alive) { setCompletedQuery(text); setFound({ quran: ayahs, sunnah: hadiths, poetry: poems }); setBusy(false); }
      });
    }, SEARCH_DELAY_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [text, retry]);

  const go = (target: string, view: 'quran' | 'bayan') => {
    onLeave();
    setViewMode(view);
    void navigateStudyReference(target, books, openBookForReading, () => {}).catch(() => {});
  };
  const group = <Item,>(title: TranslationKey, items: Item[] | null, row: (item: Item) => React.ReactNode) => <section className="space-y-2">
    <h3 className="text-xs font-bold text-muted">{t(title)}{items && items.length > 0 && <bdi> ({items.length > MAX_COUNTED ? `${MAX_COUNTED}+` : items.length})</bdi>}</h3>
    {items === null ? <div className="space-y-2"><p className="text-xs text-muted">{t('sourcesUnavailable')}</p><button type="button" className="underline text-xs" onClick={() => { onLeave(); setViewMode('settings'); }}>{t('navSettings')}</button></div> : items.length === 0 ? <div className="space-y-2"><p className="text-xs text-muted">{t('noSearchResults')}</p><button type="button" className="underline text-xs" onClick={() => setRetry(value => value + 1)}>{t('lookupRetry')}</button></div> : items.slice(0, SHOWN).map(row)}
  </section>;
  const rowStyle = 'block w-full text-start rounded-xl border border-subtle bg-canvas/40 hover:bg-canvas p-3 text-sm leading-loose';

  return <div className="space-y-5">
    {text && <div className="space-y-5">
      {(busy || completedQuery !== text) ? <FeedbackSkeleton /> : <>
      {group('navQuran', found.quran, hit => <button type="button" key={`${hit.surah}:${hit.ayah}`} className={rowStyle} onClick={() => go(`quran:hafs:${hit.surah}:${hit.ayah}`, 'quran')}><bdi className="text-xs text-muted">{hit.surah}:{hit.ayah}</bdi> <span dir="rtl" lang="ar" className="font-reading">{hit.text}</span></button>)}
      {group('navSunnah', found.sunnah, hit => <button type="button" key={hit.hadith.id} className={rowStyle} onClick={() => { onLeave(); setViewMode('sunnah'); openSunnahReference({ collection: hit.chapter.collection, chapter: hit.chapter.number, hadith: hit.hadith.id }); }}><span className="block text-xs text-muted">{t(collectionKeys[hit.chapter.collection])} · {t('sunnahHadithNumber', { number: hit.hadith.number })}</span><span dir="rtl" lang="ar">{(hit.hadith.text.ar.matn || hit.hadith.text.ar.full).slice(0, 180)}</span></button>)}
      {group('navBayan', found.poetry, poem => <button type="button" key={poem.id} className={rowStyle} onClick={() => { const from = poem.match?.from ?? 0; go(`poetry:ashaar:${poem.id}:${from}:${from + Math.max((poem.match?.lines.length ?? 1) - 1, 0)}`, 'bayan'); }}><span className="block text-xs text-muted" dir="auto">{poem.poetName} · {poem.title}</span><span dir="auto">{poem.match?.lines[0]}</span></button>)}
    </>}
    </div>}
    <section className="space-y-3 border-t border-subtle pt-4">
      <h3 className="text-xs font-bold text-muted">{t('siteSearchTitle')}</h3>
      <p className="text-xs text-muted leading-relaxed">{t(text ? 'siteSearchNotice' : 'siteSearchEmpty')}</p>
      {(['islamic', 'research'] as const).map(kind => <div key={kind} className="space-y-2">
        <h4 className="text-[11px] font-bold text-muted">{t(kind === 'islamic' ? 'siteSearchIslamic' : 'siteSearchResearch')}</h4>
        <div className="flex flex-wrap gap-2">{SITE_SEARCHES.filter(site => site.group === kind).map(site => <button type="button" key={site.id} disabled={!text} onClick={() => void window.electronAPI.openExternal(siteSearchUrl(site, text, lang))} className="inline-flex items-center gap-1.5 rounded-xl border border-subtle px-3 py-1.5 text-xs font-bold disabled:opacity-50"><ExternalLink className="w-3 h-3 rtl:-scale-x-100" />{t(siteNames[site.id])}</button>)}</div>
      </div>)}
    </section>
  </div>;
}
