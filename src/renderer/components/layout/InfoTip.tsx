'use client';
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

/**
 * A small information icon with a short explanation (ADR-012 settings and export). It opens on hover, on keyboard
 * focus and on click or tap, closes with Escape or on leaving, and stays inside the viewport in RTL and LTR.
 */
export function InfoTip({ label, text, ariaLabel }: { label: string; text: string; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [shift, setShift] = useState(0);
  const [below, setBelow] = useState(true);
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); setPinned(false); } };
    const outside = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) { setOpen(false); setPinned(false); } };
    window.addEventListener('keydown', close);
    window.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('keydown', close); window.removeEventListener('pointerdown', outside); };
  }, [open]);
  // Keep the bubble in the viewport: nudge it sideways and open upwards near the bottom edge.
  useLayoutEffect(() => {
    if (!open || !bubble.current) return;
    const rect = bubble.current.getBoundingClientRect();
    const margin = 8;
    const nudge = rect.left < margin ? margin - rect.left : rect.right > window.innerWidth - margin ? window.innerWidth - margin - rect.right : 0;
    if (nudge) setShift(value => value + nudge);
    if (below && rect.bottom > window.innerHeight - margin) setBelow(false);
  }, [open, below]);
  const show = () => setOpen(true);
  const hide = () => { if (!pinned) { setOpen(false); setShift(0); setBelow(true); } };
  return <span ref={box} className="relative inline-flex align-middle" onMouseEnter={show} onMouseLeave={hide}>
    <button type="button" data-info-tip={label} aria-label={ariaLabel} aria-expanded={open} aria-describedby={open ? id : undefined}
      onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); setPinned(false); } }}
      onFocus={show} onBlur={hide} onClick={() => { setPinned(value => !value || !open); setOpen(true); }}
      className="rounded-full p-0.5 text-muted hover:text-main focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500">
      <Info size={13} aria-hidden="true" />
    </button>
    {open && <span ref={bubble} role="tooltip" id={id} data-info-tip-text style={{ transform: `translateX(${shift}px)` }}
      className={`absolute start-0 z-[95] w-64 max-w-[calc(100vw-1rem)] rounded-lg border border-subtle bg-surface p-2 text-start text-xs font-normal leading-relaxed text-main shadow-xl ${below ? 'top-full mt-1' : 'bottom-full mb-1'}`}>
      {text}
    </span>}
  </span>;
}
