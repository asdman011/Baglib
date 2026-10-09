/**
 * Baglib — Robust Arabic & Multilingual Search Normalizer
 *
 * Normalizes Arabic letters, removes diacritics/tashkeel,
 * handles hamzas, taa marbuta, and supports tokenized multi-field matching.
 */

export function normalizeSearchString(val: any): string {
  if (val === null || val === undefined) return '';

  return String(val)
    .toLowerCase()
    .normalize('NFD')
    // Remove Arabic diacritics / tashkeel (fatha, damma, kasra, sukun, shadda, tanween)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Remove Arabic tatweel / kashida (ـ)
    .replace(/\u0640/g, '')
    // Normalize Alefs: أ, إ, آ, ٱ -> ا
    .replace(/[أإآٱ]/g, 'ا')
    // Normalize Taa Marbuta: ة -> ه
    .replace(/ة/g, 'ه')
    // Normalize Alef Maksura: ى -> ي
    .replace(/ى/g, 'ي')
    // Replace punctuation and symbols with whitespace
    .replace(/[^\w\s\u0600-\u06FF]/gi, ' ')
    // Collapse consecutive whitespaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks whether all search query tokens match somewhere within the target text.
 */
export function matchesSearchQuery(searchableContent: string, query: string): boolean {
  const cleanQuery = normalizeSearchString(query);
  if (!cleanQuery) return true;

  const tokens = cleanQuery.split(' ').filter(Boolean);
  if (tokens.length === 0) return true;

  const cleanContent = normalizeSearchString(searchableContent);
  return tokens.every((token) => cleanContent.includes(token));
}
