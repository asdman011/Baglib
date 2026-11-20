'use client';

import React, { useEffect, useState } from 'react';
import { Copy, Share2, SlidersHorizontal } from 'lucide-react';
import type { SunnahChapter, SunnahHadith } from '../../../shared/types/sunnah';
import type { SunnahTranslate } from './SunnahChapterView';
import { shortenArabicChain, splitSunnahPassage } from '../../libs/sunnah/text';
import { translations, type TranslationKey } from '../../translations';
import { collectionKeys as names } from '../../utils/sunnah-collections';
import { passageNote } from '../actions/passage-actions';
import { getSunnahIsnadScope, setSunnahIsnadScope } from '../../utils/corpus-lookup';
import { formatPassageWithAnnotations, getShareSourceOnlyPref } from '../../utils/share-with-annotations';
import { openExplainBack } from '../ai/ExplainBackModal';

export function formatHadith(
  chapter: SunnahChapter,
  hadith: SunnahHadith,
  english: boolean,
  isnad: boolean,
  reference: boolean,
  unsplitNotice?: { ar?: string; en?: string }
): string {
  const parts = (english ? ['ar', 'en'] as const : ['ar'] as const).map(language => {
    const passage = hadith.text[language];
    if (language === 'ar' && isnad && !reference) return shortenArabicChain(passage);
    if (isnad) {
      return passage.full || [passage.isnad, passage.matn].filter(Boolean).join(' ');
    }
    const split = splitSunnahPassage(passage);
    const explicitSplit = Boolean(passage.isnad) && Boolean(passage.matn) && passage.matn !== passage.full;
    if (explicitSplit || split.segmented) {
      return (explicitSplit ? passage.matn : split.matn).trim();
    }
    const notice = (unsplitNotice && unsplitNotice[language]) || (language === 'ar' ? 'تنبيه: الإسناد والمتن غير مفصولين في المصدر، أُدرج النص كاملاً' : 'Note: Isnad and matn are unsegmented in source, full text included');
    const whole = (passage.full || passage.matn).trim();
    return `[${notice}]\n${whole}`;
  }).filter(Boolean);
  if (reference) {
    for (const language of english ? ['ar', 'en'] as const : ['ar'] as const) {
      parts.push([translations[language][names[chapter.collection]], `${chapter.number} — ${chapter.title[language]}`, [hadith.section.number, hadith.section.title[language]].filter(Boolean).join(' — '), translations[language].sunnahHadithNumber.replace('{number}', hadith.number || '—')].filter(Boolean).join(' · '));
    }
  }
  return parts.join('\n\n');
}

export function HadithActions({ chapter, hadith, showEnglish, t }: { chapter: SunnahChapter; hadith: SunnahHadith; showEnglish: boolean; t: SunnahTranslate }) {
  const [englishOverride, setEnglishOverride] = useState<boolean | null>(null);
  const [includeIsnad, setIncludeIsnad] = useState(() => {
    return getSunnahIsnadScope() !== 'matn_only';
  });
  const [reference, setReference] = useState(true);
  const [sourceOnly, setSourceOnly] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    void getShareSourceOnlyPref().then(val => { if (alive) setSourceOnly(val); });
    return () => { alive = false; };
  }, []);
  const [sharing, setSharing] = useState(false);
  const key = `baglib:sunnah:reflection:${hadith.id}`;
  const [initial] = useState(() => {
    try { return { text: typeof localStorage === 'undefined' ? '' : localStorage.getItem(key) || '', available: true }; }
    catch { return { text: '', available: false }; }
  });
  const [note, setNote] = useState(initial.text);
  const [status, setStatus] = useState<TranslationKey | null>(null);
  const [noteStatus, setNoteStatus] = useState<TranslationKey | null>(initial.available ? null : 'sunnahSaveFailed');
  const english = englishOverride ?? showEnglish;
  const output = formatHadith(chapter, hadith, english, includeIsnad, reference, {
    ar: t('sunnahReaderUnsplitNotice'),
    en: translations.en.sunnahReaderUnsplitNotice,
  });
  const perform = async (share: boolean) => {
    setStatus(null);
    if (share) setSharing(true);
    try {
      const target = `sunnah:${chapter.collection}:${chapter.number}:${hadith.id}`;
      const formatted = await formatPassageWithAnnotations(
        output,
        { target, hadithId: hadith.id, hadithResearchId: hadith.researchId },
        english ? 'en' : 'ar',
        t,
        sourceOnly,
      );
      if (share) {
        const result = await window.electronAPI.sunnah.share(formatted);
        if (!result.ok) throw new Error(result.error);
        setStatus('sunnahShared');
      } else {
        await navigator.clipboard.writeText(formatted);
        setStatus('sunnahCopied');
      }
    } catch (error) { if ((error as Error).name !== 'AbortError') setStatus('sunnahActionFailed'); }
    finally { if (share) setSharing(false); }
  };
  return <footer className="mt-5 border-t border-subtle pt-3 space-y-3 text-sm font-sans">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="sunnah-button" onClick={() => passageNote(`sunnah:${chapter.collection}:${chapter.number}:${hadith.id}`, `${t(names[chapter.collection])} · ${hadith.number}`)}>{t('studyCaptureReference')}</button>
      <button
        type="button"
        className="sunnah-button"
        data-hadith-explain-back
        onClick={() => openExplainBack({
          kind: 'hadith',
          target: `sunnah:${chapter.collection}:${chapter.number}:${hadith.id}`,
          label: `${t(names[chapter.collection])} · ${hadith.number}`,
          sourceText: hadith.text.ar.full || hadith.text.ar.matn,
        })}
      >
        {t('explainBackAction')}
      </button>
      <button className="sunnah-button" onClick={() => void perform(false)}><Copy size={14} />{t('sunnahCopy')}</button>
      <button className="sunnah-button" disabled={sharing} aria-busy={sharing} onClick={() => void perform(true)}><Share2 size={14} />{t('sunnahShare')}</button>
      <button className="sunnah-button" aria-label={t('sunnahExportOptions')} title={t('sunnahExportOptions')} aria-expanded={optionsOpen} onClick={() => setOptionsOpen(open => !open)}><SlidersHorizontal size={14} /></button>
      {status && <span role="status" className="text-muted">{t(status)}</span>}
    </div>
    {optionsOpen && <div className="flex flex-wrap gap-4 py-3">
        <label><input type="checkbox" checked={english} onChange={event => setEnglishOverride(event.target.checked)} /> {t('sunnahEnglish')}</label>
        <label><input type="checkbox" checked={includeIsnad} onChange={event => {
          const checked = event.target.checked;
          setIncludeIsnad(checked);
          setSunnahIsnadScope(checked ? 'all' : 'matn_only');
        }} /> {t('sunnahIncludeIsnad')}</label>
        <label><input type="checkbox" checked={reference} onChange={event => setReference(event.target.checked)} /> {t('sunnahIncludeReference')}</label>
        <label><input type="checkbox" data-hadith-source-only checked={sourceOnly} onChange={event => setSourceOnly(event.target.checked)} /> {t('shareSourceOnly')}</label>
        <button className="sunnah-button" onClick={() => {
          setEnglishOverride(null);
          setIncludeIsnad(true);
          setReference(true);
          setSunnahIsnadScope('all');
          void getShareSourceOnlyPref().then(setSourceOnly);
        }}>{t('sunnahResetOptions')}</button>
      </div>}
    <div>
      <label className="block mt-3"><span>{t('sunnahReflection')}</span><textarea rows={2} dir="auto" value={note} className="block w-full resize-y p-3 mt-2 rounded-lg border border-subtle bg-canvas leading-loose" onChange={event => {
        const value = event.target.value; setNote(value);
        try { localStorage.setItem(key, value); setNoteStatus('sunnahSaved'); } catch { setNoteStatus('sunnahSaveFailed'); }
      }} /></label>
      {noteStatus && <p role="status">{t(noteStatus)}</p>}
    </div>
  </footer>;
}
