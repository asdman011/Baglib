'use client';

/**
 * Baglib — "Revise this list" (KEY-399): a revision deck that follows a personal list. Each kind of
 * item uses its own card template (book highlights, hadith, whole poem, ayah meaning). Adding,
 * editing or removing items updates the deck in the background; the list's order is the order new
 * cards are introduced. Ayahs only ever make meaning cards (no hifz).
 */

import React, { useEffect, useState } from 'react';
import { Layers, RefreshCw, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button } from '../ui/Button';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import type { PersonalList } from '../../../shared/personal-lists';
import { listName } from './PersonalListControls';

interface Following {
  subscriptionId: string;
  deckId: string;
  deckName: string;
}

export function ListDeckDialog({ list, onClose }: { list: PersonalList; onClose: () => void }) {
  const { t, dir } = useWorkspace();
  const [name, setName] = useState(() => listName(list, t));
  const [reversed, setReversed] = useState(false);
  const [policy, setPolicy] = useState<'toast' | 'silent'>('toast');
  const [following, setFollowing] = useState<Following[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([window.electronAPI.deckSync.list(), window.electronAPI.knowledgeCards.deckTree()]).then(([subs, tree]) => {
      if (!alive) return;
      const names = new Map<string, string>();
      const walk = (nodes: Array<{ id: string; fullName: string; children: unknown[] }>) => nodes.forEach(n => { names.set(n.id, n.fullName); walk(n.children as typeof nodes); });
      walk(tree as Array<{ id: string; fullName: string; children: unknown[] }>);
      setFollowing(subs.filter(s => s.sourceKind === 'list' && s.sourceRef === list.id).map(s => ({ subscriptionId: s.id, deckId: s.deckId, deckName: names.get(s.deckId) ?? '' })));
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [list.id]);

  const total = Object.values(list.counts).reduce((sum, n) => sum + n, 0);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const deck = await window.electronAPI.knowledgeCards.createDeck({ name: name.trim() });
      const { result } = await window.electronAPI.deckSync.subscribe({ deckId: deck.id, sourceKind: 'list', sourceRef: list.id, newItems: policy, noteTypeId: reversed ? 'stock-basic-reversed' : 'stock-basic' });
      setMessage(t('listDeckCreated', { name: name.trim(), count: result.added + result.linked }));
      setFollowing(current => [...current, { subscriptionId: result.subscriptionId, deckId: deck.id, deckName: name.trim() }]);
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      setError(msg.includes('UNIQUE') || msg.includes('exists') ? t('sunnahDeckNameTaken') : t('deckSyncFailed'));
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async (subscriptionId: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await window.electronAPI.deckSync.syncNow(subscriptionId);
      setMessage(t('listDeckSynced', { added: r.added + r.linked, updated: r.updated, orphaned: r.orphaned }));
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
    } catch {
      setError(t('deckSyncFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="list-deck-title" onMouseDown={onClose}>
      <div dir={dir} data-list-deck-dialog onMouseDown={e => e.stopPropagation()} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-subtle bg-surface p-5 shadow-2xl">
        <header className="flex items-center justify-between gap-3">
          <h3 id="list-deck-title" className="font-bold text-main">{t('listDeckTitle')}</h3>
          <button type="button" onClick={onClose} aria-label={t('close')} data-close-list-deck className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-main"><X className="size-4" /></button>
        </header>
        <p dir="auto" className="rounded-lg bg-canvas px-3 py-2 text-sm text-main">
          {listName(list, t)} · {t('listDeckItems', { count: total })}
        </p>
        <p className="text-xs leading-relaxed text-muted">{t('listDeckHint')}</p>

        {following.length > 0 && (
          <section className="space-y-1.5 rounded-xl border border-subtle p-3" data-list-deck-following>
            <h4 className="text-xs font-semibold text-muted">{t('listDeckFollowing')}</h4>
            {following.map(f => (
              <div key={f.subscriptionId} className="flex items-center justify-between gap-2 text-sm">
                <span dir="auto" className="truncate text-main">{f.deckName}</span>
                <button type="button" disabled={busy} data-list-deck-sync={f.subscriptionId} onClick={() => void syncNow(f.subscriptionId)} className="inline-flex items-center gap-1 rounded-lg border border-subtle px-2 py-1 text-xs hover:bg-canvas disabled:opacity-50">
                  <RefreshCw className="size-3" />{t('deckSyncNow')}
                </button>
              </div>
            ))}
          </section>
        )}

        <label className="block space-y-1 text-xs text-muted">
          <span>{t('sunnahDeckName')}</span>
          <input value={name} dir="auto" data-list-deck-name onChange={e => setName(e.target.value)} className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main" />
        </label>
        <label className="flex items-start gap-2 text-sm text-main">
          <input type="checkbox" className="mt-1" data-list-deck-reversed checked={reversed} onChange={e => setReversed(e.target.checked)} />
          <span>
            {t('listDeckReversed')}
            <span className="block text-xs text-muted">{t('listDeckReversedHint')}</span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          {t('deckSyncPolicy')}
          <select value={policy} onChange={e => setPolicy(e.target.value as 'toast' | 'silent')} className="rounded-lg border border-subtle bg-canvas px-2 py-1 text-xs text-main">
            <option value="toast">{t('deckSyncPolicyToast')}</option>
            <option value="silent">{t('deckSyncPolicySilent')}</option>
          </select>
        </label>
        <Button type="button" disabled={busy || !name.trim()} data-list-deck-create onClick={() => void create()} icon={<Layers className="size-4" />}>
          {t('sunnahDeckCreate')}
        </Button>
        {message && <p role="status" data-list-deck-message className="text-sm text-main">{message}</p>}
        {error && <p role="alert" data-list-deck-error className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
