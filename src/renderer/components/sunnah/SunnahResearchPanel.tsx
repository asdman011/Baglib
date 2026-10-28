'use client';

import React, { useEffect, useState } from 'react';
import type { SunnahResearch, SunnahResearchQuery, SunnahSearchHit } from '../../../shared/types/sunnah';
import type { SunnahTranslate } from './SunnahChapterView';
import { collectionKeys } from '../../utils/sunnah-collections';
import { openSunnahReference, navigateStudyReference } from '../../utils/study-navigation';
import type { TranslationKey } from '../../translations';

const tierKeys: Record<string, TranslationKey> = { Sahabi:'sunnahTierSahabi', 'Thiqah Thabt':'sunnahTierThabt', Thiqah:'sunnahTierThiqah', Saduq:'sunnahTierSaduq', 'Saduq Yahim':'sunnahTierYahim', 'Maqbul / Layyin':'sunnahTierLayyin', 'Majhul al-Hal':'sunnahTierMajhulHal', Majhul:'sunnahTierMajhul', "Da'if":'sunnahTierDaif', "Da'if Jiddan":'sunnahTierDaifJiddan', Matruk:'sunnahTierMatruk', Kadhdhab:'sunnahTierKadhdhab', Ungraded:'sunnahTierUngraded' };

function ResultLinks({ hits, t }: { hits: SunnahSearchHit[]; t: SunnahTranslate }) {
  return <div className="sunnah-research-results">{hits.slice(0, 30).map(hit => <button type="button" key={hit.hadith.id} onClick={() => openSunnahReference({ collection: hit.chapter.collection, chapter: hit.chapter.number, hadith: hit.hadith.id })}>
    <span>{t(collectionKeys[hit.chapter.collection])} · {t('sunnahHadithNumber', { number: hit.hadith.number })}</span>
    <span dir="rtl" lang="ar">{(hit.hadith.text.ar.matn || hit.hadith.text.ar.full).slice(0, 180)}</span>
  </button>)}</div>;
}

export function SunnahResearchPanel({ id, initialOpen, t }: { id: number; initialOpen: boolean; t: SunnahTranslate }) {
  const [open, setOpen] = useState(initialOpen);
  const [data, setData] = useState<SunnahResearch | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState<'commentary' | 'chain' | 'roots' | 'related'>('commentary');
  const [expanded, setExpanded] = useState(false);
  const [related, setRelated] = useState<{ label: string; hits: SunnahSearchHit[] } | null>(null);
  const [relatedBusy, setRelatedBusy] = useState(false);
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
  const find = async (query: SunnahResearchQuery, label: string) => {
    setRelatedBusy(true); setRelated(null); setFailed(false);
    try {
      const result = await window.electronAPI?.sunnah.search?.(query);
      if (!result?.ok) throw new Error('Search unavailable');
      setRelated({ label, hits: result.data });
    } catch { setFailed(true); }
    finally { setRelatedBusy(false); }
  };
  const openAyah = async (ayah: string) => {
    try { await navigateStudyReference(`quran:hafs:${ayah}`, [], () => {}, () => {}); }
    catch { setFailed(true); }
  };
  const openSource = async () => {
    try { const result = await window.electronAPI?.sunnah.openSource?.(id); if (!result?.ok) setFailed(true); }
    catch { setFailed(true); }
  };
  return <details className="sunnah-research" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t('sunnahResearch')}<span>{t('sunnahResearchSource')}</span></summary>
    {open && <div className="sunnah-research-body">
      <p className="sunnah-research-notice">{t('sunnahResearchNotice')}</p>
      {failed && <p role="alert">{t('sunnahResearchError')} <button type="button" className="sunnah-button" onClick={() => { setFailed(false); setRetry(n => n + 1); }}>{t('sunnahRetry')}</button></p>}
      {!data && !failed && <p role="status">{t('sunnahLoading')}</p>}
      {data && <>
        <div className="sunnah-research-tabs" role="group" aria-label={t('sunnahResearch')}>
          {(['commentary', 'chain', 'roots', 'related'] as const).map(item => <button type="button" key={item} aria-pressed={tab === item} onClick={() => { setTab(item); setRelated(null); }}>
            {t(({ commentary: 'sunnahTafseel', chain: 'sunnahChain', roots: 'sunnahRoots', related: 'sunnahRelated' } as const)[item])}
            <bdi>{item === 'chain' ? data.nodes.length : item === 'roots' ? data.roots.length : item === 'related' ? data.related.length : data.commentary ? '1' : '0'}</bdi>
          </button>)}
        </div>
        {tab === 'commentary' && <div>
          {data.commentary ? <>
            <div className="sunnah-research-citation"><strong dir="auto">{data.title}</strong><span dir="auto">{data.author}</span><span>{t('sunnahSourcePage', { volume: data.volume, page: data.page })}</span><bdi>{data.reference}</bdi></div>
            <p className="sunnah-research-caption">{t('sunnahTextMatchScore', { score: Math.round(data.score * 100) })}</p>
            {data.sourceUrl && <button type="button" className="sunnah-button" onClick={() => void openSource()}>{t('sunnahOpenSource')}</button>}{' '}
            <button type="button" className="sunnah-button" aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{t(expanded ? 'sunnahCollapseText' : 'sunnahExpandText')}</button>
            <div className={`sunnah-research-text ${expanded ? 'is-expanded' : ''}`} tabIndex={0} dir="rtl" lang="ar">{data.commentary}</div>
          </> : <p className="sunnah-research-empty">{t('sunnahNoTafseel')}</p>}
        </div>}
        {tab === 'chain' && <>
          <p className="sunnah-research-caption">{t('sunnahCalibration', { score: Math.round(data.calibration * 100) })}</p>
          <p className="sunnah-research-caption">{t('sunnahResolvedCount', { resolved: data.nodes.filter(node => node.rijal_id).length, total: data.nodes.length })}</p>
          <p className="sunnah-research-caption">{t('sunnahWeakestTier')}: {t(tierKeys[data.weakest] || 'sunnahTierUngraded')}</p>
          <ol className="sunnah-chain-list">{data.nodes.map(node => <li key={node.pos}>
            <bdi>{node.path + 1}.{node.pos}</bdi><div><span dir="rtl" lang="ar">{node.surface}</span>
              {node.rijal_id ? <button type="button" disabled={relatedBusy} onClick={() => void find({ narratorId: node.rijal_id! }, node.resolved_name)} dir="rtl" lang="ar">{node.resolved_name}</button> : <small>{t('sunnahUnresolvedNarrator')}</small>}
              {node.grade_ar && <p dir="rtl" lang="ar">{node.grade_ar}</p>}</div>
          </li>)}</ol>
          {!data.nodes.length && <p>{t('sunnahNoResults')}</p>}
        </>}
        {tab === 'roots' && <>
          <p className="sunnah-research-caption">{t('sunnahRootHint')}</p>
          <div className="sunnah-root-chips">{data.roots.map(root => <button type="button" key={root} disabled={relatedBusy} onClick={() => void find({ root }, root)} dir="rtl" lang="ar">{root}</button>)}</div>
          <h4>{t('sunnahAyahLinks')}</h4><div className="sunnah-root-chips">{data.ayahs.map(ayah => <button type="button" key={ayah} onClick={() => void openAyah(ayah)}><bdi>{ayah}</bdi></button>)}</div>
          {!data.roots.length && <p>{t('sunnahNoResults')}</p>}
        </>}
        {tab === 'related' && <><p className="sunnah-research-caption">{t('sunnahRelatedHint')}</p><ResultLinks hits={data.related} t={t} />{!data.related.length && <p>{t('sunnahNoResults')}</p>}</>}
        {relatedBusy && <p role="status">{t('sunnahLoading')}</p>}
        {related && <section className="sunnah-relation-results"><h4 dir="auto">{related.label}</h4><p>{t('sunnahRelatedLimit')}</p><ResultLinks hits={related.hits} t={t} />{!related.hits.length && <p>{t('sunnahNoResults')}</p>}</section>}
      </>}
    </div>}
  </details>;
}
