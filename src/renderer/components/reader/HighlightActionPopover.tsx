'use client';

import { useWorkspace } from '../context/WorkspaceContext';
import React, { useState } from 'react';
import { Trash2, MessageSquare, Copy, Check, X } from 'lucide-react';
import type { KnowledgeItemDTO } from '../../../shared/types/knowledge';
import { HIGHLIGHT_COLORS } from '../../libs/reader/highlight-manager';

interface HighlightActionPopoverProps {
  highlight: KnowledgeItemDTO;
  position: { x: number; y: number };
  onChangeColor: (highlightId: string, newColor: string) => void;
  onSaveNote: (highlightId: string, noteContent: string) => void;
  onDelete: (highlightId: string) => void;
  onClose: () => void;
}

export const HighlightActionPopover: React.FC<HighlightActionPopoverProps> = ({
  highlight,
  position,
  onChangeColor,
  onSaveNote,
  onDelete,
  onClose,
}) => {
  const { t } = useWorkspace();
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(highlight.noteContent || '');
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    if (highlight.quotedText) {
      navigator.clipboard.writeText(highlight.quotedText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleSaveNote = () => {
    onSaveNote(highlight.id, noteText);
    setIsEditingNote(false);
  };

  return (
    <div
      role="dialog"
      aria-label={t('readerHighlightOptions')}
      className="fixed z-50 animate-in fade-in zoom-in-95 duration-150 select-none"
      style={{
        top: `${Math.max(60, position.y - 65)}px`,
        left: `${Math.max(160, Math.min(window.innerWidth - 180, position.x))}px`,
        transform: 'translateX(-50%)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-surface/95 backdrop-blur-xl border border-subtle shadow-2xl rounded-2xl p-2.5 text-xs text-main flex flex-col gap-2 min-w-[260px]">
        {/* Top Controls Row */}
        <div className="flex items-center justify-between gap-2">
          {/* 5 Colors */}
          <div className="flex items-center gap-1.5">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => onChangeColor(highlight.id, c.id)}
                title={c.label}
                className={`w-5 h-5 rounded-full hover:scale-125 transition-transform cursor-pointer shadow-xs border ${
                  highlight.color === c.id ? 'ring-2 ring-pale-sky-500 scale-110' : 'border-white/30'
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsEditingNote(!isEditingNote)}
              title={t('readerHighlightNote')}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                isEditingNote || highlight.noteContent
                  ? 'bg-pale-sky-500/15 border-pale-sky-500/40 text-pale-sky-600'
                  : 'border-subtle hover:bg-canvas text-muted hover:text-main'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleCopy}
              title={t('readerHighlightCopy')}
              className="p-1.5 rounded-lg border border-subtle hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => onDelete(highlight.id)}
              title={t('readerHighlightDelete')}
              className="p-1.5 rounded-lg border border-subtle hover:bg-rose-500/10 text-muted hover:text-rose-500 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              title={t('close')}
              className="p-1.5 rounded-lg hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Optional Note Editing Box */}
        {isEditingNote && (
          <div className="pt-2 border-t border-subtle/60 flex flex-col gap-2">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="اكتب ملاحظة حول هذا التظليل..."
              rows={2}
              className="w-full p-2 rounded-xl bg-canvas border border-subtle text-xs text-main outline-none focus:border-pale-sky-500 resize-none font-sans"
              autoFocus
            />
            <div className="flex justify-end gap-1.5">
              <button
                onClick={() => setIsEditingNote(false)}
                className="px-2.5 py-1 rounded-lg text-[11px] text-muted hover:bg-canvas cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveNote}
                className="px-3 py-1 rounded-lg text-[11px] bg-pale-sky-500 text-white font-bold hover:bg-pale-sky-600 shadow-xs cursor-pointer"
              >
                حفظ الملاحظة
              </button>
            </div>
          </div>
        )}

        {/* Existing Note Display if not editing */}
        {!isEditingNote && highlight.noteContent && (
          <div className="pt-1.5 border-t border-subtle/50 text-[11px] text-muted font-sans italic bg-surface/50 p-1.5 rounded-lg">
            &quot;{highlight.noteContent}&quot;
          </div>
        )}
      </div>
    </div>
  );
};
