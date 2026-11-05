'use client';

import React, { useEffect, useState } from 'react';
import type { SunnahResearch, SunnahResearchQuery, SunnahSearchHit } from '../../../shared/types/sunnah';
import type { SunnahTranslate } from './SunnahChapterView';
import { collectionKeys } from '../../utils/sunnah-collections';
import { openSunnahReference, navigateStudyReference } from '../../utils/study-navigation';
import type { TranslationKey } from '../../translations';
import { SunnahNarratorCard, tierKeys } from './SunnahNarratorCard';
import { PersonalCommentary } from '../knowledge/PersonalCommentary';
import { SunnahGradingList, SunnahSourcesList } from './SunnahGradingPanel';

const matchMethodKeys: Record<string, TranslationKey> = { shamela_inline_footnote: 'sunnahMatchInline', exact_hadith_num: 'sunnahMatchNumber', exact_window: 'sunnahMatchWindow', tfidf_window: 'sunnahMatchSimilar', sub_narration_ffill: 'sunnahMatchSubNarration' };

function ResultLinks({ hits, t }: { hits: SunnahSearchHit[]; t: SunnahTranslate }) {
  return <div className="sunnah-research-results">{hits.slice(0, 30).map(hit => <button type="button" key={hit.hadith.id} onClick={() => openSunnahReference({ collection: hit.chapter.collection, chapter: hit.chapter.number, hadith: hit.hadith.id })}>
    <span>{t(collectionKeys[hit.chapter.collection])} · {t('sunnahHadithNumber', { number: hit.hadith.number })}{hit.similarity !== undefined && <> · {t('sunnahMatnSimilarity', { score: Math.round(hit.similarity * 100) })}</>}</span>
    <span dir="rtl" lang="ar">{(hit.hadith.text.ar.matn || hit.hadith.text.ar.full).slice(0, 180)}</span>
  </button>)}</div>;
}

export function SunnahResearchPanel({ id, initialOpen, showGrading, sourceBook, matn, t }: { id: number; initialOpen: boolean; showGrading?: number; sourceBook?: boolean; matn?: string; t: SunnahTranslate }) {
  const [open, setOpen] = useState(initialOpen);
  const [data, setData] = useState<SunnahResearch | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState<'grading' | 'commentary' | 'chain' | 'roots' | 'related' | 'sources'>('commentary');
  const [expanded, setExpanded] = useState(false);
  const [beside, setBeside] = useState(false);
  const [related, setRelated] = useState<{ label: string; words?: string[]; hits: SunnahSearchHit[] } | null>(null);
  const [narrator, setNarrator] = useState<string | null>(null);
  const [relatedBusy, setRelatedBusy] = useState(false);
  const [gradingRequest, setGradingRequest] = useState<number | undefined>();
  if (showGrading !== gradingRequest) {
    setGradingRequest(showGrading);
    if (showGrading) { setOpen(true); setTab('grading'); }
  }
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      const result = await window.electronAPI?.sunnah.research?.(id);
      if (!cancelled) { setFailed(!result?.ok); if (result?.ok) setData(result.data); }
    };
    void load().catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [id, open, retry]);
  const find = async (query: SunnahResearchQuery, label: string, words?: string[]) => {
    setRelatedBusy(true); setRelated(null); setFailed(false);
    try {
      const result = await window.electronAPI?.sunnah.search?.(query);
      if (!result?.ok) throw new Error('Search unavailable');
      setRelated({ label, words, hits: result.data });
    } catch { setFailed(true); }
    finally { setRelatedBusy(false); }
  };
  const openAyah = async (ayah: string) => {
    try { await navigateStudyReference(`quran:hafs:${ayah}`, [], () => {}, () => {}); }
    catch { setFailed(true); }
  };
  const openSource = async (kind: 'commentary' | 'matn') => {
    try { const result = await window.electronAPI?.sunnah.openSource?.(id, kind); if (!result?.ok) setFailed(true); }
    catch { setFailed(true); }
  };
  return <details className="sunnah-research" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t('sunnahResearch')}{!sourceBook && <span>{t('sunnahResearchSource')}</span>}</summary>
    {open && <div className="sunnah-research-body">
      <p className="sunnah-research-notice">{t('sunnahResearchNotice')}</p>
      <PersonalCommentary reference={`hadith:${id}`} />
      {failed && <p role="alert">{t('sunnahResearchError')} <button type="button" className="sunnah-button" onClick={() => { setFailed(false); setRetry(n => n + 1); }}>{t('sunnahRetry')}</button></p>}
      {!data && !failed && <p role="status">{t('sunnahLoading')}</p>}
      {data && <>
        <div className="sunnah-research-tabs" role="group" aria-label={t('sunnahResearch')}>
          {([...(data.merged ? ['grading'] as const : []), 'commentary', 'chain', 'roots', 'related', ...(data.merged ? ['sources'] as const : [])] as const).map(item => <button type="button" key={item} aria-pressed={tab === item} onClick={() => { setTab(item); setRelated(null); setNarrator(null); }}>
            {t(({ grading: 'sunnahGradingTab', commentary: 'sunnahTafseel', chain: 'sunnahChain', roots: 'sunnahRoots', related: 'sunnahRelated', sources: 'sunnahSourcesTab' } as const)[item])}
            <bdi>{item === 'grading' ? data.merged?.judgments.length ?? 0 : item === 'sources' ? (data.merged?.variants.length ?? 0) + (data.merged?.explanations.length ?? 0) : item === 'chain' ? data.nodes.length : item === 'roots' ? data.roots.length : item === 'related' ? data.related.length : data.commentary ? '1' : '0'}</bdi>
          </button>)}
        </div>
        {tab === 'grading' && data.merged && <SunnahGradingList data={data.merged} t={t} />}
        {tab === 'sources' && data.merged && <SunnahSourcesList data={data.merged} t={t} />}
        {tab === 'commentary' && <div>
          {data.commentary ? <>
            <div className="sunnah-research-citation"><strong dir="auto">{data.title}</strong><span dir="auto">{data.author}</span><span>{t('sunnahSourcePage', { volume: data.volume, page: data.page })}</span><bdi>{data.reference}</bdi></div>
            <p className="sunnah-research-caption">{t('sunnahTextMatchScore', { score: Math.round(data.score * 100) })}{matchMethodKeys[data.method] && <> · {t(matchMethodKeys[data.method])}</>}</p>
            {data.sourceUrl && <button type="button" className="sunnah-button" onClick={() => void openSource('commentary')}>{t('sunnahOpenSource')}</button>}{' '}
            <button type="button" className="sunnah-button" aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{t(expanded ? 'sunnahCollapseText' : 'sunnahExpandText')}</button>
            {matn && <>{' '}<button type="button" className="sunnah-button" aria-pressed={beside} onClick={() => setBeside(value => !value)}>{t('sunnahBesideHadith')}</button></>}
            <div className={beside ? 'sunnah-beside' : undefined}>
              {beside && <div className="sunnah-research-text is-expanded" tabIndex={0} dir="rtl" lang="ar">{matn}</div>}
              <div className={`sunnah-research-text ${expanded || beside ? 'is-expanded' : ''}`} tabIndex={0} dir="rtl" lang="ar">{data.commentary}</div>
            </div>
          </> : <p className="sunnah-research-empty">{t('sunnahNoTafseel')}</p>}
          {data.matnUrl && <p className="mt-3"><button type="button" className="sunnah-button" onClick={() => void openSource('matn')}>{t('sunnahOpenMatnSource')}</button></p>}
        </div>}
        {tab === 'chain' && <>
          {data.nodes.length > 0 && <p className="sunnah-research-caption">{t('sunnahCalibration', { score: Math.round(data.calibration * 100) })}</p>}
          <p className="sunnah-research-caption">{t('sunnahResolvedCount', { resolved: data.nodes.filter(node => node.rijal_id).length, total: data.nodes.length })}</p>
          <p className="sunnah-research-caption">{t('sunnahWeakestTier')}: {t(tierKeys[data.weakest] || 'sunnahTierUngraded')}</p>
          <ol className="sunnah-chain-list">{data.nodes.map(node => <li key={node.pos}>
            <bdi>{node.path + 1}.{node.pos}</bdi><div><span dir="rtl" lang="ar">{node.surface}</span>
              {node.rijal_id ? <button type="button" disabled={relatedBusy} onClick={() => void find({ narratorId: node.rijal_id! }, node.resolved_name)} dir="rtl" lang="ar">{node.resolved_name}</button> : <small>{node.candidate_count ? t('sunnahNarratorCandidates', { count: node.candidate_count }) : t('sunnahUnresolvedNarrator')}</small>}
              {node.grade_ar && <p dir="rtl" lang="ar">{node.grade_ar}</p>}
              {node.rijal_id && <small>{[node.grade_tier && t(tierKeys[node.grade_tier] || 'sunnahTierUngraded'), node.death_ah && t('sunnahNarratorDeath', { year: node.death_ah })].filter(item => item && item !== node.grade_ar).join(' · ')}</small>}
              {node.rijal_id && <small><button type="button" className="sunnah-narrator-open" aria-expanded={narrator === node.rijal_id} onClick={() => setNarrator(current => current === node.rijal_id ? null : node.rijal_id)}>{t('sunnahNarratorProfile')}</button></small>}
              {narrator && narrator === node.rijal_id && <SunnahNarratorCard key={narrator} id={narrator} t={t} onHadiths={(rijalId, name) => void find({ narratorId: rijalId }, name)} />}</div>
          </li>)}</ol>
          {!data.nodes.length && <p>{t('sunnahNoResults')}</p>}
        </>}
        {tab === 'roots' && <>
          <p className="sunnah-research-caption">{t('sunnahRootHint')}</p>
          <div className="sunnah-root-chips">{data.roots.map(root => <button type="button" key={root} disabled={relatedBusy} onClick={() => void find({ root }, root, data.rootWords[root])} dir="rtl" lang="ar">{root}</button>)}</div>
          <h4>{t('sunnahAyahLinks')}</h4><div className="sunnah-root-chips">{data.ayahs.map(ayah => <button type="button" key={ayah} onClick={() => void openAyah(ayah)}><bdi>{ayah}</bdi></button>)}</div>
          {!data.roots.length && <p>{t('sunnahNoResults')}</p>}
        </>}
        {tab === 'related' && <><p className="sunnah-research-caption">{t('sunnahRelatedHint')}</p><ResultLinks hits={data.related} t={t} />{!data.related.length && <p>{t('sunnahNoResults')}</p>}</>}
        {relatedBusy && <p role="status">{t('sunnahLoading')}</p>}
        {related && <section className="sunnah-relation-results"><h4 dir="auto">{related.label}</h4>{related.words && related.words.length > 0 && <p><span>{t('sunnahRootWords')}: </span><bdi dir="rtl" lang="ar">{related.words.join(' · ')}</bdi></p>}<p>{t('sunnahRelatedLimit')}</p><ResultLinks hits={related.hits} t={t} />{!related.hits.length && <p>{t('sunnahNoResults')}</p>}</section>}
      </>}
    </div>}
  </details>;
}
