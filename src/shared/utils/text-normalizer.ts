/**
 * Baglib — Robust Arabic & Multilingual Search Normalizer and Text Similarity Utilities
 *
 * Provides non-destructive and normalization helpers:
 * - Normalizes Arabic letters (alefs, taa marbuta, alef maqsura), removes diacritics/tashkeel.
 * - String similarity algorithms (Levenshtein distance & token Jaccard similarity).
 * - Safe for both Node main process and browser renderer.
 */

/**
 * Normalizes a string for search matching:
 * - Lowercases Latin characters.
 * - Removes Arabic diacritics (tashkeel) and tatweel (kashida).
 * - Normalizes Arabic letter variants:
 *   - أ, إ, آ, ٱ -> ا
 *   - ة -> ه
 *   - ى -> ي
 * - Strips non-word characters and collapses whitespace.
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
 * Strips Arabic diacritics (tashkeel) and tatweel without changing letter forms (preserves ة, ى, hamzas).
 */
export function stripArabicDiacritics(val: string): string {
  if (!val) return '';
  return val
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\u0640/g, '');
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

/**
 * Calculates Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Computes normalized string similarity (0.0 to 1.0) using Levenshtein distance.
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = normalizeSearchString(str1);
  const s2 = normalizeSearchString(str2);

  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;

  const dist = levenshteinDistance(s1, s2);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Computes token-level Jaccard similarity (0.0 to 1.0) between two strings.
 */
export function calculateTokenOverlap(str1: string, str2: string): number {
  const s1 = normalizeSearchString(str1);
  const s2 = normalizeSearchString(str2);

  if (!s1 || !s2) return 0.0;
  if (s1 === s2) return 1.0;

  const tokens1 = new Set(s1.split(' ').filter(Boolean));
  const tokens2 = new Set(s2.split(' ').filter(Boolean));

  if (tokens1.size === 0 || tokens2.size === 0) return 0.0;

  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }

  const union = new Set([...tokens1, ...tokens2]).size;
  return union === 0 ? 0.0 : intersection / union;
}
