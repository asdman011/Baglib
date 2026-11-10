import { validStudyTarget } from '../../../shared/study-notes';
export const CONTINUE_KEY = 'islamic.continue.v1';
export const CONTINUE_KINDS = ['quran','sunnah','poetry'] as const;
export type ContinueKind = typeof CONTINUE_KINDS[number];
export interface ContinueReading { target: string; label: string }
export function continueReading(value: unknown, kind: ContinueKind): ContinueReading | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<ContinueReading>;
  if (typeof entry.target !== 'string' || !entry.target.startsWith(kind + ':') || !validStudyTarget(entry.target)) return null;
  if (typeof entry.label !== 'string' || !entry.label.trim() || entry.label.length > 1000) return null;
  return { target: entry.target, label: entry.label };
}
export async function saveContinueReading(kind: ContinueKind, entry: ContinueReading) {
  const valid = continueReading(entry, kind);
  if (!valid) return;
  await window.electronAPI.settings.set(`${CONTINUE_KEY}.${kind}`, valid);
  window.dispatchEvent(new CustomEvent('baglib:continue-reading'));
}
