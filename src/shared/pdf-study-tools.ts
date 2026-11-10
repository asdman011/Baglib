import type { TranslationKey } from '../renderer/translations';
import type { Point, ShapeMark } from './pdf-markup';

export const STAMPS = [
  { id: 'checked', group: 'review', label: 'stampChecked', color: 'emerald' },
  { id: 'revise', group: 'review', label: 'stampRevise', color: 'rose' },
  { id: 'important', group: 'attention', label: 'stampImportant', color: 'amber' },
  { id: 'question', group: 'attention', label: 'stampQuestion', color: 'sky' },
  { id: 'memorized', group: 'study', label: 'stampMemorized', color: 'emerald' },
  { id: 'explain', group: 'study', label: 'stampExplain', color: 'violet' },
  { id: 'excellent', group: 'grades', label: 'stampExcellent', color: 'emerald' },
  { id: 'very-good', group: 'grades', label: 'stampVeryGood', color: 'sky' },
  { id: 'good', group: 'grades', label: 'stampGood', color: 'violet' },
  { id: 'pass', group: 'grades', label: 'stampPass', color: 'amber' },
] as const satisfies readonly { id: string; group: string; label: TranslationKey; color: string }[];
export type StampId = typeof STAMPS[number]['id'];
export type MeasureUnit = 'cm' | 'mm' | 'inch' | 'pt';
export type MeasureMode = 'distance' | 'area';
export interface PageSize { width: number; height: number }
export interface Measurement { mode: MeasureMode; unit: MeasureUnit; pointsPerUnit: number; page: PageSize; language: 'ar' | 'en' }
export const UNIT_POINTS: Record<MeasureUnit, number> = { cm: 72 / 2.54, mm: 72 / 25.4, inch: 72, pt: 1 };

export function measureValue(mode: MeasureMode, from: Point, to: Point, page: PageSize, pointsPerUnit: number): number {
  if (![page.width, page.height, pointsPerUnit].every(value => Number.isFinite(value) && value > 0)) throw new Error('invalid-request');
  const dx = (to.x - from.x) * page.width / 100 / pointsPerUnit;
  const dy = (to.y - from.y) * page.height / 100 / pointsPerUnit;
  return mode === 'area' ? Math.abs(dx * dy) : Math.hypot(dx, dy);
}
export function calibratedScale(from: Point, to: Point, page: PageSize, length: number): number {
  const points = measureValue('distance', from, to, page, 1);
  if (!Number.isFinite(length) || length <= 0 || points < 0.01) throw new Error('invalid-request');
  return points / length;
}
export function formatMeasurement(value: number, unit: MeasureUnit, area: boolean, language: 'ar' | 'en'): string {
  if (unit === 'pt') return new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-US', { maximumFractionDigits: 2 }).format(value) + (area ? ' pt\u00b2' : ' pt');
  return new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-US', {
    style: 'unit', unit: { cm: 'centimeter', mm: 'millimeter', inch: 'inch', pt: 'inch' }[unit], maximumFractionDigits: 2,
  }).format(value) + (area ? '²' : '');
}

/** Reformat a stored numeric measurement for the current interface language. */
export function measurementLabel(mark: ShapeMark, language: 'ar' | 'en'): string {
  if (!mark.measurement || !mark.from || !mark.to) return '';
  const { mode, unit, page, pointsPerUnit } = mark.measurement;
  return formatMeasurement(measureValue(mode, mark.from, mark.to, page, pointsPerUnit), unit, mode === 'area', language);
}
