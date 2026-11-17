'use client';

/**
 * Baglib — review what live sync couldn't decide alone (KEY-393; ADR-017 3.8, 3.11):
 * - "The source changed": a copy, or a field the user edited. Shows the user's version, the old
 *   source and the new source side by side; Update or Keep mine.
 * - "Orphaned cards": the source item is gone. The cards are suspended with their history;
 *   Delete (to the trash) or Keep (as ordinary cards). Anki's Empty Cards pattern.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button } from '../ui/Button';

type Pending = Awaited<ReturnType<typeof window.electronAPI.deckSync.pending>>;

/** Card fields are HTML; show them as text. */
const plain = (html: string | undefined) =>
  (html ?? '')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<[^>]*>/gu, '')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&')
    .trim();

export function SyncReviewModal({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const { t, dir } = useWorkspace();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setPending(await window.electronAPI.deckSync.pending()), []);
  useEffect(() => {
    if (open) queueMicrotask(() => void load());
  }, [open, load]);

  if (!open) return null;

  const act = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="sync-review-title">
      <div dir={dir} data-sync-review-modal className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-subtle bg-surface p-5 shadow-2xl space-y-5">
        <header className="flex items-center justify-between gap-3">
          <h3 id="sync-review-title" className="font-bold text-main">{t('syncReviewTitle')}</h3>
          <button type="button" onClick={onClose} aria-label={t('close')} data-close-sync-review className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-main">
            <X className="size-4" />
          </button>
        </header>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-main">{t('syncReviewChanged', { count: pending?.changed.length ?? 0 })}</h4>
          {pending?.changed.length === 0 && <p className="text-xs text-muted">{t('syncReviewNothing')}</p>}
          {pending?.changed.map(item => (
            <article key={item.noteId} data-sync-changed={item.noteId} className="rounded-xl border border-subtle p-3 space-y-3">
              <p className="text-xs text-muted">{item.isCopy ? t('syncReviewCopy') : t('syncReviewEdited')}</p>
              {item.fields.map(field => (
                <div key={field} className="grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      ['syncReviewYours', item.current[field]],
                      ['syncReviewOld', item.oldSource[field]],
                      ['syncReviewNew', item.newSource?.[field]],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-canvas p-2">
                      <p className="mb-1 text-[11px] font-semibold text-muted">{t(label)}</p>
                      <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-loose text-main">
                        {item.newSource || label !== 'syncReviewNew' ? plain(value) : t('syncReviewSourceGone')}
                      </p>
                    </div>
                  ))}
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={busy || !item.newSource} data-sync-update={item.noteId} onClick={() => void act(() => window.electronAPI.deckSync.resolveChange(item.noteId, 'update'))}>
                  {t('syncReviewUpdate')}
                </Button>
                <Button type="button" size="sm" variant="secondary" disabled={busy} data-sync-keep={item.noteId} onClick={() => void act(() => window.electronAPI.deckSync.resolveChange(item.noteId, 'keep'))}>
                  {t('syncReviewKeepMine')}
                </Button>
              </div>
            </article>
          ))}
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-main">{t('syncReviewOrphaned', { count: pending?.orphaned.length ?? 0 })}</h4>
          <p className="text-xs text-muted">{t('syncReviewOrphanedIntro')}</p>
          {pending?.orphaned.length === 0 && <p className="text-xs text-muted">{t('syncReviewNothing')}</p>}
          {pending?.orphaned.map(item => (
            <article key={item.noteId} data-sync-orphan={item.noteId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-subtle p-3">
              <p dir="auto" className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-loose text-main">{plain(item.front)}</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="secondary" disabled={busy} data-orphan-keep={item.noteId} onClick={() => void act(() => window.electronAPI.deckSync.resolveOrphan(item.noteId, 'keep'))}>
                  {t('syncReviewKeep')}
                </Button>
                <Button type="button" size="sm" variant="danger" disabled={busy} data-orphan-delete={item.noteId} onClick={() => void act(() => window.electronAPI.deckSync.resolveOrphan(item.noteId, 'delete'))}>
                  {t('syncReviewDelete')}
                </Button>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
