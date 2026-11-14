import type { CardDensity, ListDensity } from './types/library-views';

/** Ordered from smallest to largest, using the existing persisted view settings. */
export function wheelDensity<T extends CardDensity | ListDensity>(current: T, values: readonly T[], deltaY: number): T {
  if (!Number.isFinite(deltaY) || deltaY === 0) return current;
  const index = Math.max(0, values.indexOf(current));
  return values[Math.max(0, Math.min(values.length - 1, index + (deltaY < 0 ? 1 : -1)))];
}
export const CARD_DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
export const ROW_DENSITIES = ['compact', 'normal'] as const;
