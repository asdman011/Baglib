'use client';

import React from 'react';
import { Modal } from '../ui/Modal';

/** Shared metadata chrome. Callers retain their operation and dismissal guards. */
export function MetadataModalLayout({ open, onClose, label, header, footer, children }: {
  open: boolean;
  onClose: () => void;
  label: string;
  header: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return <Modal open={open} onClose={onClose} asChild label={label}>
    <div data-metadata-layout className="relative w-full max-w-4xl max-h-[calc(100dvh-1.5rem)] flex flex-col overflow-hidden rounded-2xl border border-subtle bg-surface text-main font-sans shadow-2xl">
      <header className="shrink-0 flex items-center justify-between gap-3 border-b border-subtle p-4 sm:p-5 [&>div]:min-w-0 [&>div]:flex-1">{header}</header>
      <div data-metadata-body className="flex flex-col flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>
      {footer && <footer className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-subtle bg-canvas p-4 sm:p-5">{footer}</footer>}
    </div>
  </Modal>;
}
