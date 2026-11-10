'use client';

import React, { memo, useState } from 'react';
import { Focus } from 'lucide-react';
import type { SunnahChapter, SunnahHadith, SunnahLanguage, SunnahPassage, SunnahText } from '../../../shared/types/sunnah';
import type { TranslationKey } from '../../translations';
import { isnadTokens, splitSunnahPassage } from '../../libs/sunnah/text';
import { ContextMenu } from '../ui/ContextMenu';
import { contextActions } from '../actions/context-actions';
import { addPassageToSrs, openPassageComment, passageNote, linkPassageToNote, sharePassage } from '../actions/passage-actions';
import { HadithActions, formatHadith } from './HadithActions';
import { SunnahResearchPanel } from './SunnahResearchPanel';

export type SunnahTranslate = (key: TranslationKey, params?: Record<string, string | number>) => string;

function ParallelRow({ showEnglish, arabic, english, className = '' }: {
  showEnglish: boolean; arabic: React.ReactNode; english: React.ReactNode; className?: string;
}) {
  return <div className={`sunnah-parallel ${showEnglish ? 'sunnah-bilingual' : ''} ${className}`} dir="ltr">
    <div className="sunnah-arabic" dir="rtl" lang="ar">{arabic}</div>
    {showEnglish && <div className="sunnah-english" dir="ltr" lang="en">{english}</div>}
  </div>;
}

const Passage = memo(function Passage({ passage, language, t }: { passage: SunnahPassage; language: SunnahLanguage; t: SunnahTranslate }) {
  const { isnad, matn, segmented } = splitSunnahPassage(passage);
  if (!isnad && !matn) return <p className="text-muted text-sm italic leading-relaxed">{t(language === 'ar' ? 'sunnahMissingArabic' : 'sunnahMissingEnglish')}</p>;
  return <p className="sunnah-passage">
    {isnad && <span className="text-muted" data-isnad="true">{language === 'ar'
      ? isnadTokens(isnad).map((token, index) => <span key={index} data-card-hover={token.narrator || undefined} className={token.narrator ? 'sunnah-narrator' : undefined}>{token.text}</span>)
      : <span className="sunnah-narrator">{isnad}</span>}</span>}
    {!passage.full && isnad && matn && ' '}
    <span className="font-semibold text-main" data-matn="true">{matn}</span>
    {!segmented && passage.isnad && <span className="block mt-3 text-sm font-sans text-muted">{t('sunnahUnaligned')}</span>}
  </p>;
});

function NumberedTitle({ number, title, language, fallback }: { number: string; title: SunnahText; language: SunnahLanguage; fallback: string }) {
  return <><bdi className="sunnah-number" dir="ltr">{number}</bdi><span>{title[language] || fallback}</span></>;
}

export function SunnahChapterView({ chapter, hadiths, showEnglish, single, t, onFocus }: {
  chapter: SunnahChapter;
  hadiths: SunnahHadith[];
  showEnglish: boolean;
  single: boolean;
  t: SunnahTranslate;
  onFocus: (id: string) => void;
}) {
  const [gradingRequest, setGradingRequest] = useState({ id: 0, count: 0 });
  return <div className="sunnah-chapter select-text" data-testid="sunnah-chapter">
    <ParallelRow showEnglish={showEnglish} className="sunnah-chapter-heading"
      arabic={<h2><NumberedTitle number={String(chapter.number)} title={chapter.title} language="ar" fallback={t('sunnahUntitledChapter')} /></h2>}
      english={<h2><NumberedTitle number={String(chapter.number)} title={chapter.title} language="en" fallback={t('sunnahMissingEnglish')} /></h2>} />
    {hadiths.map((hadith, index) => {
      const previous = hadiths[index - 1]?.section;
      const section = hadith.section;
      const showSection = index === 0 || previous.number !== section.number || previous.title.ar !== section.title.ar || previous.title.en !== section.title.en;
      const hasSection = section.number || section.title.ar || section.title.en;
      const target = 'sunnah:' + chapter.collection + ':' + chapter.number + ':' + hadith.id;
      const label = chapter.title.ar + ' · ' + hadith.number;
      const reference = formatHadith(chapter, hadith, showEnglish, false, true);
      const items = contextActions('hadith', {
        copy: () => navigator.clipboard.writeText(reference),
        copyFull: () => navigator.clipboard.writeText(formatHadith(chapter, hadith, showEnglish, true, true)),
        share: () => sharePassage(reference),
        comment: () => hadith.researchId ? openPassageComment('hadith:'+hadith.researchId) : passageNote(target,label,reference),
        srs: () => addPassageToSrs({ text: reference, sourceKind: 'hadith', sourceRef: target, sourceLabel: label, language: showEnglish ? 'en' : 'ar' }),
        commentary: hadith.comment || hadith.researchId ? () => {
          const root = [...document.querySelectorAll<HTMLElement>('[data-hadith-id]')].find(element => element.dataset.hadithId === hadith.id);
          const details = root?.querySelector<HTMLDetailsElement>('details'); if(details){ details.open=true; details.scrollIntoView({block:'nearest'}); }
        } : undefined,
        link: () => linkPassageToNote(target,label),
      },t);
      return <ContextMenu items={items} key={hadith.id} className="sunnah-entry" data-hadith-id={hadith.id} data-card-kind="hadith" data-card-ref={`hadith:${chapter.collection}:${hadith.id}`} data-card-label={`${chapter.collection} ${hadith.number}`} data-card-research={hadith.researchId}>
        {showSection && hasSection && <ParallelRow showEnglish={showEnglish} className="sunnah-section-heading"
          arabic={<h3><NumberedTitle number={section.number} title={section.title} language="ar" fallback="" /></h3>}
          english={<h3><NumberedTitle number={section.number} title={section.title} language="en" fallback="" /></h3>} />}
        <article className="sunnah-hadith" aria-label={t('sunnahHadithNumber', { number: hadith.number || '—' })}>
          <div className="flex items-center justify-between gap-3 mb-4 text-xs font-sans text-muted">
            <span className="font-bold">{t('sunnahHadithNumber', { number: hadith.number || '—' })}</span>
            {hadith.researchId !== undefined && <button type="button" className="sunnah-button" onClick={event => {
              const panel = event.currentTarget.closest('article')?.querySelector<HTMLDetailsElement>('.sunnah-research');
              if (panel) { panel.open = true; panel.scrollIntoView({ block: 'start' }); }
            }}>{t('sunnahResearch')}</button>}
            {!single && <button type="button" onClick={() => onFocus(hadith.id)} className="sunnah-icon-button" title={t('sunnahOpenHadith')} aria-label={t('sunnahOpenHadith')}><Focus size={17} /></button>}
          </div>
          <ParallelRow showEnglish={showEnglish}
            arabic={<Passage passage={hadith.text.ar} language="ar" t={t} />}
            english={<Passage passage={hadith.text.en} language="en" t={t} />} />
          {!['Bukhari', 'Muslim'].includes(chapter.collection) && (hadith.grade.ar || (showEnglish && hadith.grade.en)) && <ParallelRow showEnglish={showEnglish} className="sunnah-grade"
            arabic={hadith.grade.ar && <p><span className="text-muted">{t('sunnahGrade')}: </span>{hadith.grade.ar}</p>}
            english={hadith.grade.en && <p><span className="text-muted">{t('sunnahGrade')}: </span>{hadith.grade.en}</p>} />}
          {hadith.sourceBook && hadith.sourceBook.kind !== 'collection' && <p className={`sunnah-grading-flag ${hadith.sourceBook.kind === 'review' ? 'is-opposed' : ''}`} role="note">{t(hadith.sourceBook.kind === 'review' ? 'sunnahReviewNotice' : 'sunnahSourceOnlyNotice')}</p>}
          {hadith.gradingSummary && <p className="sunnah-grading-line">
            <button type="button" className="sunnah-button" onClick={event => {
              setGradingRequest(current => ({ id: hadith.researchId!, count: current.count + 1 }));
              event.currentTarget.closest('article')?.querySelector('.sunnah-research')?.scrollIntoView({ block: 'start' });
            }}>{t('sunnahGradingLine', { count: hadith.gradingSummary.count })}</button>
            {hadith.gradingSummary.opposed ? <span className="is-opposed">{t('sunnahGradingOpposed')}</span> : hadith.gradingSummary.wordingDiffers && <span>{t('sunnahGradingDiffers')}</span>}
          </p>}
          {hadith.translation && showEnglish && <p className="sunnah-research-caption" dir="ltr" lang="en">{t('sunnahVariantEnglishUsed')}{hadith.translation.partial && <> {t('sunnahVariantEnglishPartial')}</>}</p>}
          {hadith.comment && <details className="mt-5 border-t border-subtle pt-3 text-sm">
            <summary className="cursor-pointer text-muted font-sans">{t('sunnahComment')}</summary>
            <p className="font-reading text-lg leading-loose mt-2 whitespace-pre-wrap" dir="rtl" lang="ar">{hadith.comment}</p>
          </details>}
          {hadith.researchId !== undefined && <SunnahResearchPanel key={hadith.researchId} id={hadith.researchId} matn={hadith.text.ar.matn || hadith.text.ar.full} initialOpen={single} showGrading={gradingRequest.id === hadith.researchId ? gradingRequest.count : undefined} sourceBook={Boolean(hadith.sourceBook)} t={t} />}
          <HadithActions chapter={chapter} hadith={hadith} showEnglish={showEnglish} t={t} />
        </article>
      </ContextMenu>;
    })}
  </div>;
}
