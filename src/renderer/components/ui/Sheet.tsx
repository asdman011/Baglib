'use client';

import React, { useId, type RefObject } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

export type SheetSide = 'start' | 'end' | 'bottom' | 'top';

export interface SheetProps {
  /** Keep an existing panel's markup and layout while applying shared dialog behavior. */
  asChild?: boolean;
  focusRef?: RefObject<HTMLDivElement | null>;
  initialFocus?: RefObject<HTMLElement | null>;
  returnFocus?: RefObject<HTMLElement | null>;
  label?: string;
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  side?: SheetSide;
  children: React.ReactNode;
  closeOnBackdropClick?: boolean;
  className?: string;
}

const sideStyles: Record<SheetSide, string> = {
  start: 'inset-y-0 start-0 w-full max-w-sm sm:max-w-md border-e border-border h-full',
  end: 'inset-y-0 end-0 w-full max-w-sm sm:max-w-md border-s border-border h-full',
  bottom: 'inset-x-0 bottom-0 max-h-[85vh] border-t border-border w-full rounded-t-2xl',
  top: 'inset-x-0 top-0 max-h-[85vh] border-b border-border w-full rounded-b-2xl',
};

export const Sheet: React.FC<SheetProps> = ({
  asChild = false,
  focusRef,
  initialFocus,
  returnFocus,
  label,
  open,
  onClose,
  title,
  description,
  side = 'end',
  children,
  closeOnBackdropClick = true,
  className = '',
}) => {
  const { dir, t } = useWorkspace();
  const titleId = useId();
  const descId = useId();
  const sheetRef = useDialogFocus(open, onClose, initialFocus, focusRef, returnFocus);

  if (!open) return null;

  if (asChild) {
    const panel = React.Children.only(children) as React.ReactElement<React.HTMLAttributes<HTMLDivElement>>;
    return React.cloneElement(panel, {
      ref: sheetRef,
      role: panel.props.role ?? 'dialog',
      'aria-modal': true,
      'aria-label': panel.props['aria-label'] ?? label,
      tabIndex: panel.props.tabIndex ?? -1,
      'data-ui-dialog': 'sheet',
    } as React.HTMLAttributes<HTMLDivElement> & { ref: typeof sheetRef });
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity duration-200"
      onClick={closeOnBackdropClick ? (e) => {
        if (e.target === e.currentTarget) onClose();
      } : undefined}
      dir={dir}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        data-ui-dialog="sheet"
        aria-label={label}
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`fixed bg-surface shadow-2xl flex flex-col text-text font-sans outline-none ${sideStyles[side]} ${className}`}
      >
        <div className="p-4 sm:p-5 border-b border-border/70 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            {title && (
              <h2 id={titleId} className="font-display text-base font-bold text-text truncate">
                {title}
              </h2>
            )}
            {description && (
              <p id={descId} className="text-xs text-text-muted mt-0.5 font-sans leading-relaxed">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            title={t('close')}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-canvas transition-colors focus-visible:outline-2 focus-visible:outline-focus cursor-pointer shrink-0"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="p-4 sm:p-5 overflow-y-auto overscroll-contain flex-1 min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
};
