'use client';

import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnBackdropClick?: boolean;
  className?: string;
}

const sizeStyles: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  closeOnBackdropClick = true,
  className = '',
}) => {
  const { dir, t } = useWorkspace();
  const titleId = useId();
  const descId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    openerRef.current = document.activeElement as HTMLElement | null;

    const modalEl = modalRef.current;
    if (!modalEl) return;

    // Focus the first focusable element inside the modal
    const focusables = Array.from(modalEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      modalEl.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key === 'Tab') {
        const currentFocusables = Array.from(modalEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        if (currentFocusables.length === 0) {
          event.preventDefault();
          return;
        }

        const first = currentFocusables[0];
        const last = currentFocusables[currentFocusables.length - 1];

        if (event.shiftKey) {
          if (document.activeElement === first || !modalEl.contains(document.activeElement)) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !modalEl.contains(document.activeElement)) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      // Return focus to the opener
      if (openerRef.current && typeof openerRef.current.focus === 'function') {
        openerRef.current.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs transition-opacity duration-200"
      onClick={closeOnBackdropClick ? (e) => {
        if (e.target === e.currentTarget) onClose();
      } : undefined}
      dir={dir}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`w-full ${sizeStyles[size]} bg-surface border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh] text-text font-sans outline-none ${className}`}
      >
        {(Boolean(title) || Boolean(onClose)) && (
          <div className="p-4 sm:p-5 border-b border-border/70 flex items-center justify-between gap-3 shrink-0">
            <div className="min-w-0 flex-1">
              {title && (
                <h2 id={titleId} className="font-display text-base sm:text-lg font-bold text-text truncate">
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
        )}
        <div className="p-4 sm:p-5 overflow-y-auto overscroll-contain flex-1 min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
};
