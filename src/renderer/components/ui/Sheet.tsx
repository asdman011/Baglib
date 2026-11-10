'use client';

import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

export type SheetSide = 'start' | 'end' | 'bottom' | 'top';

export interface SheetProps {
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

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Sheet: React.FC<SheetProps> = ({
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
  const sheetRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    openerRef.current = document.activeElement as HTMLElement | null;

    const sheetEl = sheetRef.current;
    if (!sheetEl) return;

    const focusables = Array.from(sheetEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      sheetEl.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key === 'Tab') {
        const currentFocusables = Array.from(sheetEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        if (currentFocusables.length === 0) {
          event.preventDefault();
          return;
        }

        const first = currentFocusables[0];
        const last = currentFocusables[currentFocusables.length - 1];

        if (event.shiftKey) {
          if (document.activeElement === first || !sheetEl.contains(document.activeElement)) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !sheetEl.contains(document.activeElement)) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (openerRef.current && typeof openerRef.current.focus === 'function') {
        openerRef.current.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

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
