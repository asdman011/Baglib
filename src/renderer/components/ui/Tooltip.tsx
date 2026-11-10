'use client';

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  side?: 'top' | 'bottom';
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  side = 'top',
  className = '',
}) => {
  const { dir } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !bubbleRef.current) return;
    const rect = bubbleRef.current.getBoundingClientRect();
    const margin = 8;
    const nudge =
      rect.left < margin
        ? margin - rect.left
        : rect.right > window.innerWidth - margin
        ? window.innerWidth - margin - rect.right
        : 0;
    if (nudge) setShift((prev) => prev + nudge);
  }, [open]);

  const show = () => setOpen(true);
  const hide = () => {
    setOpen(false);
    setShift(0);
  };

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex align-middle"
      onMouseEnter={show}
      onMouseLeave={hide}
      dir={dir}
    >
      {React.cloneElement(children, {
        onFocus: (e: React.FocusEvent<HTMLElement>) => {
          children.props.onFocus?.(e);
          show();
        },
        onBlur: (e: React.FocusEvent<HTMLElement>) => {
          children.props.onBlur?.(e);
          hide();
        },
        'aria-describedby': open ? id : undefined,
      })}

      {open && (
        <span
          ref={bubbleRef}
          role="tooltip"
          id={id}
          style={{ transform: `translateX(${shift}px)` }}
          className={`absolute start-1/2 -translate-x-1/2 z-50 whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-1 text-center text-xs font-normal leading-relaxed text-text shadow-md pointer-events-none ${
            side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } ${className}`}
        >
          {content}
        </span>
      )}
    </span>
  );
};
