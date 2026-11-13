'use client';
import { useEffect, useRef, type RefObject } from 'react';

/**
 * KEY-339: Ctrl (or ⌘) + mouse wheel zooms a reader in and out; the plain wheel keeps scrolling.
 * The browser's own page zoom is blocked inside the reader. A wheel notch is one step; trackpad pinches, which
 * arrive as many small ctrl+wheel events, add up until they reach one notch.
 */
export const WHEEL_NOTCH = 60;

export function ctrlWheelStep(event: Pick<WheelEvent, 'ctrlKey' | 'metaKey' | 'deltaY' | 'deltaMode'>, carry: { value: number }): -1 | 0 | 1 {
  if (!event.ctrlKey && !event.metaKey) return 0;
  // deltaMode 1 = lines, 2 = pages: treat either as a full notch.
  carry.value += event.deltaMode ? Math.sign(event.deltaY) * WHEEL_NOTCH : event.deltaY;
  if (Math.abs(carry.value) < WHEEL_NOTCH) return 0;
  const step = carry.value < 0 ? 1 : -1;
  carry.value = 0;
  return step;
}

export function useCtrlWheelZoom(ref: RefObject<HTMLElement | null>, onStep: (step: 1 | -1, event: WheelEvent) => void, enabled = true) {
  const latest = useRef(onStep);
  useEffect(() => { latest.current = onStep; }, [onStep]);
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    const carry = { value: 0 };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const step = ctrlWheelStep(event, carry);
      if (step) latest.current(step, event);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [ref, enabled]);
}
