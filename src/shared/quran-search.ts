import type { QuranSearchQuery } from './types/quran';

/** Validate before crossing the reader worker boundary; source membership is checked by QuranReader. */
export function validQuranSearchQuery(value: unknown): value is QuranSearchQuery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const q = value as Record<string, unknown>;
  const id = (v: unknown) => typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v);
  return Object.keys(q).every(key => ['script', 'text', 'translations', 'includeScript'].includes(key))
    && id(q.script) && typeof q.text === 'string' && q.text.length <= 200
    && (q.includeScript === undefined || typeof q.includeScript === 'boolean')
    && (q.translations === undefined || Array.isArray(q.translations) && q.translations.length <= 32
      && q.translations.every(id) && new Set(q.translations).size === q.translations.length);
}
