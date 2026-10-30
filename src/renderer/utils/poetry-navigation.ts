import { validStudyTarget } from '../../shared/study-notes';
export const POETRY_OPEN_EVENT = 'baglib:poetry-open';
export interface PoetryLocation { poemId: number; from: number; to: number }
let pending: PoetryLocation | null = null;
export function openPoetryReference(location: PoetryLocation): void {
  if (!validStudyTarget(`poetry:ashaar:${location.poemId}:${location.from}:${location.to}`)) throw new Error('invalid-reference');
  pending = location;
  window.dispatchEvent(new CustomEvent(POETRY_OPEN_EVENT));
}
export function consumePoetryReference(): PoetryLocation | null {
  const result = pending; pending = null; return result;
}
