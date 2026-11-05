'use client';
import { useEffect } from 'react';

/** Where the reader is right now, as a study link: a book page, an ayah, a hadith, a poem, or a lecture moment. */
export interface CompanionContext { kind: 'book' | 'quran' | 'hadith' | 'poem' | 'lecture'; target: string; label: string }

/** The views that have a companion pane, by their workspace view name. */
export type CompanionView = 'reader' | 'quran' | 'sunnah' | 'bayan' | 'lectures';
type Getter = () => CompanionContext | null;

// One getter per view, so the pane always asks the view on screen. A view that is leaving (or still mounted
// while the next one loads) can never answer for another.
const getters = new Map<CompanionView, { token: symbol; get: Getter }>();
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };

export function companionContext(view: string): CompanionContext | null {
  try { return getters.get(view as CompanionView)?.get() ?? null; } catch { return null; }
}

export function onCompanionContextChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * A view registers how to read its current location; the companion note pane asks when it needs it.
 * A getter (not a value) keeps fast-changing places, such as a lecture's playback time, exact at the moment of use.
 */
export function useCompanionContext(view: CompanionView, getter: Getter, deps: React.DependencyList): void {
  useEffect(() => {
    const token = Symbol(view);
    getters.set(view, { token, get: getter });
    notify();
    return () => { if (getters.get(view)?.token === token) { getters.delete(view); notify(); } };
    // The caller lists what the getter reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export const COMPANION_INSERT = 'baglib:companion-insert';
/** Sends text to the companion note's editor at its cursor. */
export function insertIntoCompanion(text: string): void {
  window.dispatchEvent(new CustomEvent(COMPANION_INSERT, { detail: text }));
}
