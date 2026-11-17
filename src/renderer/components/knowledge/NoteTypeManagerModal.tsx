'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { X, Copy, Trash2, Edit2, AlertTriangle, Layers, Check } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { CardNoteType } from '../../../shared/types/card-notes';

export interface NoteTypeManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectType?: (type: CardNoteType) => void;
}

export const NoteTypeManagerModal: React.FC<NoteTypeManagerModalProps> = ({
  isOpen,
  onClose,
  onSelectType,
}) => {
  const { t, dir } = useWorkspace();
  const [types, setTypes] = useState<CardNoteType[]>([]);
  const [editingType, setEditingType] = useState<CardNoteType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadTypes = useCallback(async () => {
    try {
      setLoading(true);
      const list = await window.electronAPI.cardNotes.listTypes();
      setTypes(list);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to load note types');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    if (isOpen) {
      window.electronAPI.cardNotes.listTypes()
        .then(list => {
          if (!active) return;
          setTypes(list);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (!active) return;
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg || 'Failed to load note types');
          setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [isOpen]);

  const handleCopy = async (nt: CardNoteType) => {
    try {
      const copyName = `${nt.name} (Copy)`;
      await window.electronAPI.cardNotes.saveType({
        name: copyName,
        kind: nt.kind,
        css: nt.css,
        sortFieldOrd: nt.sortFieldOrd,
        fields: nt.fields.map(f => ({
          name: f.name,
          rtl: f.rtl,
          font: f.font,
          sizePx: f.sizePx,
          sourceText: f.sourceText,
        })),
        templates: nt.templates.map(tmp => ({
          name: tmp.name,
          front: tmp.front,
          back: tmp.back,
        })),
      });
      await loadTypes();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to copy note type');
    }
  };

  const handleDelete = async (nt: CardNoteType) => {
    if (nt.stockKind) {
      setError(t('cannotDeleteBuiltin'));
      return;
    }
    try {
      await window.electronAPI.cardNotes.deleteType(nt.id);
      await loadTypes();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to delete note type');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingType) return;
    try {
      await window.electronAPI.cardNotes.saveType({
        id: editingType.id,
        name: editingType.name,
        css: editingType.css,
        fields: editingType.fields.map(f => ({
          ord: f.ord,
          name: f.name,
          rtl: f.rtl,
          sourceText: f.sourceText,
        })),
        templates: editingType.templates.map(tmp => ({
          ord: tmp.ord,
          name: tmp.name,
          front: tmp.front,
          back: tmp.back,
        })),
      });
      setEditingType(null);
      await loadTypes();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to save note type');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div
        dir={dir}
        className="flex flex-col w-full max-w-3xl max-h-[85vh] bg-surface rounded-2xl border border-subtle shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-subtle">
          <div className="flex items-center gap-2.5">
            <Layers className="size-5 text-primary" />
            <h2 className="text-lg font-bold text-main">{t('noteTypeManagerTitle')}</h2>
            {loading && <span className="text-xs text-muted animate-pulse">Loading...</span>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeNoteEditor')}
            data-close-note-types-modal
            className="p-2 text-muted hover:text-main rounded-lg hover:bg-canvas transition-colors"
          >
            <X className="size-5" />
          </button>
        </header>

        {error && (
          <div className="mx-6 mt-4 p-3 text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => setError(null)} className="text-xs hover:underline">
              Dismiss
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="divide-y divide-subtle border border-subtle rounded-2xl overflow-hidden bg-canvas">
            {types.map(nt => (
              <div
                key={nt.id}
                className="flex items-center justify-between p-4 bg-surface hover:bg-canvas/50 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-main text-sm">{nt.name}</span>
                    {nt.stockKind && (
                      <span className="text-[10px] bg-muted/15 text-muted px-2 py-0.5 rounded-full font-medium">
                        {t('builtinNoteType')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    {nt.fields.length} {t('noteFields')} · {nt.templates.length} {t('noteTemplates')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {onSelectType && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectType(nt);
                        onClose();
                      }}
                      className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium"
                    >
                      <Check className="size-4" />
                      <span>{t('selectNoteType')}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCopy(nt)}
                    className="p-2 text-muted hover:text-main rounded-lg hover:bg-canvas transition-colors flex items-center gap-1 text-xs"
                    title={t('copyNoteType')}
                  >
                    <Copy className="size-4" />
                    <span>{t('copyNoteType')}</span>
                  </button>

                  {!nt.stockKind && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditingType(JSON.parse(JSON.stringify(nt)))}
                        className="p-2 text-muted hover:text-primary rounded-lg hover:bg-canvas transition-colors"
                        title={t('editNote')}
                        aria-label={t('editNote')}
                      >
                        <Edit2 className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(nt)}
                        className="p-2 text-muted hover:text-danger rounded-lg hover:bg-canvas transition-colors"
                        title={t('delete')}
                        aria-label={t('delete')}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer className="flex items-center justify-end px-6 py-4 border-t border-subtle bg-surface">
          <button
            type="button"
            onClick={onClose}
            data-close-note-types-modal
            className="px-4 py-2 text-sm font-medium text-muted hover:text-main rounded-xl hover:bg-canvas transition-colors"
          >
            {t('closeNoteEditor')}
          </button>
        </footer>
      </div>

      {/* Edit Note Type Modal */}
      {editingType && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <div dir={dir} className="w-full max-w-xl bg-surface rounded-2xl border border-subtle p-6 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            <h3 className="text-base font-bold text-main">{t('editNote')} - {editingType.name}</h3>

            <div>
              <label className="block text-xs font-semibold text-muted mb-1">{t('noteTypeName')}</label>
              <input
                type="text"
                value={editingType.name}
                onChange={e => setEditingType({ ...editingType, name: e.target.value })}
                className="w-full bg-canvas border border-subtle rounded-xl px-3 py-2 text-sm text-main outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-muted">{t('noteFields')}</label>
              {editingType.fields.map((f, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={f.name}
                    onChange={e => {
                      const updated = [...editingType.fields];
                      updated[idx].name = e.target.value;
                      setEditingType({ ...editingType, fields: updated });
                    }}
                    className="flex-1 bg-canvas border border-subtle rounded-lg px-2.5 py-1.5 text-xs text-main outline-none"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-muted">{t('noteTemplates')}</label>
              {editingType.templates.map((tmp, idx) => (
                <div key={idx} className="space-y-1.5 border border-subtle p-3 rounded-xl bg-canvas/30">
                  <input
                    type="text"
                    value={tmp.name}
                    onChange={e => {
                      const updated = [...editingType.templates];
                      updated[idx].name = e.target.value;
                      setEditingType({ ...editingType, templates: updated });
                    }}
                    className="w-full bg-canvas border border-subtle rounded-lg px-2.5 py-1.5 text-xs font-semibold text-main outline-none mb-1"
                  />
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted">{t('frontTemplate')}</span>
                    <textarea
                      rows={2}
                      value={tmp.front}
                      onChange={e => {
                        const updated = [...editingType.templates];
                        updated[idx].front = e.target.value;
                        setEditingType({ ...editingType, templates: updated });
                      }}
                      className="w-full bg-canvas border border-subtle rounded-lg p-2 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted">{t('backTemplate')}</span>
                    <textarea
                      rows={2}
                      value={tmp.back}
                      onChange={e => {
                        const updated = [...editingType.templates];
                        updated[idx].back = e.target.value;
                        setEditingType({ ...editingType, templates: updated });
                      }}
                      className="w-full bg-canvas border border-subtle rounded-lg p-2 text-xs font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingType(null)}
                className="px-4 py-2 text-sm rounded-xl border border-subtle hover:bg-canvas"
              >
                {t('closeNoteEditor')}
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-2 text-sm rounded-xl bg-primary text-primary-contrast"
              >
                {t('saveNote')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
