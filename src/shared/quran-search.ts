import type { QuranSearchQuery } from './types/quran';

/** Validate before crossing the reader worker boundary; source membership is checked by QuranReader. */
export function validQuranSearchQuery(value: unknown): value is QuranSearchQuery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const q = value as Record<string, unknown>;
  const id = (v: unknown) => typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v);
  return Object.keys(q).every(key => ['script', 'text', 'translations', 'includeScript', 'limit', 'offset', 'requestId'].includes(key))
    && (q.limit === undefined || Number.isInteger(q.limit) && Number(q.limit) >= 1 && Number(q.limit) <= 100)
    && (q.offset === undefined || Number.isSafeInteger(q.offset) && Number(q.offset) >= 0 && Number(q.offset) <= 100000)
    && (q.requestId === undefined || typeof q.requestId === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(q.requestId))
    && id(q.script) && typeof q.text === 'string' && q.text.length <= 200
    && (q.includeScript === undefined || typeof q.includeScript === 'boolean')
    && (q.translations === undefined || Array.isArray(q.translations) && q.translations.length <= 32
      && q.translations.every(id) && new Set(q.translations).size === q.translations.length);
}
