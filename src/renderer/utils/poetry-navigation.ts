import { validStudyTarget } from '../../shared/study-notes';
export const POETRY_OPEN_EVENT = 'baglib:poetry-open';
export interface PoetryLocation { poemId: number; from: number; to: number; tabId?: string }
let pending: PoetryLocation | null = null;
export function openPoetryReference(location: PoetryLocation): void {
  if (!validStudyTarget(`poetry:ashaar:${location.poemId}:${location.from}:${location.to}`)) throw new Error('invalid-reference');
  pending = location;
  window.dispatchEvent(new CustomEvent(POETRY_OPEN_EVENT, { detail: { tabId: location.tabId } }));
}
export function consumePoetryReference(tab?: string | { id: string; isFocused: boolean } | null): PoetryLocation | null {
  if (!pending) return null;
  if (tab) {
    if (typeof tab === 'string') {
      if (pending.tabId && pending.tabId !== tab) return null;
    } else if (pending.tabId) {
      if (pending.tabId !== tab.id) return null;
    } else if (!tab.isFocused) {
      return null;
    }
  }
  const result = pending; pending = null; return result;
}
