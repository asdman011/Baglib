'use client';
import { colorKeys } from './ReaderMarkupBar';
import { ActionMenu } from '../actions/ActionMenu';
import { measurementLabel } from '../../../shared/pdf-study-tools';
import { useWorkspace } from '../context/WorkspaceContext';
import React, { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type { KnowledgeItemDTO } from '../../../shared/types/knowledge';
import { parseShapeMark, shapeLocation, markKind, markPage, type ShapeKind } from '../../../shared/pdf-markup';
import { parseEpubLocation, serializeEpubLocation } from '../../../shared/epub-marks';
import { HIGHLIGHT_COLORS } from '../../libs/reader/highlight-manager';
import type { TranslationKey } from '../../translations';
import { CommentThreads } from '../notes/CommentThreads';
import { markKindKeys } from './PdfMarksList';

export const shapeKindKeys: Record<ShapeKind, TranslationKey> = {
  stamp: 'markupToolStamp', measure: 'markupToolMeasure', rect: 'markupToolRect', oval: 'markupToolOval', arrow: 'markupToolArrow', text: 'markupToolText', area: 'markupToolArea', pin: 'markupToolComment',
};

/**
 * A study shape, text mark, or comment pin opened on the page: its text, colour, delete and comment threads
 * (reply, resolve, reopen) through the same threads as notes (ADR-010, KEY-274).
 */
export function PdfMarkPopover({ item, at, initialContext, onClose, onSaved, onDeleted, onThreadsChanged, t }: {
  initialContext?: boolean;
  item: KnowledgeItemDTO;
  at: { x: number; y: number };
  onClose: () => void;
  onSaved: (item: KnowledgeItemDTO) => void;
  onDeleted: (id: string) => void;
  onThreadsChanged: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const { lang } = useWorkspace();
  const [contextAt, setContextAt] = useState(initialContext ? at : null);
  const contextChosen = React.useRef(false);
  const mark = parseShapeMark(item.location);
  const epubLoc = parseEpubLocation(item.location);
  const kind = markKind(item);
  const [text, setText] = useState(item.noteContent || item.questionText || '');
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<'content' | 'comments'>(kind === 'pin' ? 'comments' : 'content');

  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const activeColor = mark?.color ?? epubLoc?.color ?? item.color ?? 'amber';
  const locationLabel = epubLoc?.chapter
    ? epubLoc.chapter
    : (epubLoc?.page ?? mark?.page ?? markPage(item.location))
      ? `${t('page')} ${epubLoc?.page ?? mark?.page ?? markPage(item.location)}`
      : '';

  const save = async (patch: { color?: string; text?: string }) => {
    setFailed(false);
    try {
      if (epubLoc) {
        const nextLoc = serializeEpubLocation({
          ...epubLoc,
          ...(patch.color ? { color: patch.color } : {}),
        });
        const saved: KnowledgeItemDTO = await window.electronAPI.knowledge.save({
          actor: 'reader',
          id: item.id,
          workId: item.workId,
          type: item.knowledgeType || item.type || 'highlight',
          location: nextLoc,
          quotedText: item.quotedText,
          noteContent: patch.text !== undefined ? patch.text : (item.noteContent ?? ''),
          questionText: (item.knowledgeType === 'question' || item.type === 'question')
            ? (patch.text ?? item.questionText ?? '')
            : item.questionText,
          color: patch.color ?? item.color,
        });
        onSaved(saved);
      } else if (mark) {
        const next = { ...mark, ...(patch.color ? { color: patch.color } : {}) };
        const saved: KnowledgeItemDTO = await window.electronAPI.knowledge.save({
          actor: 'reader',
          id: item.id,
          workId: item.workId,
          type: 'note',
          location: shapeLocation(next),
          noteContent: patch.text !== undefined ? patch.text : (item.noteContent ?? ''),
        });
        onSaved(saved);
      } else {
        const saved: KnowledgeItemDTO = await window.electronAPI.knowledge.save({
          actor: 'reader',
          id: item.id,
          workId: item.workId,
          type: item.knowledgeType || item.type || 'highlight',
          location: item.location,
          quotedText: item.quotedText,
          noteContent: patch.text !== undefined ? patch.text : (item.noteContent ?? ''),
          color: patch.color ?? item.color,
        });
        onSaved(saved);
      }
    } catch {
      setFailed(true);
    }
  };

  const remove = async () => {
    if (!window.confirm(t('markDeleteConfirm'))) return;
    try {
      await window.electronAPI.knowledge.delete(item.id, 'reader');
      onDeleted(item.id);
    } catch {
      setFailed(true);
    }
  };

  // Kept inside the window: opens beside the click, flipped when it would leave the screen.
  const width = 340;
  const left = Math.max(8, Math.min(at.x + 12, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(at.y + 12, window.innerHeight - 420));
  const titleKey = mark ? shapeKindKeys[mark.shape] : markKindKeys[kind] || 'markKindNote';

  if(contextAt) return <ActionMenu portal surface="mark" t={t} anchor={contextAt} onClose={()=>{setContextAt(null);if(!contextChosen.current)onClose();}} handlers={{
    edit: () => {contextChosen.current=true;setTab('content');},
    comment: () => {contextChosen.current=true;setTab('comments');},
    colors: mark?.shape === 'stamp' ? undefined : {children:HIGHLIGHT_COLORS.map(color=>({id:color.id,label:t(colorKeys[color.id]),icon:<span className="inline-block size-3 rounded-full" style={{backgroundColor:color.hex}} />,onClick:()=>{contextChosen.current=true;return save({color:color.id});}}))},
    delete: () => {contextChosen.current=true;return remove();},
  }} />;
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t(titleKey)}
      data-pdf-mark-popover={mark?.shape || kind}
      className="fixed z-[95] max-h-[70vh] overflow-y-auto rounded-xl border border-subtle bg-surface p-3 text-main shadow-2xl"
      style={{ left, top, width }}
    >
      <header className="mb-2 flex items-center gap-2">
        <strong className="text-sm">{t(titleKey)}</strong>
        {locationLabel && <span className="truncate max-w-[150px] text-xs text-muted" title={locationLabel}>{locationLabel}</span>}
        <button
          type="button"
          data-mark-popover-close
          aria-label={t('close')}
          title={t('close')}
          onClick={onClose}
          className="ms-auto rounded p-1 hover:bg-canvas"
        >
          <X size={14} />
        </button>
      </header>

      <div className="mb-2 flex items-center gap-1.5" role="group" aria-label={t('markColor')}>
        {mark?.shape !== 'stamp' && HIGHLIGHT_COLORS.map(swatch => (
          <button
            key={swatch.id}
            type="button"
            data-mark-color={swatch.id}
            aria-pressed={activeColor === swatch.id}
            aria-label={swatch.id}
            onClick={() => void save({ color: swatch.id })}
            className={`size-5 rounded-full border border-black/10 ${
              activeColor === swatch.id ? 'ring-2 ring-emerald-500 ring-offset-1' : ''
            }`}
            style={{ backgroundColor: swatch.hex }}
          />
        ))}
        <button
          type="button"
          data-mark-delete
          onClick={() => void remove()}
          className="ms-auto inline-flex items-center gap-1 rounded-lg border border-subtle px-2 py-1 text-xs text-red-600 hover:bg-red-500/10"
        >
          <Trash2 size={12} />
          {t('delete')}
        </button>
      </div>

      <div className="mb-2 flex items-center gap-1 border-b border-subtle/50 pb-1">
        <button
          type="button"
          data-mark-tab="content"
          onClick={() => setTab('content')}
          className={`rounded px-2 py-0.5 text-[11px] font-medium transition-all ${
            tab === 'content' ? 'bg-canvas font-bold text-main border border-subtle' : 'text-muted hover:text-main'
          }`}
        >
          {t('markKindDetails')}
        </button>
        <button
          type="button"
          data-mark-tab="comments"
          onClick={() => setTab('comments')}
          className={`rounded px-2 py-0.5 text-[11px] font-medium transition-all ${
            tab === 'comments' ? 'bg-canvas font-bold text-main border border-subtle' : 'text-muted hover:text-main'
          }`}
        >
          {t('markKindComments')}
        </button>
      </div>

      {tab === 'comments' ? (
        <CommentThreads actor="reader" id={item.id} onChanged={onThreadsChanged} />
      ) : (
        <div className="space-y-2">
          {item.quotedText && (
            <blockquote className="border-s-2 border-subtle ps-2 text-[11px] font-serif text-muted italic line-clamp-3">
              &quot;{item.quotedText}&quot;
            </blockquote>
          )}
          <form
            onSubmit={event => {
              event.preventDefault();
              void save({ text });
            }}
            className="space-y-2"
          >
            <textarea
              readOnly={mark?.shape === 'stamp' || mark?.shape === 'measure'}
              data-mark-text
              dir="auto"
              autoFocus={mark?.shape === 'text' || !item.noteContent}
              value={mark?.shape === 'measure' ? measurementLabel(mark, lang) : text}
              maxLength={4000}
              onChange={event => setText(event.target.value)}
              placeholder={t(mark?.shape === 'text' ? 'markTextPlaceholder' : 'markNotePlaceholder')}
              className="block min-h-20 w-full rounded-lg border border-subtle bg-canvas p-2 text-sm leading-relaxed"
            />
            <button
              type="submit"
              data-mark-save
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs text-white hover:bg-amber-700"
            >
              {t('save')}
            </button>
          </form>
        </div>
      )}

      {failed && <p role="alert" className="mt-2 text-xs text-red-600">{t('studyActionFailed')}</p>}
    </div>
  );
}
