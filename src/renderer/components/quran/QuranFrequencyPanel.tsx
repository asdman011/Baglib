'use client';

import React, { useEffect, useState } from 'react';
import { GitBranch } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { ContextMenu } from '../ui/ContextMenu';
import { useOpenStudyLink } from '../../utils/use-study-link';
import { LexiconDeckDialog } from '../knowledge/LexiconDeckDialog';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import type { QuranFrequency, QuranFrequencyFamily, QuranFrequencyPlace } from '../../../shared/types/quran';

const control = 'rounded-lg border border-subtle bg-surface p-2 text-sm text-main min-w-0';

export function QuranFrequencyPanel() {
  const { t, dir, lang } = useWorkspace();
  const { linkHandlers, linkMenuItems } = useOpenStudyLink();
  const [family, setFamily] = useState<QuranFrequencyFamily>('root');
  const [text, setText] = useState('');
  const [surah, setSurah] = useState(0);
  const [data, setData] = useState<QuranFrequency | null>(null);
  const [missing, setMissing] = useState(false);
  const [open, setOpen] = useState<{ text: string; places: QuranFrequencyPlace[] } | null>(null);
  const [rootDeckOpen, setRootDeckOpen] = useState(false);
  const [cardState, setCardState] = useState<Record<string, { busy: boolean; message: string | null; failed?: boolean }>>({});
  const number = new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US');
  const uiLang: 'ar' | 'en' = lang === 'ar' ? 'ar' : 'en';

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void window.electronAPI.quran.frequency({ family, text: text.trim(), surah: surah || undefined, limit: 200 }).then(result => {
        if (!alive) return;
        setMissing(!result.ok);
        setData(result.ok ? result.data : null);
      });
    }, 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [family, text, surah]);

  const showPlaces = async (entry: string) => {
    const result = await window.electronAPI.quran.frequencyPlaces({ family, text: entry });
    if (result.ok) setOpen({ text: entry, places: result.data });
  };

  const makeRootCard = async (rootText: string) => {
    setCardState(prev => ({ ...prev, [rootText]: { busy: true, message: null } }));
    try {
      const r = await window.electronAPI.lexiconDecks.rootCard({
        root: rootText,
        deckId: null,
        deckName: null,
        language: uiLang,
      });
      if (!r.ok) throw new Error(r.error);
      setCardState(prev => ({
        ...prev,
        [rootText]: {
          busy: false,
          message: t(r.data.created ? 'quranRootCardCreated' : 'quranRootCardUpdated', { root: r.data.dashedRoot }),
        },
      }));
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
    } catch {
      setCardState(prev => ({
        ...prev,
        [rootText]: { busy: false, failed: true, message: t('lexiconDeckFailed') },
      }));
    }
  };

  return <div dir={dir} className="flex-1 min-h-0 overflow-auto p-4 sm:p-6">
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-bold">{t('quranFrequencyTitle')}</h2>
          <p className="text-xs text-muted leading-relaxed">{t('quranFrequencySource')}</p>
        </div>
        {family === 'root' && (
          <button
            type="button"
            data-open-root-deck-dialog
            onClick={() => setRootDeckOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-subtle bg-surface px-3 py-2 text-xs font-semibold text-main hover:bg-canvas"
          >
            <GitBranch className="size-3.5" />
            <span>{t('quranMakeRootDeckBtn')}</span>
          </button>
        )}
      </header>
      <div className="flex flex-wrap gap-2">
        <div role="group" aria-label={t('quranFrequencyTitle')} className="flex gap-1">{(['root', 'lemma'] as const).map(value => <button key={value} type="button" aria-pressed={family === value} onClick={() => { setFamily(value); setOpen(null); }} className={`rounded-lg px-3 py-2 text-sm ${family === value ? 'bg-pale-sky-600 text-white' : 'border border-subtle'}`}>{t(value === 'root' ? 'quranMorphologyRoot' : 'quranMorphologyLemma')}</button>)}</div>
        <input value={text} onChange={event => setText(event.target.value)} maxLength={100} dir="rtl" lang="ar" placeholder={t('quranFrequencySearch')} aria-label={t('quranFrequencySearch')} className={`${control} flex-1`} />
        <label className="flex items-center gap-2 text-sm"><span>{t('quranFrequencySurah')}</span><input type="number" min={0} max={114} value={surah || ''} placeholder={t('quranFrequencyAll')} onChange={event => setSurah(Math.min(114, Math.max(0, Number(event.target.value) || 0)))} className={`${control} w-24`} /></label>
      </div>
      {missing && <p role="alert" className="text-sm leading-relaxed">{t('quranFrequencyMissing')}</p>}
      {data && <p className="text-xs text-muted">{t('quranFrequencyTotal', { total: number.format(data.total), distinct: number.format(data.distinct) })}</p>}
      {data && data.rows.length === 0 && <p className="text-sm text-muted">{t('noSearchResults')}</p>}
      <ol className="space-y-1">{data?.rows.map(row => {
        const st = cardState[row.text];
        return <li key={row.text} className="rounded-lg border border-subtle px-3 py-2 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" aria-expanded={open?.text === row.text} onClick={() => open?.text === row.text ? setOpen(null) : void showPlaces(row.text)} className="flex flex-1 items-center justify-between gap-3 text-start">
              <span dir="rtl" lang="ar" className="font-reading text-xl leading-loose">{row.text}</span>
              <span className="text-end"><bdi className="block text-sm text-muted">{number.format(row.stated ?? row.count)}</bdi>{row.stated !== undefined && row.stated !== row.count && <small className="block text-xs text-muted">{t('quranFrequencyLinked', { count: number.format(row.count) })}</small>}</span>
            </button>
            {family === 'root' && (
              <button
                type="button"
                data-frequency-make-root-card={row.text}
                disabled={st?.busy}
                onClick={() => void makeRootCard(row.text)}
                className="rounded-lg border border-subtle bg-surface px-2.5 py-1 text-xs font-semibold hover:bg-canvas disabled:opacity-50"
              >
                {t('quranMakeRootCard')}
              </button>
            )}
          </div>
          {st?.message && (
            <p
              role={st.failed ? 'alert' : 'status'}
              data-frequency-root-card-status={row.text}
              className={`text-xs ${st.failed ? 'text-danger' : 'text-emerald-600 dark:text-emerald-400'}`}
            >
              {st.message}
            </p>
          )}
          {open?.text === row.text && <div className="flex flex-wrap gap-2 p-2" dir="ltr">{open.places.map(place => {
            const target = `quran:hafs:${place.surah}:${place.ayah}`;
            return <ContextMenu as="span" tabIndex={-1} key={`${place.surah}:${place.ayah}`} className="inline" items={linkMenuItems(target)}><button type="button" className="text-xs underline" {...linkHandlers(target)}>{place.surah}:{place.ayah}{place.count > 1 && ` ×${place.count}`}</button></ContextMenu>;
          })}</div>}
        </li>;
      })}</ol>
    </div>
    {rootDeckOpen && (
      <LexiconDeckDialog
        initialMode="roots"
        initialSurah={surah}
        onClose={() => setRootDeckOpen(false)}
      />
    )}
  </div>;
}
