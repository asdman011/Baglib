'use client';

/**
 * Baglib — a deck's live sources (KEY-393, KEY-409): follow a book's highlights or comments, a Sunnah
 * book, bab or collection, a poem or a poet; choose how new cards are announced, sync now, or stop.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link2, RefreshCw, Trash2, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button } from '../ui/Button';
import type { DeckTreeNode } from '../../../shared/srs';
import { DeckSourcePicker, type DeckSourceKind } from './DeckSourcePicker';

type Kind = DeckSourceKind;
const KINDS: Kind[] = ['book_highlights', 'book_comments', 'sunnah_book', 'sunnah_bab', 'hadith_collection', 'poem', 'poet'];
type Policy = 'silent' | 'toast';
interface Subscription {
  id: string;
  sourceKind: string;
  sourceRef: string;
  newItems: Policy;
  lastSyncedAt: string | null;
  label: string;
}

export function DeckSubscriptionsModal({ deck, onClose, onChanged }: { deck: DeckTreeNode | null; onClose: () => void; onChanged: () => void }) {
  const { t, dir } = useWorkspace();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [kind, setKind] = useState<Kind>('book_highlights');
  const [sourceRef, setSourceRef] = useState('');
  const [policy, setPolicy] = useState<Policy>('toast');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!deck) return;
    setSubs(await window.electronAPI.deckSync.list(deck.id));
  }, [deck]);

  useEffect(() => {
    if (!deck) return;
    queueMicrotask(() => void load());
    return window.electronAPI.deckSync.onChanged(result => {
      if (result.deckId === deck.id) void load();
    });
  }, [deck, load]);

  if (!deck) return null;

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      onChanged();
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      setError(msg.includes('unsupported-source') ? t('deckSyncUnsupported') : msg.includes('source-not-found') ? t('deckSyncSourceMissing') : t('deckSyncFailed'));
    } finally {
      setBusy(false);
    }
  };

  const summary = (r: { added: number; linked: number; updated: number; flagged: number; orphaned: number; restored: number }) =>
    t('deckSyncSummary', { added: r.added + r.linked, updated: r.updated, flagged: r.flagged, orphaned: r.orphaned, restored: r.restored });

  const kindLabel = (k: string) =>
    ({
      book_highlights: t('deckSyncKindHighlights'),
      book_comments: t('deckSyncKindComments'),
      sunnah_book: t('deckSyncKindSunnahBook'),
      sunnah_bab: t('deckSyncKindSunnahBab'),
      hadith_collection: t('deckSyncKindCollection'),
      poem: t('deckSyncKindPoem'),
      poet: t('deckSyncKindPoet'),
    })[k] ?? k;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="deck-sync-title">
      <div dir={dir} data-deck-subscriptions-modal className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-subtle bg-surface p-5 shadow-2xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <h3 id="deck-sync-title" className="flex items-center gap-2 font-bold text-main">
            <Link2 className="size-4 text-primary" />
            {t('deckSyncTitle', { deck: deck.name })}
          </h3>
          <button type="button" onClick={onClose} aria-label={t('close')} data-close-deck-subscriptions className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-main">
            <X className="size-4" />
          </button>
        </header>
        <p className="text-xs leading-relaxed text-muted">{t('deckSyncIntro')}</p>

        {subs.length > 0 && (
          <ul className="space-y-2" data-deck-subscription-list>
            {subs.map(sub => (
              <li key={sub.id} data-deck-subscription={sub.id} className="rounded-xl border border-subtle p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p dir="auto" className="truncate text-sm font-semibold text-main">{sub.label}</p>
                    <p className="text-xs text-muted">
                      {kindLabel(sub.sourceKind)} · {sub.lastSyncedAt ? t('deckSyncLast', { time: new Date(sub.lastSyncedAt).toLocaleString(dir === 'rtl' ? 'ar' : 'en') }) : t('deckSyncNever')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      data-deck-sync-now={sub.id}
                      title={t('deckSyncNow')}
                      aria-label={t('deckSyncNow')}
                      icon={<RefreshCw className="size-3.5" />}
                      onClick={() => void run(async () => setMessage(summary(await window.electronAPI.deckSync.syncNow(sub.id))))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      data-deck-unsubscribe={sub.id}
                      title={t('deckSyncRemove')}
                      aria-label={t('deckSyncRemove')}
                      icon={<Trash2 className="size-3.5" />}
                      onClick={() => void run(async () => void (await window.electronAPI.deckSync.unsubscribe(sub.id)))}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted">
                  {t('deckSyncPolicy')}
                  <select
                    value={sub.newItems}
                    data-deck-sync-policy={sub.id}
                    onChange={e => void run(async () => void (await window.electronAPI.deckSync.setPolicy(sub.id, e.target.value as Policy)))}
                    className="rounded-lg border border-subtle bg-canvas px-2 py-1 text-xs text-main"
                  >
                    <option value="toast">{t('deckSyncPolicyToast')}</option>
                    <option value="silent">{t('deckSyncPolicySilent')}</option>
                  </select>
                </label>
              </li>
            ))}
          </ul>
        )}

        <form
          data-deck-subscribe-form
          className="space-y-3 rounded-xl border border-dashed border-subtle p-3"
          onSubmit={e => {
            e.preventDefault();
            if (!sourceRef) return;
            void run(async () => {
              const { result } = await window.electronAPI.deckSync.subscribe({ deckId: deck.id, sourceKind: kind, sourceRef, newItems: policy });
              setMessage(summary(result));
            });
          }}
        >
          <p className="text-sm font-semibold text-main">{t('deckSyncAdd')}</p>
          <label className="block space-y-1 text-xs text-muted">
            <span>{t('deckSyncKind')}</span>
            <select
              value={kind}
              data-deck-sync-kind
              onChange={e => {
                setKind(e.target.value as Kind);
                setSourceRef('');
              }}
              className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main"
            >
              {KINDS.map(k => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </select>
          </label>
          <DeckSourcePicker key={kind} kind={kind} onChange={setSourceRef} />
          <fieldset className="space-y-1">
            <legend className="text-xs text-muted">{t('deckSyncPolicy')}</legend>
            <label className="flex items-center gap-2 text-sm text-main">
              <input type="radio" name="deck-sync-policy" checked={policy === 'toast'} onChange={() => setPolicy('toast')} />
              {t('deckSyncPolicyToast')}
            </label>
            <label className="flex items-center gap-2 text-sm text-main">
              <input type="radio" name="deck-sync-policy" checked={policy === 'silent'} onChange={() => setPolicy('silent')} />
              {t('deckSyncPolicySilent')}
            </label>
          </fieldset>
          <Button type="submit" size="sm" disabled={busy || !sourceRef} data-deck-subscribe-btn icon={<Link2 className="size-3.5" />}>
            {t('deckSyncSubscribe')}
          </Button>
        </form>

        {message && (
          <p role="status" data-deck-sync-message className="text-xs text-main">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
