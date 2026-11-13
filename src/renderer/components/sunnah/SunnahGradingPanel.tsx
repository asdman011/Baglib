'use client';

import React from 'react';
import type { SunnahGradingJudgment, SunnahMergedResearch } from '../../../shared/types/sunnah';
import type { TranslationKey } from '../../translations';
import type { SunnahTranslate } from './SunnahChapterView';

const scopeKeys: Record<string, TranslationKey> = { hadith: 'sunnahScopeHadith', isnad: 'sunnahScopeIsnad', transmission_attribution: 'sunnahScopeTransmission', mixed_isnad_and_attribution: 'sunnahScopeMixed' };
const partKeys: Record<string, TranslationKey> = { opening_report_of_row: 'sunnahPartOpening', report_inside_row: 'sunnahPartInner', source_record_longer_than_row: 'sunnahPartLonger', cited_report_not_chain_specific: 'sunnahPartCited' };
const roleKeys: Record<string, TranslationKey> = { scholar: 'sunnahRoleScholar', editor: 'sunnahRoleEditor', institution: 'sunnahRoleInstitution' };

function Grader({ judgment, t }: { judgment: SunnahGradingJudgment; t: SunnahTranslate }) {
  if (!judgment.graderRaw) return <strong>{t(judgment.graderRole === 'edition_note' ? 'sunnahGraderEditionNote' : 'sunnahGraderUnattributed')}</strong>;
  if (judgment.graderAr) return <strong dir="rtl" lang="ar">{judgment.graderAr}</strong>;
  return <><strong dir="ltr" lang="en">{judgment.graderRaw}</strong> <small>{t('sunnahGraderUnverifiedName')}</small></>;
}

function Judgment({ judgment, names, t }: { judgment: SunnahGradingJudgment; names: Map<string, string>; t: SunnahTranslate }) {
  const unresolved = judgment.gradeArStatus === 'unresolved' || judgment.reviewStatus === 'needs_review';
  return <li className="sunnah-judgment" data-origin={judgment.origin}>
    <div className="sunnah-judgment-head">
      <Grader judgment={judgment} t={t} />
      {roleKeys[judgment.graderRole] && <small>{t(roleKeys[judgment.graderRole])}</small>}
    </div>
    <p className="sunnah-judgment-grade">
      {judgment.gradeAr ? <span dir="rtl" lang="ar">{judgment.gradeAr}</span> : <span dir="auto">{judgment.gradeRaw}</span>}
    </p>
    <p className="sunnah-judgment-meta">
      <span>{t(scopeKeys[judgment.scope] ?? 'sunnahScopeUnresolved')}</span>
      {judgment.gradeArStatus === 'glossary' && <span>{t('sunnahGradeGlossary')}</span>}
      {judgment.gradeArStatus === 'source_arabic' && <span>{t('sunnahGradeSourceArabic')}</span>}
      {unresolved && <span className="is-unresolved">{t('sunnahGradeUnreviewed')}</span>}
    </p>
    {partKeys[judgment.assessedPart] && <p className="sunnah-judgment-part">{t(partKeys[judgment.assessedPart])}</p>}
    {judgment.sameLabelAs.length > 0 && <p className="sunnah-judgment-part">{t('sunnahGradeSameLabel', { names: judgment.sameLabelAs.map(name => names.get(name) ?? name).join('، ') })}</p>}
    <details>
      <summary>{t('sunnahGradeDetails')}</summary>
      <dl>
        <dt>{t('sunnahGradeRawLabel')}</dt><dd dir="auto">{judgment.gradeRaw}{judgment.gradeAlt && <> · {judgment.gradeAlt}</>}</dd>
        {judgment.graderRaw && <><dt>{t('sunnahGraderRawLabel')}</dt><dd dir="ltr">{judgment.graderRaw}</dd></>}
        <dt>{t('sunnahSourceRecord')}</dt><dd dir="ltr">{[judgment.dataset, judgment.config, judgment.fieldPath].filter(Boolean).join(' · ')}</dd>
        <dt>{t('sunnahUpstream')}</dt><dd dir="ltr">{judgment.lineage.join(' · ')}</dd>
        {judgment.note && <><dt>{t('sunnahSourceNote')}</dt><dd dir="auto" lang="ar">{judgment.note}</dd></>}
      </dl>
    </details>
  </li>;
}

/** Al-Albani's rulings come first (the user's choice, KEY-334); everything else keeps the corpus order. */
const isAlbani = (judgment: SunnahMergedResearch['judgments'][number]) => judgment.graderAr.trim() === 'الألباني' || /alban[iy]/iu.test(judgment.graderRaw);
export function orderJudgments(judgments: SunnahMergedResearch['judgments']) {
  return [...judgments.filter(isAlbani), ...judgments.filter(judgment => !isAlbani(judgment))];
}

export function SunnahGradingList({ data, t }: { data: SunnahMergedResearch; t: SunnahTranslate }) {
  const names = new Map(data.judgments.map(item => [item.graderRaw, item.graderAr || item.graderRaw]));
  const judgments = orderJudgments(data.judgments);
  return <div>
    <p className="sunnah-research-caption">{t('sunnahGradingNotice')}</p>
    {data.opposed ? <p className="sunnah-grading-flag is-opposed" role="note">{t('sunnahGradingOpposed')}</p> : data.wordingDiffers && <p className="sunnah-grading-flag" role="note">{t('sunnahGradingDiffers')}</p>}
    {judgments.length ? <ol className="sunnah-judgments">{judgments.map(judgment => <Judgment key={judgment.id} judgment={judgment} names={names} t={t} />)}</ol> : <p className="sunnah-research-empty">{t('sunnahGradingEmpty')}</p>}
  </div>;
}

export function SunnahSourcesList({ data, t }: { data: SunnahMergedResearch; t: SunnahTranslate }) {
  return <div className="sunnah-sources">
    {data.explanations.length > 0 && <section><h4>{t('sunnahExplanation')}</h4>{data.explanations.map(item => <div key={`${item.sourceKey}:${item.language}`} className="sunnah-source-text">
      <strong dir="auto" lang={item.language}>{item.title}</strong>
      <p dir="auto" lang={item.language}>{item.explanation}</p>
      <small dir="auto">{item.citation}</small>
      <small dir="ltr">{item.attribution}</small>
    </div>)}</section>}
    {data.variants.length > 0 && <section><h4>{t('sunnahVariantEnglish')}</h4>{data.variants.map(item => <div key={item.sourceKey} className="sunnah-source-text">
      <p dir="ltr" lang="en">{item.text}</p>
      <small dir="ltr">{item.sourceKey} · {item.attribution}</small>
      <small dir="ltr">{item.license}</small>
    </div>)}</section>}
    <section><h4>{t('sunnahFieldSources')}</h4><ul className="sunnah-field-sources">{data.fieldSources.map(item => <li key={`${item.source}:${item.transformation}`}>
      <strong dir="ltr">{item.dataset || item.source}</strong>
      <small dir="ltr">{item.record} · {item.transformation}</small>
      {item.unresolved && <small className="is-unresolved">{t('sunnahUpstreamUnresolved')}</small>}
      <small dir="ltr">{item.fields.join(', ')}</small>
    </li>)}</ul>
    {data.missingFields.length > 0 && <p className="sunnah-research-caption">{t('sunnahMissingFields')}: <bdi dir="ltr">{data.missingFields.join(', ')}</bdi></p>}
    </section>
  </div>;
}
