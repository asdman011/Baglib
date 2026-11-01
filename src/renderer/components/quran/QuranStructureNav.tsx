'use client';

import React from 'react';
import type { QuranDivision, QuranMushafPage, QuranStructure } from '../../../shared/types/quran';
import type { TranslationKey } from '../../translations';
import { quranDivisionAt } from '../../../shared/quran-structure';

const jumpTo = (division: QuranDivision | undefined, onNavigate: (reference: { surah: number; ayah: number }) => void) => {
  if (!division) return;
  const [surah, ayah] = division.first.split(':').map(Number);
  onNavigate({ surah, ayah });
};

export function QuranStructureNav({ structure, page, t, lang, onNavigate }: {
  structure: QuranStructure;
  page: QuranMushafPage;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  lang: 'ar' | 'en';
  onNavigate: (reference: { surah: number; ayah: number }) => void;
}) {
  const number = new Intl.NumberFormat(lang);
  const juz = quranDivisionAt(structure.juz, page.surahStart, page.ayahStart);
  const hizb = quranDivisionAt(structure.hizb, page.surahStart, page.ayahStart);
  const rub = quranDivisionAt(structure.rub, page.surahStart, page.ayahStart);
  const manzil = quranDivisionAt(structure.manzil, page.surahStart, page.ayahStart);
  const ruku = quranDivisionAt(structure.ruku, page.surahStart, page.ayahStart);
  const onPage = new Set(page.words.map(word => `${word.surah}:${word.ayah}`));
  const sajdah = structure.sajdah.filter(item => onPage.has(item.reference));
  const facts = [rub && `${t('quranRub')} ${number.format(rub.number)}`, manzil && `${t('quranManzil')} ${number.format(manzil.number)}`, ruku && `${t('quranRuku')} ${number.format(ruku.surahRuku ?? ruku.number)}`].filter(Boolean);
  const selector = (label: TranslationKey, divisions: QuranDivision[], current: QuranDivision | undefined) => divisions.length > 0 && <select aria-label={t(label)} value={current?.number ?? ''} onChange={event => jumpTo(divisions.find(division => division.number === Number(event.target.value)), onNavigate)} className="w-full min-w-0 bg-surface border border-subtle rounded-lg p-1.5 text-xs">
    {divisions.map(division => <option key={division.number} value={division.number}>{t(label)} {number.format(division.number)}</option>)}
  </select>;
  return <div data-quran-structure>
    <div className="mt-1 grid grid-cols-2 gap-1">
      {selector('quranJuz', structure.juz, juz)}
      {selector('quranHizb', structure.hizb, hizb)}
    </div>
    {facts.length > 0 && <p className="mt-1 px-1 text-[11px] leading-relaxed text-muted">{facts.join(' · ')}</p>}
    {sajdah.map(item => <button key={item.number} type="button" title={t('quranSajdaSourceHint')} onClick={() => { const [surah, ayah] = item.reference.split(':').map(Number); onNavigate({ surah, ayah }); }} className="mt-1 block w-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-start text-[11px] leading-relaxed">{t(item.type === 'required' ? 'quranSajdaRequired' : 'quranSajdaOptional', { reference: item.reference })}</button>)}
  </div>;
}
