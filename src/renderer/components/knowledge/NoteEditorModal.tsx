'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Lock, RotateCcw, Split, Check, Layers, AlertTriangle } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { SafeCardRenderer } from './SafeCardRenderer';
import { noteFieldLabel, noteTypeLabel } from './note-type-labels';
import { ImageOcclusionEditor } from './ImageOcclusionEditor';
import { generateCards } from '../../../shared/revision/template-engine';
import type { CardNote, CardNoteType, SaveNoteInput } from '../../../shared/types/card-notes';

export interface NoteEditorModalProps {
  note?: CardNote | null;
  initialNoteTypeId?: string;
  deckId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (note: CardNote) => void;
}

export const NoteEditorModal: React.FC<NoteEditorModalProps> = ({
  note,
  initialNoteTypeId,
  deckId,
  isOpen,
  onClose,
  onSaved,
}) => {
  const { t, dir } = useWorkspace();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  });
  const [noteTypes, setNoteTypes] = useState<CardNoteType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [protectSourceText, setProtectSourceText] = useState(false);
  const [decksForNote, setDecksForNote] = useState<string[]>([]);
  const [showSharedPrompt, setShowSharedPrompt] = useState(false);
  const [compareField, setCompareField] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<'front' | 'back'>('front');
  const [previewOrd, setPreviewOrd] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load note types and settings on open
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const load = async () => {
      try {
        const types = await window.electronAPI.cardNotes.listTypes();
        if (!active) return;
        setNoteTypes(types);

        const isProtected = await window.electronAPI.settings.get('revision.protectSourceText', false);
        if (!active) return;
        setProtectSourceText(Boolean(isProtected));

        if (note) {
          setSelectedTypeId(note.noteTypeId);
          setFields({ ...note.fields });
          const decks = await window.electronAPI.cardNotes.getDecks(note.id);
          if (!active) return;
          setDecksForNote(decks);
        } else {
          const typeId = initialNoteTypeId || types[0]?.id || 'stock-basic';
          setSelectedTypeId(typeId);
          const currentType = types.find((nt: CardNoteType) => nt.id === typeId) || types[0];
          const initialFields: Record<string, string> = {};
          if (currentType) {
            for (const f of currentType.fields) {
              initialFields[f.name] = '';
            }
          }
          setFields(initialFields);
          setDecksForNote([]);
        }
      } catch (err: unknown) {
        if (active) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg || tRef.current('noteEditorLoadFailed'));
        }
      }
    };

    load();
    return () => { active = false; };
  }, [isOpen, note, initialNoteTypeId]);

  const selectedType = useMemo(
    () => noteTypes.find(t => t.id === selectedTypeId) || noteTypes[0],
    [noteTypes, selectedTypeId]
  );

  // Handle note type switch
  const handleTypeChange = (newTypeId: string) => {
    setSelectedTypeId(newTypeId);
    const newType = noteTypes.find(t => t.id === newTypeId);
    if (!newType) return;

    const updatedFields: Record<string, string> = {};
    for (const f of newType.fields) {
      updatedFields[f.name] = fields[f.name] ?? '';
    }
    setFields(updatedFields);
    setPreviewOrd(0);
  };

  const handleFieldChange = (name: string, value: string) => {
    setFields(prev => ({ ...prev, [name]: value }));
  };

  // Generated card previews
  const generatedPreviews = useMemo(() => {
    if (!selectedType) return [];
    return generateCards(selectedType, fields);
  }, [selectedType, fields]);

  const currentPreviewCard = generatedPreviews.find(c => c.ord === previewOrd) || generatedPreviews[0];

  // Image occlusion (KEY-391): the drawing editor owns the Occlusion and Image fields.
  const isImageOcclusion = selectedType?.kind === 'image_occlusion';
  const ioStrings = useMemo(() => ({ toggleMasks: t('ioToggleMasks'), noImage: t('ioNoImage') }), [t]);
  const handleOcclusionChange = React.useCallback((next: { Occlusion: string; Image: string }) => {
    setFields(prev => (prev.Occlusion === next.Occlusion && prev.Image === next.Image ? prev : { ...prev, ...next }));
  }, []);

  // Save handler
  const handleSaveClick = async () => {
    if (saving) return;
    setError(null);

    // If existing note is in more than one deck, show prompt
    if (note && decksForNote.length > 1 && deckId) {
      setShowSharedPrompt(true);
      return;
    }

    await doSave('everywhere');
  };

  const doSave = async (scope: 'deck-only' | 'everywhere') => {
    setSaving(true);
    setShowSharedPrompt(false);
    try {
      let targetNoteId = note?.id;

      if (scope === 'deck-only' && note && deckId) {
        // Fork for this deck first
        const forked = await window.electronAPI.cardNotes.forkNote(note.id, deckId);
        targetNoteId = forked.newNote.id;
      }

      const saveInput: SaveNoteInput = {
        id: targetNoteId,
        noteTypeId: selectedTypeId,
        fields,
        deckId: !targetNoteId ? deckId : undefined,
      };

      const result = await window.electronAPI.cardNotes.saveNote(saveInput);
      onSaved?.(result.note);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg === 'source-text-protected' ? t('sourceTextProtected') : msg || t('noteSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div
        dir={dir}
        data-io={isImageOcclusion ? '1' : undefined}
        className={`flex flex-col w-full ${isImageOcclusion ? 'max-w-6xl' : 'max-w-4xl'} max-h-[90vh] bg-surface rounded-2xl border border-subtle shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200`}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-subtle bg-surface">
          <div className="flex items-center gap-3">
            <Layers className="size-5 text-primary" />
            <h2 className="text-lg font-bold text-main">
              {note ? t('editNote') : t('newNote')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeNoteEditor')}
            data-close-note-editor
            className="p-2 text-muted hover:text-main rounded-lg hover:bg-canvas transition-colors"
          >
            <X className="size-5" />
          </button>
        </header>

        {/* Content area: Split into Fields Editor and Live Preview */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-subtle min-h-[400px]">
          {/* Left Column: Form Fields */}
          <div className="p-6 space-y-5 overflow-y-auto">
            {error && (
              <div className="p-3 text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Note Type Selector */}
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                {t('noteType')}
              </label>
              <select
                value={selectedTypeId}
                disabled={Boolean(note)}
                onChange={e => handleTypeChange(e.target.value)}
                data-note-type-select
                className="w-full bg-canvas border border-subtle rounded-xl px-3 py-2 text-sm text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
              >
                {noteTypes.map(nt => (
                  <option key={nt.id} value={nt.id}>
                    {noteTypeLabel(nt, t)} {nt.stockKind ? `(${t('builtinNoteType')})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Fields Inputs */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">
                {t('noteFields')}
              </h3>

              {isImageOcclusion && (
                <ImageOcclusionEditor
                  key={`${note?.id ?? 'new'}-${selectedTypeId}`}
                  occlusion={fields.Occlusion ?? ''}
                  image={fields.Image ?? ''}
                  onChange={handleOcclusionChange}
                />
              )}

              {selectedType?.fields.map(f => {
                if (isImageOcclusion && (f.name === 'Occlusion' || f.name === 'Image')) return null;
                const isLocked = f.sourceText && protectSourceText;
                const originalSnapshot = note?.sourceSnapshot?.[f.name];
                const isEdited = Boolean(originalSnapshot && fields[f.name] !== originalSnapshot);

                return (
                  <div key={f.name} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-main flex items-center gap-1.5">
                        <span>{selectedType ? noteFieldLabel(selectedType, f.name, t) : f.name}</span>
                        {f.sourceText && (
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">
                            {t('sourceTextProtected')}
                          </span>
                        )}
                        {isLocked && <Lock className="size-3 text-muted" />}
                      </label>

                      {/* Edited marker, Compare & Restore buttons */}
                      {isEdited && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium">
                            {t('editedByYou')}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCompareField(f.name)}
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            <Split className="size-3" />
                            {t('compareOriginal')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFieldChange(f.name, originalSnapshot ?? '')}
                            className="text-xs text-muted hover:text-main flex items-center gap-1"
                            title={t('restoreOriginal')}
                          >
                            <RotateCcw className="size-3" />
                            {t('restoreOriginal')}
                          </button>
                        </div>
                      )}
                    </div>

                    <textarea
                      rows={3}
                      dir={f.rtl ? 'rtl' : 'ltr'}
                      disabled={isLocked}
                      data-field-name={f.name}
                      value={fields[f.name] ?? ''}
                      onChange={e => handleFieldChange(f.name, e.target.value)}
                      placeholder={isLocked ? t('sourceTextProtected') : ''}
                      className="w-full bg-canvas border border-subtle rounded-xl p-3 text-sm text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed resize-y"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Live Card Preview */}
          <div className="p-6 flex flex-col bg-canvas/30 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">
                {t('cardPreview')} ({generatedPreviews.length})
              </h3>

              {/* Side toggle */}
              <div className="inline-flex rounded-lg border border-subtle p-0.5 bg-surface text-xs">
                <button
                  type="button"
                  onClick={() => setPreviewTab('front')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    previewTab === 'front' ? 'bg-primary text-primary-contrast font-medium' : 'text-muted'
                  }`}
                >
                  {t('cardPreviewFront')}
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab('back')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    previewTab === 'back' ? 'bg-primary text-primary-contrast font-medium' : 'text-muted'
                  }`}
                >
                  {t('cardPreviewBack')}
                </button>
              </div>
            </div>

            {/* Ordinal Tabs if multiple cards generated */}
            {generatedPreviews.length > 1 && (
              <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1">
                {generatedPreviews.map((card, idx) => (
                  <button
                    key={card.ord}
                    type="button"
                    onClick={() => setPreviewOrd(card.ord)}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                      previewOrd === card.ord
                        ? 'border-primary bg-primary/10 text-primary font-semibold'
                        : 'border-subtle bg-surface text-muted hover:text-main'
                    }`}
                  >
                    {t('noteCardTab', { n: idx + 1 })}
                  </button>
                ))}
              </div>
            )}

            {/* Sandbox Card Frame */}
            <div className="flex-1 flex flex-col justify-center items-center p-4 bg-surface rounded-2xl border border-subtle shadow-xs min-h-[260px]">
              {currentPreviewCard ? (
                <SafeCardRenderer
                  html={previewTab === 'front' ? currentPreviewCard.front : currentPreviewCard.back}
                  css={selectedType?.css}
                  side={previewTab}
                  rtl={selectedType?.fields[0]?.rtl}
                  className="w-full"
                  ioStrings={ioStrings}
                />
              ) : (
                <p className="text-xs text-muted italic">{t('noteEditorFrontEmpty')}</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <footer className="flex items-center justify-end gap-3 px-6 py-4 border-t border-subtle bg-surface">
          <button
            type="button"
            onClick={onClose}
            data-close-note-editor
            className="px-4 py-2 text-sm font-medium text-muted hover:text-main rounded-xl hover:bg-canvas transition-colors"
          >
            {t('closeNoteEditor')}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveClick}
            data-save-note-btn
            className="px-5 py-2 text-sm font-semibold text-primary-contrast bg-primary hover:bg-primary-hover rounded-xl shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Check className="size-4" />
            <span>{t('saveNote')}</span>
          </button>
        </footer>
      </div>

      {/* Compare Modal */}
      {compareField && note?.sourceSnapshot?.[compareField] && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <div dir={dir} className="w-full max-w-xl bg-surface rounded-2xl border border-subtle p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-main">{t('compareOriginal')} - {compareField}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted">{t('originalSourceText')}</span>
                <div className="p-3 bg-canvas rounded-xl border border-subtle text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {note.sourceSnapshot[compareField]}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-semibold text-amber-600">{t('yourEditedText')}</span>
                <div className="p-3 bg-canvas rounded-xl border border-subtle text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {fields[compareField]}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCompareField(null)}
                className="px-4 py-2 text-sm rounded-xl border border-subtle hover:bg-canvas"
              >
                {t('closeNoteEditor')}
              </button>
              <button
                type="button"
                onClick={() => {
                  handleFieldChange(compareField, note.sourceSnapshot![compareField]);
                  setCompareField(null);
                }}
                className="px-4 py-2 text-sm rounded-xl bg-primary text-primary-contrast"
              >
                {t('restoreOriginal')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shared Note Scope Prompt */}
      {showSharedPrompt && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <div dir={dir} className="w-full max-w-md bg-surface rounded-2xl border border-subtle p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-main">{t('sharedCardEditPrompt')}</h3>
            <p className="text-sm text-muted">{t('sharedCardEditDesc')}</p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => doSave('deck-only')}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold bg-primary text-primary-contrast hover:bg-primary-hover transition-colors"
              >
                {t('changeInThisDeckOnly')} ({t('builtinNoteType')})
              </button>
              <button
                type="button"
                onClick={() => doSave('everywhere')}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-medium border border-subtle hover:bg-canvas transition-colors"
              >
                {t('changeEverywhere')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
