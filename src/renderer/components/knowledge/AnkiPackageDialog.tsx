'use client';

/**
 * Baglib — Anki package dialog (KEY-392): import an .apkg/.colpkg losslessly (notes, cards,
 * scheduling, FSRS memory, history, media, deck tree, tags), or export BagLib decks as an .apkg
 * that Anki imports with the same notes, schedules and history.
 */

import React, { useState } from 'react';
import { Download, Upload, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button } from '../ui/Button';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import type { TranslationKey } from '../../translations';

interface AnkiPackageDialogProps {
  onClose: () => void;
  /** Export only this deck (with its sub-decks); otherwise the whole collection. */
  deck?: { id: string; name: string } | null;
}

type Policy = 'if-newer' | 'always' | 'never';

const ERRORS: Record<string, TranslationKey> = {
  'anki-invalid-package': 'ankiPkgErrorInvalid',
  'anki-package-too-new': 'ankiPkgErrorTooNew',
  'anki-package-too-large': 'ankiPkgErrorTooLarge',
};

export function AnkiPackageDialog({ onClose, deck = null }: AnkiPackageDialogProps) {
  const { t, dir, lang } = useWorkspace();
  const language = lang === 'ar' ? 'ar' : 'en';
  const [policy, setPolicy] = useState<Policy>('if-newer');
  const [merge, setMerge] = useState(false);
  const [scheduling, setScheduling] = useState(true);
  const [media, setMedia] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch {
      setError(t('ankiPkgErrorFailed'));
    } finally {
      setBusy(false);
    }
  };

  const importPackage = () => run(async () => {
    const r = await window.electronAPI.ankiPackage.import({ policy, mergeNoteTypes: merge, language });
    if (!r.ok) return setError(t(ERRORS[r.error] ?? 'ankiPkgErrorFailed'));
    if (!r.data) return;
    const d = r.data;
    setMessage(t('ankiPkgImported', {
      notes: d.notes.added + d.notes.updated,
      cards: d.cards.added + d.cards.updated,
      revlog: d.revlog.added,
      decks: d.decks.added,
      media: d.media.stored,
      skipped: d.notes.skipped,
    }));
    window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
  });

  const exportPackage = () => run(async () => {
    const r = await window.electronAPI.ankiPackage.export({ deckIds: deck ? [deck.id] : undefined, includeScheduling: scheduling, includeMedia: media, defaultName: deck?.name ?? 'BagLib', language });
    if (!r.ok) return setError(t('ankiPkgErrorFailed'));
    if (!r.data) return;
    setMessage(t('ankiPkgExported', { notes: r.data.notes, cards: r.data.cards, revlog: r.data.revlog + r.data.orphanRevlog, media: r.data.media }));
  });

  const select = 'w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="anki-package-title">
      <div dir={dir} data-anki-package-dialog className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-subtle bg-surface p-5 shadow-2xl">
        <header className="flex items-center justify-between gap-3">
          <h3 id="anki-package-title" className="font-bold text-main">{t('ankiPkgTitle')}</h3>
          <button type="button" onClick={onClose} aria-label={t('close')} data-close-anki-package className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-main"><X className="size-4" /></button>
        </header>

        {!deck && (
          <section className="space-y-2 rounded-xl border border-subtle p-3" data-anki-import-section>
            <h4 className="text-sm font-bold text-main">{t('ankiPkgImport')}</h4>
            <p className="text-xs leading-relaxed text-muted">{t('ankiPkgImportHint')}</p>
            <label className="block space-y-1 text-xs text-muted">
              <span>{t('ankiPkgPolicy')}</span>
              <select value={policy} data-anki-import-policy onChange={e => setPolicy(e.target.value as Policy)} className={select}>
                <option value="if-newer">{t('ankiPkgPolicyIfNewer')}</option>
                <option value="always">{t('ankiPkgPolicyAlways')}</option>
                <option value="never">{t('ankiPkgPolicyNever')}</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-main">
              <input type="checkbox" checked={merge} data-anki-import-merge onChange={e => setMerge(e.target.checked)} />
              <span>{t('ankiPkgMerge')}</span>
            </label>
            <Button type="button" disabled={busy} data-anki-import onClick={() => void importPackage()} icon={<Upload className="size-4" />}>
              {t('ankiPkgImportButton')}
            </Button>
          </section>
        )}

        <section className="space-y-2 rounded-xl border border-subtle p-3" data-anki-export-section>
          <h4 className="text-sm font-bold text-main">{deck ? t('ankiPkgExportDeck', { name: deck.name }) : t('ankiPkgExportAll')}</h4>
          <p className="text-xs leading-relaxed text-muted">{t('ankiPkgExportHint')}</p>
          <label className="flex items-center gap-2 text-xs text-main">
            <input type="checkbox" checked={scheduling} data-anki-export-scheduling onChange={e => setScheduling(e.target.checked)} />
            <span>{t('ankiPkgIncludeScheduling')}</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-main">
            <input type="checkbox" checked={media} data-anki-export-media onChange={e => setMedia(e.target.checked)} />
            <span>{t('ankiPkgIncludeMedia')}</span>
          </label>
          <Button type="button" variant="secondary" disabled={busy} data-anki-export onClick={() => void exportPackage()} icon={<Download className="size-4" />}>
            {t('ankiPkgExportButton')}
          </Button>
        </section>

        {busy && <p role="status" className="text-sm text-muted">{t('ankiPkgWorking')}</p>}
        {message && <p role="status" data-anki-package-message className="text-sm text-main">{message}</p>}
        {error && <p role="alert" data-anki-package-error className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
