'use client';

import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, X, Sparkles } from 'lucide-react';
import type { QuranSurahIntro } from '../../../shared/types/quran';
import type { TranslationKey } from '../../translations';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function QuranSurahIntroCard({
  intro,
  t,
  onClose,
}: {
  intro: QuranSurahIntro;
  t: Translate;
  onClose?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section
      aria-label={t('quranSurahIntro')}
      className="relative rounded-2xl border border-subtle bg-surface/80 backdrop-blur-sm p-4 sm:p-5 mb-5 shadow-xs transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <BookOpen className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span>{t('quranSurahIntro')}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-pale-sky-500/10 text-muted font-normal">
                {intro.surahName}
              </span>
            </h3>
            <p className="text-xs text-muted mt-0.5">{t('quranSurahIntroOverview')}</p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:bg-pale-sky-500/10 transition-colors"
            title={t('quranClosePanel')}
            aria-label={t('quranClosePanel')}
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {intro.shortText && (
        <div className="mt-3 text-sm text-foreground/90 leading-relaxed font-sans bg-pale-sky-500/5 dark:bg-pale-sky-900/10 p-3 rounded-xl border border-subtle">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
            {t('quranSurahIntroSummary')}
          </p>
          <p>{intro.shortText}</p>
        </div>
      )}

      {expanded && intro.text && (
        <div className="mt-3 pt-3 border-t border-subtle text-sm text-foreground/85 leading-relaxed font-sans space-y-3 whitespace-pre-line">
          <p>{intro.text}</p>
        </div>
      )}

      {intro.text && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3.5" />
              <span>{t('quranSurahIntroReadLess')}</span>
            </>
          ) : (
            <>
              <ChevronDown className="size-3.5" />
              <span>{t('quranSurahIntroReadMore')}</span>
            </>
          )}
        </button>
      )}
    </section>
  );
}
