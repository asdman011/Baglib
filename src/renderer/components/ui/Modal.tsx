'use client';

import React, { useId, type RefObject } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

export interface ModalProps {
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

export const Modal: React.FC<ModalProps> = ({
  asChild = false,
  focusRef,
  initialFocus,
  returnFocus,
  label,
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
  const modalRef = useDialogFocus(open, onClose, initialFocus, focusRef, returnFocus);

  if (!open) return null;

  if (asChild) {
    const panel = React.Children.only(children) as React.ReactElement<React.HTMLAttributes<HTMLDivElement>>;
    return React.cloneElement(panel, {
      ref: modalRef,
      role: panel.props.role ?? 'dialog',
      'aria-modal': true,
      'aria-label': panel.props['aria-label'] ?? label,
      tabIndex: panel.props.tabIndex ?? -1,
      'data-ui-dialog': 'modal',
    } as React.HTMLAttributes<HTMLDivElement> & { ref: typeof modalRef });
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs transition-opacity duration-200"
      onClick={closeOnBackdropClick ? (e) => {
        if (e.target === e.currentTarget) onClose();
      } : undefined}
      dir={dir}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        data-ui-dialog="modal"
        aria-label={label}
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
