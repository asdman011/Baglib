'use client';

/**
 * Baglib — make a revision deck from poetry (KEY-397): one poem, or every poem of a poet, kept in
 * sync with the source. Two layouts:
 * - Verse by verse (progressive context cloze): the previous bayt as the anchor, then the bayt with
 *   its ajuz (or the whole bayt) hidden, then a blurred look at what follows. A daily quota of new
 *   verses learns a long poem in order.
 * - Whole poem: the title on the front, the whole poem on the back.
 */

import React, { useEffect, useState } from 'react';
import { BookOpenText, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button } from '../ui/Button';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';

export type PoemDeckSource = { kind: 'poem' | 'poet'; ref: string; label: string };
type Layout = 'verses' | 'whole';
type Prompt = 'ajuz' | 'verse';

const MAX_DAILY_VERSES = 50;

export function PoemDeckDialog({ open, source, onClose }: { open: boolean; source: PoemDeckSource | null; onClose: () => void }) {
  const { t, dir } = useWorkspace();
  const [name, setName] = useState('');
  const [layout, setLayout] = useState<Layout>('verses');
  const [prompt, setPrompt] = useState<Prompt>('ajuz');
  const [chunked, setChunked] = useState(true);
  const [perDay, setPerDay] = useState(6);
  const [policy, setPolicy] = useState<'toast' | 'silent'>('toast');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setName(source?.label ?? '');
      setMessage(null);
      setError(null);
    });
  }, [open, source]);

  if (!open || !source) return null;

  const validPerDay = Number.isSafeInteger(perDay) && perDay >= 1 && perDay <= MAX_DAILY_VERSES;
  const canCreate = !busy && !!name.trim() && (layout === 'whole' || !chunked || validPerDay);

  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    try {
      const deck = await window.electronAPI.knowledgeCards.createDeck({ name: name.trim() });
      const verses = layout === 'verses';
      const chunk = verses && chunked ? perDay : 0;
      const { result } = await window.electronAPI.deckSync.subscribe({
        deckId: deck.id,
        sourceKind: source.kind,
        sourceRef: source.ref,
        newItems: policy,
        noteTypeId: verses ? 'stock-context-cloze' : 'stock-poem-whole',
        ...(verses ? { prompt, chunk } : {}),
      });
      const count = result.added + result.linked;
      setMessage(chunk ? t('poemDeckCreatedChunked', { name: name.trim(), count, perDay: chunk }) : t('poemDeckCreated', { name: name.trim(), count }));
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      setError(msg.includes('UNIQUE') || msg.includes('exists') ? t('sunnahDeckNameTaken') : t('deckSyncFailed'));
    } finally {
      setBusy(false);
    }
  };

  const radio = (group: string, value: string, checked: boolean, onChange: () => void, label: string, hint?: string) => (
    <label className="flex items-start gap-2 text-sm text-main">
      <input type="radio" name={group} className="mt-1.5" data-poem-deck-option={`${group}:${value}`} checked={checked} onChange={onChange} />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="poem-deck-title">
      <div dir={dir} data-poem-deck-dialog className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-subtle bg-surface p-5 shadow-2xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <h3 id="poem-deck-title" className="font-bold text-main">{t(source.kind === 'poet' ? 'poemDeckTitlePoet' : 'poemDeckTitlePoem')}</h3>
          <button type="button" onClick={onClose} aria-label={t('close')} data-close-poem-deck className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-main">
            <X className="size-4" />
          </button>
        </header>
        <p dir="auto" data-poem-deck-source className="rounded-lg bg-canvas px-3 py-2 text-sm text-main">
          {source.label}
        </p>

        <label className="block space-y-1 text-xs text-muted">
          <span>{t('sunnahDeckName')}</span>
          <input value={name} dir="auto" data-poem-deck-name onChange={e => setName(e.target.value)} className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main" />
        </label>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-semibold text-muted">{t('poemDeckLayout')}</legend>
          {radio('layout', 'verses', layout === 'verses', () => setLayout('verses'), t('poemDeckLayoutVerses'), t('poemDeckLayoutVersesHint'))}
          {radio('layout', 'whole', layout === 'whole', () => setLayout('whole'), t('poemDeckLayoutWhole'), t('poemDeckLayoutWholeHint'))}
        </fieldset>

        {layout === 'verses' && (
          <>
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-semibold text-muted">{t('poemDeckPrompt')}</legend>
              {radio('prompt', 'ajuz', prompt === 'ajuz', () => setPrompt('ajuz'), t('poemDeckPromptAjuz'))}
              {radio('prompt', 'verse', prompt === 'verse', () => setPrompt('verse'), t('poemDeckPromptVerse'))}
            </fieldset>
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-semibold text-muted">{t('poemDeckDaily')}</legend>
              <label className="flex flex-wrap items-center gap-2 text-sm text-main">
                <input type="checkbox" data-poem-deck-chunked checked={chunked} onChange={e => setChunked(e.target.checked)} />
                {t('poemDeckDailyLabel')}
                <input
                  type="number"
                  min={1}
                  max={MAX_DAILY_VERSES}
                  value={perDay}
                  disabled={!chunked}
                  data-poem-deck-per-day
                  aria-label={t('poemDeckDailyLabel')}
                  onChange={e => setPerDay(Number.parseInt(e.target.value, 10))}
                  className="w-20 rounded-lg border border-subtle bg-canvas px-2 py-1 text-sm text-main disabled:opacity-50"
                />
              </label>
              <p className="text-xs text-muted">{t('poemDeckDailyHint')}</p>
            </fieldset>
          </>
        )}

        <label className="flex items-center gap-2 text-xs text-muted">
          {t('deckSyncPolicy')}
          <select value={policy} onChange={e => setPolicy(e.target.value as 'toast' | 'silent')} className="rounded-lg border border-subtle bg-canvas px-2 py-1 text-xs text-main">
            <option value="toast">{t('deckSyncPolicyToast')}</option>
            <option value="silent">{t('deckSyncPolicySilent')}</option>
          </select>
        </label>
        <Button type="button" disabled={!canCreate} data-poem-deck-create onClick={() => void create()} icon={<BookOpenText className="size-4" />}>
          {t('sunnahDeckCreate')}
        </Button>

        {message && (
          <p role="status" data-poem-deck-message className="text-sm text-main">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" data-poem-deck-error className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
