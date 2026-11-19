'use client';
import { FeedbackSkeleton } from '../ui/FeedbackSkeleton';

import { parseQuranReference } from '../../../shared/quran-reference';
import { quranReferenceLabel } from '../../utils/quran-reference-label';
import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { collectionKeys } from '../../utils/sunnah-collections';
import { ContextMenu } from '../ui/ContextMenu';
import { useOpenStudyLink } from '../../utils/use-study-link';
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
import { ListContextMenu } from '../lists/PersonalListControls';
import { ayahListRef, hadithListRef, poemListRef } from '../../../shared/personal-lists';

export function StudySourcesSearch({ query, onLeave }: { query: string; onLeave: () => void }) {
  const { t, lang, setViewMode } = useWorkspace();
  const { linkHandlers, linkMenuItems } = useOpenStudyLink();
  const [quranScript, setQuranScript] = useState<{ id: string; profile: 'hafs' | 'warsh'; query: string } | null>(null);
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
        const script = catalog.ok ? (catalog.data.sources.find(source => source.kind === 'script' && source.profile === 'hafs') || catalog.data.sources.find(source => source.kind === 'script')) : undefined;
        if (alive) setQuranScript(script ? { id: script.id, profile: script.profile || 'hafs', query: text } : null);
        if (!script || !catalog.ok) return null;
        const result = await api.quran.searchAyahs({ script: script.id, text, translations: catalog.data.sources.filter(source => source.kind === 'translation' && source.profile === script.profile).map(source => source.id) });
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

  const group = <Item,>(title: TranslationKey, items: Item[] | null, row: (item: Item) => React.ReactNode) => <section className="space-y-2">
    <h3 className="text-xs font-bold text-muted">{t(title)}{items && items.length > 0 && <bdi> ({items.length > MAX_COUNTED ? `${MAX_COUNTED}+` : items.length})</bdi>}</h3>
    {items === null ? <div className="space-y-2"><p className="text-xs text-muted">{t('sourcesUnavailable')}</p><button type="button" className="underline text-xs" onClick={() => { onLeave(); setViewMode('settings'); }}>{t('navSettings')}</button></div> : items.length === 0 ? <div className="space-y-2"><p className="text-xs text-muted">{t('noSearchResults')}</p><button type="button" className="underline text-xs" onClick={() => setRetry(value => value + 1)}>{t('lookupRetry')}</button></div> : items.slice(0, SHOWN).map(row)}
  </section>;
  const reference = quranScript?.query === text ? parseQuranReference(text, quranScript.profile) : null;
  const rowStyle = 'block w-full text-start rounded-xl border border-subtle bg-canvas/40 hover:bg-canvas p-3 text-sm leading-loose';

  return <div className="space-y-5">
    {text && <div className="space-y-5">
      {(busy || completedQuery !== text) ? <FeedbackSkeleton /> : <>
      {reference && (() => {
        const refTarget = `quran:${quranScript!.profile}:${reference.surah}:${reference.from}`;
        return <ContextMenu as="div" tabIndex={-1} items={linkMenuItems(refTarget, { onBeforeOpen: onLeave })}><button data-quran-reference type="button" className={rowStyle} {...linkHandlers(refTarget, { onBeforeOpen: onLeave })}>{t('quranReferenceJump', { reference: quranReferenceLabel(reference, lang) })}</button></ContextMenu>;
      })()}
      {group('navQuran', found.quran, hit => {
        const target = `quran:${quranScript?.profile || 'hafs'}:${hit.surah}:${hit.ayah}`;
        return <ListContextMenu key={`${hit.source?.id}:${hit.surah}:${hit.ayah}`} item={{ kind: 'ayah', itemRef: ayahListRef(hit.surah, hit.ayah, hit.ayah, quranScript?.profile === 'warsh' ? 'warsh' : 'hafs'), label: `${hit.surah}:${hit.ayah} — ${hit.text}`.slice(0, 300) }} extraItems={linkMenuItems(target, { onBeforeOpen: onLeave })}><button type="button" className={rowStyle} {...linkHandlers(target, { onBeforeOpen: onLeave })}><bdi className="text-xs text-muted">{hit.surah}:{hit.ayah}</bdi> <span dir="auto" className="block text-xs text-muted">{hit.source?.title}</span><span dir="auto" className="font-reading">{hit.text}</span></button></ListContextMenu>;
      })}
      {group('navSunnah', found.sunnah, hit => {
        const target = hadithListRef(hit.chapter.collection, hit.chapter.number, hit.hadith.id);
        return <ListContextMenu key={hit.hadith.id} item={{ kind: 'hadith', itemRef: target, label: `${t(collectionKeys[hit.chapter.collection])} ${hit.hadith.number} — ${(hit.hadith.text.ar.matn || hit.hadith.text.ar.full).slice(0, 160)}` }} extraItems={linkMenuItems(target, { onBeforeOpen: onLeave })}><button type="button" className={rowStyle} {...linkHandlers(target, { onBeforeOpen: onLeave })}><span className="block text-xs text-muted">{t(collectionKeys[hit.chapter.collection])} · {t('sunnahHadithNumber', { number: hit.hadith.number })}</span><span dir="rtl" lang="ar">{(hit.hadith.text.ar.matn || hit.hadith.text.ar.full).slice(0, 180)}</span></button></ListContextMenu>;
      })}
      {group('navBayan', found.poetry, poem => {
        const from = poem.match?.from ?? 0;
        const target = `poetry:ashaar:${poem.id}:${from}:${from + Math.max((poem.match?.lines.length ?? 1) - 1, 0)}`;
        return <ListContextMenu key={poem.id} item={{ kind: 'poem', itemRef: poemListRef(poem.id), label: [poem.title, poem.poetName].filter(Boolean).join(' — ') }} extraItems={linkMenuItems(target, { onBeforeOpen: onLeave })}><button type="button" className={rowStyle} {...linkHandlers(target, { onBeforeOpen: onLeave })}><span className="block text-xs text-muted" dir="auto">{poem.poetName} · {poem.title}</span><span dir="auto">{poem.match?.lines[0]}</span></button></ListContextMenu>;
      })}
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
