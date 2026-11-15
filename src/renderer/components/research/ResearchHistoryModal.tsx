'use client';

import React, { useEffect, useState } from 'react';
import type { ManuscriptDocument, ManuscriptVersion, ManuscriptsAPI } from '../../../shared/manuscripts';
import { translations } from '../../translations';
import { History, RotateCcw, BookmarkPlus, X, Loader2, CheckCircle2 } from 'lucide-react';

interface Props {
  language: 'ar' | 'en';
  isOpen: boolean;
  onClose: () => void;
  document?: ManuscriptDocument;
  api: ManuscriptsAPI;
  onRestored?: (document: ManuscriptDocument) => void | Promise<void>;
}

export function ResearchHistoryModal({ language, isOpen, onClose, document, api, onRestored }: Props) {
  const [versions, setVersions] = useState<ManuscriptVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const t = translations[language];

  useEffect(() => {
    if (!isOpen || !document) return;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setLoading(true);
      setSuccess(null);
      try {
        const list = await api.history(document.id);
        if (!cancelled) {
          setVersions(list.sort((a, b) => b.revision - a.revision));
        }
      } catch {
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [isOpen, document, api]);

  if (!isOpen || !document) return null;

  const handleCheckpoint = async () => {
    setBusy(true);
    try {
      await api.checkpoint(document.id);
      const list = await api.history(document.id);
      setVersions(list.sort((a, b) => b.revision - a.revision));
      setSuccess(t.researchCreateCheckpoint);
      setTimeout(() => setSuccess(null), 3000);
    } catch {} finally {
      setBusy(false);
    }
  };

  const handleRestore = async (revision: number) => {
    setBusy(true);
    try {
      const restored = await api.restoreVersion(document.id, revision);
      await onRestored?.(restored);
      onClose();
    } catch {} finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={t.researchHistoryTitle}>
      <div
        className="research-history-card w-full max-w-xl bg-surface-panel border border-border-subtle rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="research-history-header flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-main">{t.researchHistoryTitle}</h2>
              <p className="text-xs text-text-muted">{document.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-base transition-colors"
            aria-label={t.researchAiClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 bg-surface-base/50 border-b border-border-subtle flex items-center justify-between">
          <span className="text-xs text-text-muted">
            {versions.length} {versions.length === 1 ? t.researchRevision : t.researchHistoryTitle}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleCheckpoint()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-xs"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span>{t.researchCreateCheckpoint}</span>
          </button>
        </div>

        {success && (
          <div className="mx-4 mt-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <div className="p-6 overflow-y-auto flex-1">
          {loading && (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-text-muted">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs">{t.manuscriptLoading}</span>
            </div>
          )}

          {!loading && versions.length === 0 && (
            <div className="py-12 text-center text-text-muted text-sm">
              <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>{t.researchNoHistory}</p>
            </div>
          )}

          {!loading && versions.length > 0 && (
            <div className="space-y-3">
              {versions.map(v => (
                <div
                  key={v.revision}
                  className="p-3.5 rounded-xl border border-border-subtle bg-surface-base flex items-center justify-between gap-3 hover:border-border-strong transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {t.researchRevision} #{v.revision}
                      </span>
                      <span className="text-xs text-text-muted">
                        {new Date(v.created_at).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}
                      </span>
                    </div>
                    <p className="text-xs text-text-main font-medium">
                      {v.action || 'Checkpoint'}
                    </p>
                    <span className="text-[10px] text-text-muted font-mono">
                      {v.snapshot_hash ? v.snapshot_hash.slice(0, 12) : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRestore(v.revision)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border-subtle hover:bg-surface-panel hover:text-primary transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{t.researchRestoreRevision}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
