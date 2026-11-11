'use client';

import React from 'react';
import { X, BookOpen } from 'lucide-react';
import type { TranslationKey } from '../../translations';

interface ZenFootnotePopoverProps {
  footnote: {
    index: string | number;
    text: string;
    x: number;
    y: number;
  } | null;
  onClose: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const ZenFootnotePopover: React.FC<ZenFootnotePopoverProps> = ({
  footnote,
  onClose,
  t,
}) => {
  if (!footnote) return null;

  return (
    <div
      role="tooltip"
      className="fixed z-50 animate-in fade-in zoom-in-95 duration-150 select-none max-w-sm w-full"
      style={{
        left: Math.max(16, Math.min(window.innerWidth - 360, footnote.x - 160)),
        top: Math.max(70, Math.min(window.innerHeight - 180, footnote.y - 120)),
      }}
    >
      <div className="bg-surface/95 backdrop-blur-xl border border-pale-sky-500/40 shadow-2xl rounded-2xl p-3.5 text-xs text-main space-y-2">
        <div className="flex items-center justify-between text-muted border-b border-subtle/50 pb-1.5">
          <span className="font-bold text-pale-sky-600 dark:text-pale-sky-400 flex items-center gap-1.5 font-serif text-[13px]">
            <BookOpen className="w-3.5 h-3.5" />
            {t('footnotePopoverTitle')} [{footnote.index}]
          </span>
          <button
            onClick={onClose}
            title={t('closeFootnote')}
            className="p-1 rounded-lg hover:bg-canvas text-muted hover:text-main cursor-pointer"
           aria-label={t('closeFootnote')}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-main leading-relaxed font-serif text-[12px] max-h-40 overflow-y-auto">
          {footnote.text}
        </p>
      </div>
    </div>
  );
};
