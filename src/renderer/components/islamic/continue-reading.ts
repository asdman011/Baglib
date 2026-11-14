import { parseQuranTarget, validStudyTarget } from '../../../shared/study-notes';
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
  const quran = kind === 'quran' ? parseQuranTarget(valid.target) : null;
  await window.electronAPI.settings.set(quran ? quranContinueKey(quran.profile) : `${CONTINUE_KEY}.${kind}`, valid);
  if (quran) await window.electronAPI.settings.set(CONTINUE_KEY + '.quran.active-profile', quran.profile);
  window.dispatchEvent(new CustomEvent('baglib:continue-reading'));
}

export function quranContinueKey(profile: 'hafs' | 'warsh'): string {
  return CONTINUE_KEY + '.quran.' + profile;
}

/** The legacy position migrates only into the reading profile named by its target. */
export async function loadQuranContinueReading(profile?: 'hafs' | 'warsh'): Promise<ContinueReading | null> {
  const settings = window.electronAPI.settings;
  if (!profile) {
    const active = await settings.get(CONTINUE_KEY + '.quran.active-profile');
    if (active === 'hafs' || active === 'warsh') return loadQuranContinueReading(active);
    const legacy = continueReading(await settings.get(CONTINUE_KEY + '.quran'), 'quran');
    return loadQuranContinueReading(legacy ? parseQuranTarget(legacy.target)!.profile : 'hafs');
  }
  const saved = continueReading(await settings.get(quranContinueKey(profile)), 'quran');
  if (saved && parseQuranTarget(saved.target)?.profile === profile) return saved;
  const legacy = continueReading(await settings.get(CONTINUE_KEY + '.quran'), 'quran');
  if (!legacy || parseQuranTarget(legacy.target)?.profile !== profile) return null;
  await settings.set(quranContinueKey(profile), legacy);
  return legacy;
}

/** A page hint uses settings only; the approved study target remains the position's identity. */
export interface QuranPageHint { target: string; script: string; layout: string; page: number }
export function quranPageHint(value: unknown, target: string, script: string, layout: string): QuranPageHint | null {
  if (!value || typeof value !== 'object') return null;
  const hint = value as Partial<QuranPageHint>;
  return hint.target === target && hint.script === script && hint.layout === layout && Number.isInteger(hint.page) && hint.page! >= 1 && hint.page! <= 604
    ? { target, script, layout, page: hint.page! } : null;
}
