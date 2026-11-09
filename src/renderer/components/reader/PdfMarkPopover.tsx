'use client';
import React, { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type { KnowledgeItemDTO } from '../../../shared/types/knowledge';
import { parseShapeMark, shapeLocation, type ShapeKind } from '../../../shared/pdf-markup';
import { HIGHLIGHT_COLORS } from '../../libs/reader/highlight-manager';
import type { TranslationKey } from '../../translations';
import { CommentThreads } from '../notes/CommentThreads';

export const shapeKindKeys: Record<ShapeKind, TranslationKey> = {
  rect: 'markupToolRect', oval: 'markupToolOval', arrow: 'markupToolArrow', text: 'markupToolText', area: 'markupToolArea', pin: 'markupToolComment',
};

/**
 * A study shape, text box or comment pin opened on the page: its text, colour and delete; a pin holds comment
 * threads (reply, resolve, reopen) through the same threads as notes (ADR-010).
 */
export function PdfMarkPopover({ item, at, onClose, onSaved, onDeleted, onThreadsChanged, t }: {
  item: KnowledgeItemDTO;
  at: { x: number; y: number };
  onClose: () => void;
  onSaved: (item: KnowledgeItemDTO) => void;
  onDeleted: (id: string) => void;
  onThreadsChanged: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const mark = parseShapeMark(item.location);
  const [text, setText] = useState(item.noteContent ?? '');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  if (!mark) return null;
  const save = async (patch: { color?: string; text?: string }) => {
    setFailed(false);
    try {
      const next = { ...mark, ...(patch.color ? { color: patch.color } : {}) };
      const saved: KnowledgeItemDTO = await window.electronAPI.knowledge.save({ actor: 'reader', id: item.id, workId: item.workId, type: 'note', location: shapeLocation(next), noteContent: patch.text ?? item.noteContent ?? '' });
      onSaved(saved);
    } catch { setFailed(true); }
  };
  const remove = async () => {
    if (!window.confirm(t('markDeleteConfirm'))) return;
    try { await window.electronAPI.knowledge.delete(item.id, 'reader'); onDeleted(item.id); } catch { setFailed(true); }
  };
  // Kept inside the window: opens beside the click, flipped when it would leave the screen.
  const width = 320;
  const left = Math.max(8, Math.min(at.x + 12, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(at.y + 12, window.innerHeight - 420));
  return <div role="dialog" aria-modal="false" aria-label={t(shapeKindKeys[mark.shape])} data-pdf-mark-popover={mark.shape}
    className="fixed z-[95] max-h-[70vh] overflow-y-auto rounded-xl border border-subtle bg-surface p-3 text-main shadow-2xl" style={{ left, top, width }}>
    <header className="mb-2 flex items-center gap-2">
      <strong className="text-sm">{t(shapeKindKeys[mark.shape])}</strong>
      <span className="text-xs text-muted">{t('page')} {mark.page}</span>
      <button type="button" aria-label={t('close')} title={t('close')} onClick={onClose} className="ms-auto rounded p-1 hover:bg-canvas"><X size={14} /></button>
    </header>
    <div className="mb-2 flex items-center gap-1.5" role="group" aria-label={t('markColor')}>
      {HIGHLIGHT_COLORS.map(swatch => <button key={swatch.id} type="button" data-mark-color={swatch.id} aria-pressed={mark.color === swatch.id} aria-label={swatch.id} onClick={() => void save({ color: swatch.id })}
        className={`size-5 rounded-full border border-black/10 ${mark.color === swatch.id ? 'ring-2 ring-emerald-500 ring-offset-1' : ''}`} style={{ backgroundColor: swatch.hex }} />)}
      <button type="button" data-mark-delete onClick={() => void remove()} className="ms-auto inline-flex items-center gap-1 rounded-lg border border-subtle px-2 py-1 text-xs text-red-600"><Trash2 size={12} />{t('delete')}</button>
    </div>
    {mark.shape === 'pin'
      ? <CommentThreads actor="reader" id={item.id} onChanged={onThreadsChanged} />
      : <form onSubmit={event => { event.preventDefault(); void save({ text }); }} className="space-y-2">
        <textarea data-mark-text dir="auto" autoFocus={mark.shape === 'text'} value={text} maxLength={4000} onChange={event => setText(event.target.value)} placeholder={t(mark.shape === 'text' ? 'markTextPlaceholder' : 'markNotePlaceholder')}
          className="block min-h-20 w-full rounded-lg border border-subtle bg-canvas p-2 text-sm leading-relaxed" />
        <button type="submit" data-mark-save className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs text-white">{t('save')}</button>
      </form>}
    {failed && <p role="alert" className="mt-2 text-xs text-red-600">{t('studyActionFailed')}</p>}
  </div>;
}
