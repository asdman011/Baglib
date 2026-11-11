'use client';

import React, { useEffect, useState } from 'react';
import { CopyCheck, X, BookOpen, Copy } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import type { QuranSimilarAyah } from '../../../shared/types/quran';
import type { TranslationKey } from '../../translations';

export interface QuranSimilarAyahsDrawerProps {
  surah: number;
  ayah: number;
  similarAyahs: QuranSimilarAyah[];
  loading?: boolean;
  error?: boolean;
  surahName?: string;
  surahs?: { number: number; count: number; name?: string; arabic?: string }[];
  script?: string;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  lang: 'ar' | 'en';
  dir: 'rtl' | 'ltr';
  onClose: () => void;
  onNavigateAyah: (surah: number, ayah: number) => void;
  onCopy?: (text: string) => void;
  fetchAyahText?: (surah: number, ayah: number) => Promise<string | null>;
}

export function QuranSimilarAyahsDrawer({
  surah,
  ayah,
  similarAyahs,
  loading = false,
  error = false,
  surahName,
  surahs = [],
  script,
  t,
  lang,
  dir,
  onClose,
  onNavigateAyah,
  onCopy,
  fetchAyahText,
}: QuranSimilarAyahsDrawerProps) {
  const [verseTexts, setVerseTexts] = useState<Record<string, string>>({});
  const drawerRef = useDialogFocus(true, onClose);

  useEffect(() => {
    let alive = true;
    for (const item of similarAyahs) {
      const key = `${item.surah}:${item.ayah}`;
      if (verseTexts[key]) continue;

      if (fetchAyahText) {
        void fetchAyahText(item.surah, item.ayah).then(text => {
          if (alive && text) {
            setVerseTexts(prev => ({ ...prev, [key]: text }));
          }
        }).catch(() => {});
      } else if (script && typeof window !== 'undefined' && window.electronAPI?.quran?.inspectAyah) {
        void window.electronAPI.quran.inspectAyah({ script, surah: item.surah, ayah: item.ayah }).then(res => {
          if (alive && res?.ok && res.data?.canonical) {
            setVerseTexts(prev => ({ ...prev, [key]: res.data.canonical }));
          }
        }).catch(() => {});
      }
    }
    return () => { alive = false; };
  }, [similarAyahs, script, fetchAyahText]);

  const getMatchedSurahLabel = (sNumber: number): string => {
    const found = surahs.find(s => s.number === sNumber);
    if (!found) return t('quranSurahNumber', { number: new Intl.NumberFormat(lang).format(sNumber) });
    return lang === 'ar' ? (found.arabic || found.name || `سورة ${sNumber}`) : (found.name || `Surah ${sNumber}`);
  };

  const getScoreBadgeClass = (score: number) => {
    if (score >= 75) {
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
    }
    if (score >= 50) {
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30';
    }
    return 'bg-pale-sky-500/10 text-pale-sky-700 dark:text-pale-sky-300 border-pale-sky-500/30';
  };

  return (
    <aside
      ref={drawerRef}
      tabIndex={-1}
      data-ui-dialog="sheet"
      role="dialog"
      aria-modal="true"
      aria-label={t('quranSimilarAyahs')}
      dir={dir}
      data-quran-similar-drawer
      className="absolute inset-y-0 end-0 z-50 w-full sm:w-96 md:w-[460px] bg-surface/95 backdrop-blur-md border-s border-subtle shadow-2xl flex flex-col transition-transform duration-300"
    >
      {/* Drawer Header */}
      <div className="flex items-center justify-between p-4 border-b border-subtle">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CopyCheck className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t('quranSimilarAyahs')}</h2>
            <p className="text-xs text-muted">
              {surahName ? `${surahName} · ` : ''}
              <bdi>{new Intl.NumberFormat(lang).format(surah)}:{new Intl.NumberFormat(lang).format(ayah)}</bdi>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted hover:bg-pale-sky-500/10 transition-colors"
          title={t('quranSimilarDrawerClose')}
          aria-label={t('quranSimilarDrawerClose')}
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Subheader / Info Banner */}
      <div className="px-4 py-2.5 border-b border-subtle bg-surface-subtle/40 flex items-center justify-between text-xs text-muted">
        <span>{t('quranSimilarAyahsDesc')}</span>
        {!loading && !error && similarAyahs.length > 0 && (
          <span className="font-medium text-foreground bg-surface px-2 py-0.5 rounded-md border border-subtle">
            {t('quranSimilarAyahsCount', { count: similarAyahs.length })}
          </span>
        )}
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && (
          <div className="py-12 text-center text-sm text-muted space-y-2">
            <div className="size-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>{t('quranLoading')}</p>
          </div>
        )}

        {error && (
          <div className="py-12 text-center text-sm text-rose-600 dark:text-rose-400">
            <p>{t('quranReaderError')}</p>
          </div>
        )}

        {!loading && !error && similarAyahs.length === 0 && (
          <div className="py-12 text-center text-muted space-y-3">
            <div className="inline-flex items-center justify-center size-10 rounded-full bg-pale-sky-500/10 text-muted">
              <CopyCheck className="size-5" />
            </div>
            <p className="text-sm">{t('quranNoSimilarAyahs')}</p>
          </div>
        )}

        {!loading && !error && similarAyahs.map((item, idx) => {
          const key = `${item.surah}:${item.ayah}`;
          const verseText = verseTexts[key];
          const matchedSurahTitle = getMatchedSurahLabel(item.surah);

          return (
            <div
              key={`${item.matchedAyahKey}-${idx}`}
              className="rounded-xl border border-subtle bg-surface p-4 space-y-3 hover:border-emerald-500/30 transition-all shadow-xs"
            >
              {/* Header of Item: Reference and Similarity Badge */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <span>{matchedSurahTitle}</span>
                  <span dir="ltr" className="text-xs text-muted px-1.5 py-0.5 rounded-md bg-surface-subtle border border-subtle">
                    {item.surah}:{item.ayah}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-md font-semibold border ${getScoreBadgeClass(item.score)}`}
                    title={t('quranSimilarityScore', { score: item.score })}
                  >
                    {t('quranSimilarityScore', { score: item.score })}
                  </span>
                </div>
              </div>

              {/* Metrics pills: Coverage, Matched Words, Ranges */}
              <div className="flex flex-wrap gap-1.5 text-[11px] text-muted">
                <span className="px-2 py-0.5 rounded-md bg-surface-subtle border border-subtle">
                  {t('quranCoverage', { coverage: item.coverage })}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-surface-subtle border border-subtle">
                  {t('quranMatchedWords', { count: item.matchedWordsCount })}
                </span>
                {item.matchWordsRange && item.matchWordsRange.length > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-surface-subtle border border-subtle">
                    {t('quranMatchedWordRange', {
                      range: item.matchWordsRange.map(range => `${range[0]}–${range[1]}`).join(', ')
                    })}
                  </span>
                )}
              </div>

              {/* Matched Verse Text if available */}
              {verseText && (
                <div
                  dir="rtl"
                  lang="ar"
                  className="font-reading text-lg leading-[2.2] text-foreground/95 bg-surface-subtle/30 p-3 rounded-lg border border-subtle/60 select-text"
                >
                  {verseText}
                </div>
              )}

              {/* Actions: Jump to Ayah and Copy */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => onNavigateAyah(item.surah, item.ayah)}
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium hover:underline py-1"
                  title={t('quranJumpToSimilarAyah')}
                 aria-label={t('quranJumpToSimilarAyah')}>
                  <BookOpen className="size-3.5" />
                  <span>{t('quranJumpToSimilarAyah')}</span>
                </button>

                {onCopy && (
                  <button
                    type="button"
                    onClick={() => {
                      const copyText = verseText
                        ? `${verseText}\n[${matchedSurahTitle} ${item.surah}:${item.ayah}]`
                        : `[${matchedSurahTitle} ${item.surah}:${item.ayah}]`;
                      onCopy(copyText);
                    }}
                    className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-pale-sky-500/10 transition-colors"
                    title={t('quranCopyAyah')}
                    aria-label={t('quranCopyAyah')}
                  >
                    <Copy className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
