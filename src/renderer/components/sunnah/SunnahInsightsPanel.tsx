'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { SunnahCatalog, SunnahCollectionId, SunnahSearchHit, SunnahStatistics } from '../../../shared/types/sunnah';
import { sunnahSubjects } from '../../../shared/sunnah-subjects';
import { matchesStudyQuery } from '../../../shared/study-notes';
import { collectionKeys } from '../../utils/sunnah-collections';
import { openSunnahReference } from '../../utils/study-navigation';
import type { SunnahTranslate } from './SunnahChapterView';
import { SunnahNarratorCard } from './SunnahNarratorCard';

const SHOWN_SUBJECTS = 60;

export function SunnahInsightsPanel({ catalog, lang, t, onChapter }: { catalog: SunnahCatalog; lang: 'ar' | 'en'; t: SunnahTranslate; onChapter: (collection: SunnahCollectionId, chapter: number) => void }) {
  const [tab, setTab] = useState<'subjects' | 'statistics'>('subjects');
  const [stats, setStats] = useState<SunnahStatistics | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [narrator, setNarrator] = useState<string | null>(null);
  const [hits, setHits] = useState<SunnahSearchHit[]>([]);
  const number = new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US');
  const subjects = useMemo(() => sunnahSubjects(catalog, lang), [catalog, lang]);
  const shown = useMemo(() => subjects.filter(subject => matchesStudyQuery(subject.title, query)).slice(0, SHOWN_SUBJECTS), [subjects, query]);

  useEffect(() => {
    if (tab !== 'statistics' || stats) return;
    let alive = true;
    void window.electronAPI.sunnah.statistics?.().then(result => {
      if (!alive) return;
      setFailed(!result.ok);
      if (result.ok) setStats(result.data);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [tab, stats]);

  const showHadiths = (id: string) => { void window.electronAPI.sunnah.search?.({ narratorId: id }).then(result => { if (result.ok) setHits(result.data); }).catch(() => setFailed(true)); };

  return <section className="sunnah-insights" aria-label={t('sunnahInsights')}>
    <div className="sunnah-research-tabs" role="group" aria-label={t('sunnahInsights')}>
      {(['subjects', 'statistics'] as const).map(item => <button type="button" key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>{t(item === 'subjects' ? 'sunnahSubjects' : 'sunnahStatistics')}</button>)}
    </div>
    {tab === 'subjects' && <>
      <p className="sunnah-research-caption">{t('sunnahSubjectsNotice')}</p>
      <input className="sunnah-button w-full" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('sunnahSubjectsSearch')} aria-label={t('sunnahSubjectsSearch')} dir="auto" />
      <ul className="sunnah-subjects">{shown.map(subject => <li key={subject.key}>
        <button type="button" aria-expanded={open === subject.key} onClick={() => setOpen(current => current === subject.key ? null : subject.key)}><span dir="auto">{subject.title}</span><small>{t('sunnahSubjectCount', { chapters: number.format(subject.chapters.length), hadiths: number.format(subject.hadiths) })}</small></button>
        {open === subject.key && <div className="sunnah-research-results">{subject.chapters.map(chapter => <button type="button" key={`${chapter.collection}:${chapter.number}`} onClick={() => onChapter(chapter.collection, chapter.number)}><span>{t(collectionKeys[chapter.collection])} · {t('sunnahRecordCount', { count: chapter.hadithCount })}</span><span dir="auto">{chapter.title[lang] || chapter.title.ar || chapter.title.en}</span></button>)}</div>}
      </li>)}</ul>
    </>}
    {tab === 'statistics' && <>
      <p className="sunnah-research-caption">{t('sunnahStatisticsNotice')}</p>
      {failed && <p role="alert">{t('sunnahResearchError')}</p>}
      {!stats && !failed && <p role="status">{t('sunnahStatisticsLoading')}</p>}
      {stats && <>
        <p className="sunnah-research-caption">{t('sunnahStatisticsTotals', { hadiths: number.format(stats.totals.hadiths), narrators: number.format(stats.totals.narratorProfiles), links: number.format(stats.totals.chainLinks), roots: number.format(stats.totals.rootLinks) })}</p>
        <div className="sunnah-table-scroll"><table className="sunnah-stats">
          <thead><tr><th scope="col">{t('sunnahCollection')}</th><th scope="col">{t('sunnahStatHadiths')}</th><th scope="col">{t('sunnahStatChapters')}</th><th scope="col">{t('sunnahStatCommentary')}</th><th scope="col">{t('sunnahStatCorroborated')}</th></tr></thead>
          <tbody>{stats.collections.map(row => <tr key={row.id}><th scope="row">{t(collectionKeys[row.id])}</th><td>{number.format(row.hadiths)}</td><td>{number.format(row.chapters)}</td><td>{number.format(row.commentary)}</td><td>{number.format(row.corroborated)}</td></tr>)}</tbody>
        </table></div>
        <h3 className="sunnah-insights-heading">{t('sunnahTopNarrators')}</h3>
        <ol className="sunnah-subjects">{stats.topNarrators.map(row => <li key={row.id}><button type="button" aria-expanded={narrator === row.id} onClick={() => { setHits([]); setNarrator(current => current === row.id ? null : row.id); }}><span dir="rtl" lang="ar">{row.name}</span><small>{number.format(row.mentions)}</small></button>{narrator === row.id && <SunnahNarratorCard key={row.id} id={row.id} t={t} onHadiths={showHadiths} />}{narrator === row.id && hits.length > 0 && <div className="sunnah-research-results">{hits.slice(0, 30).map(hit => <button type="button" key={hit.hadith.id} onClick={() => openSunnahReference({ collection: hit.chapter.collection, chapter: hit.chapter.number, hadith: hit.hadith.id })}><span>{t(collectionKeys[hit.chapter.collection])} · {t('sunnahHadithNumber', { number: hit.hadith.number })}</span><span dir="rtl" lang="ar">{(hit.hadith.text.ar.matn || hit.hadith.text.ar.full).slice(0, 180)}</span></button>)}</div>}</li>)}</ol>
      </>}
    </>}
  </section>;
}
