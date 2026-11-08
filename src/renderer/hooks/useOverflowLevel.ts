'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * How many steps of compaction a toolbar needs to fit: 0 shows everything, `max` is the most compact. The row steps
 * down only when its content is wider than the room it has, and steps back up once the room is at least the width the
 * wider layout needed when it overflowed (recorded at that moment), so it never oscillates between two levels.
 *
 * `room` gives the width available when it is not the element's own width — for a floating bar, its container's.
 */
export function useOverflowLevel(ref: RefObject<HTMLElement | null>, max: number, room?: (element: HTMLElement) => { width: number; observe?: HTMLElement | null }): number {
  const [level, setLevel] = useState(0);
  const needed = useRef<number[]>([]);
  const roomRef = useRef(room);
  useEffect(() => { roomRef.current = room; });
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const available = () => roomRef.current ? roomRef.current(element).width : element.clientWidth;
    const fit = () => setLevel(current => {
      const width = available();
      if (element.scrollWidth > width + 1 && current < max) { needed.current[current] = element.scrollWidth; return current + 1; }
      if (current > 0 && width >= (needed.current[current - 1] ?? Infinity)) return current - 1;
      return current;
    });
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);
    const outer = roomRef.current?.(element).observe;
    if (outer) observer.observe(outer);
    return () => observer.disconnect();
  }, [ref, max, level]);
  return level;
}
