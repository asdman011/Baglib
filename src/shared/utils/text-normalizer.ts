/**
 * Baglib — Robust Arabic & Multilingual Search Normalizer and Text Similarity Utilities
 *
 * Provides non-destructive and morphology-aware normalization helpers:
 * - Unicode normalization (NFC & NFD).
 * - Comprehensive Arabic diacritics (Tashkeel / Harakat) stripping ([\u064B-\u065F\u0670\u06D6-\u06ED]).
 * - Tatweel / Kashida stripping (\u0640).
 * - Orthographic normalization for Arabic variants:
 *     أ إ آ ٱ -> ا
 *     ى -> ي
 *     ة -> ه
 *     ؤ -> و
 *     ئ -> ي
 * - Exact character index alignment mapping between normalized text and raw source text.
 * - FTS5 Boolean & phrase query syntax formatter.
 * - String similarity algorithms (Levenshtein distance & token Jaccard similarity).
 * - Safe for both Node main process and browser renderer.
 */

export interface ArabicNormalizerOptions {
  normalizeAlefs?: boolean;
  normalizeTaaMarbuta?: boolean;
  normalizeAlefMaksura?: boolean;
  normalizeWawHamza?: boolean;
  normalizeYaaHamza?: boolean;
  stripDiacritics?: boolean;
  stripTatweel?: boolean;
  lowercase?: boolean;
}

/**
 * Normalizes Arabic and multilingual text for morphology-aware search indexing.
 * Preserves the canonical content while producing a match-friendly representation.
 */
export function normalizeArabicText(
  val: any,
  options: ArabicNormalizerOptions = {}
): string {
  if (val === null || val === undefined) return '';

  const {
    normalizeAlefs = true,
    normalizeTaaMarbuta = true,
    normalizeAlefMaksura = true,
    normalizeWawHamza = true,
    normalizeYaaHamza = true,
    stripDiacritics = true,
    stripTatweel = true,
    lowercase = true,
  } = options;

  let str = String(val).normalize('NFD');

  if (lowercase) {
    str = str.toLowerCase();
  }

  if (stripDiacritics) {
    // Strips Tashkeel (fatha, damma, kasra, sukun, shadda, tanween, dagger alef)
    // and Quranic pause marks
    str = str.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
  }

  if (stripTatweel) {
    // Strips Tatweel / Kashida (ـ)
    str = str.replace(/\u0640/g, '');
  }

  if (normalizeAlefs) {
    // Normalize Alefs: أ, إ, آ, ٱ -> ا
    str = str.replace(/[أإآٱ]/g, 'ا');
  }

  if (normalizeTaaMarbuta) {
    // Normalize Taa Marbuta: ة -> ه
    str = str.replace(/ة/g, 'ه');
  }

  if (normalizeAlefMaksura) {
    // Normalize Alef Maksura: ى -> ي
    str = str.replace(/ى/g, 'ي');
  }

  if (normalizeWawHamza) {
    // Normalize Waw with Hamza: ؤ -> و
    str = str.replace(/ؤ/g, 'و');
  }

  if (normalizeYaaHamza) {
    // Normalize Yaa with Hamza: ئ -> ي
    str = str.replace(/ئ/g, 'ي');
  }

  return str.normalize('NFC');
}

/**
 * Normalizes a string for search matching:
 * - Lowercases Latin characters.
 * - Removes Arabic diacritics (tashkeel) and tatweel (kashida).
 * - Normalizes Arabic letter variants:
 *   - أ, إ, آ, ٱ -> ا
 *   - ة -> ه
 *   - ى -> ي
 *   - ؤ -> و
 *   - ئ -> ي
 * - Strips non-word characters and collapses whitespace.
 */
export function normalizeSearchString(val: any): string {
  if (val === null || val === undefined) return '';

  let str = normalizeArabicText(val, {
    normalizeAlefs: true,
    normalizeTaaMarbuta: true,
    normalizeAlefMaksura: true,
    normalizeWawHamza: true,
    normalizeYaaHamza: true,
    stripDiacritics: true,
    stripTatweel: true,
    lowercase: true,
  });

  return str
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
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '');
}

/**
 * Builds an index alignment map between normalized text and original text.
 * Returns normalized string and an array `map` where map[normIdx] = origIdx.
 */
export function buildAlignmentMap(rawText: string): { normalized: string; map: number[] } {
  let normalized = '';
  const map: number[] = [];

  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i];

    // Check if character is a diacritic or tatweel that gets completely stripped
    if (/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/.test(ch)) {
      continue;
    }

    let normChar = ch.toLowerCase();
    if (/[أإآٱ]/.test(normChar)) normChar = 'ا';
    else if (normChar === 'ة') normChar = 'ه';
    else if (normChar === 'ى') normChar = 'ي';
    else if (normChar === 'ؤ') normChar = 'و';
    else if (normChar === 'ئ') normChar = 'ي';

    map.push(i);
    normalized += normChar;
  }

  return { normalized, map };
}

export interface MatchSpan {
  start: number; // 0-indexed character in rawText
  end: number;   // 0-indexed exclusive end character in rawText
  matchText: string;
  preContext: string;
  postContext: string;
  fullSnippet: string;
}

export interface FindMatchOptions {
  caseSensitive?: boolean;
  matchWholeWord?: boolean;
  normalizeArabic?: boolean;
  contextRadius?: number;
}

/**
 * Searches for all occurrences of `query` within `rawText` while preserving
 * original diacritics and typography in the returned match text and snippet.
 */
export function findMatchesInText(
  rawText: string,
  query: string,
  options: FindMatchOptions = {}
): MatchSpan[] {
  if (!rawText || !query || !query.trim()) return [];

  const {
    caseSensitive = false,
    matchWholeWord = false,
    normalizeArabic = true,
    contextRadius = 45,
  } = options;

  const results: MatchSpan[] = [];

  if (normalizeArabic) {
    const { normalized, map } = buildAlignmentMap(rawText);
    const normQuery = normalizeArabicText(query, {
      normalizeAlefs: true,
      normalizeTaaMarbuta: true,
      normalizeAlefMaksura: true,
      normalizeWawHamza: true,
      normalizeYaaHamza: true,
      stripDiacritics: true,
      stripTatweel: true,
      lowercase: !caseSensitive,
    });

    if (!normQuery) return [];

    let searchTarget = normalized;
    let effectiveQuery = normQuery;
    if (!caseSensitive) {
      searchTarget = searchTarget.toLowerCase();
      effectiveQuery = effectiveQuery.toLowerCase();
    }

    let fromIndex = 0;
    while (fromIndex < searchTarget.length) {
      const foundIdx = searchTarget.indexOf(effectiveQuery, fromIndex);
      if (foundIdx === -1) break;

      const normEndIdx = foundIdx + effectiveQuery.length;

      // Whole word check if requested
      if (matchWholeWord) {
        const prevChar = foundIdx > 0 ? searchTarget[foundIdx - 1] : ' ';
        const nextChar = normEndIdx < searchTarget.length ? searchTarget[normEndIdx] : ' ';
        const isWordBoundary = /[\s\p{P}]/u;
        if (!isWordBoundary.test(prevChar) || !isWordBoundary.test(nextChar)) {
          fromIndex = foundIdx + 1;
          continue;
        }
      }

      // Map normalized start and end back to raw text
      const rawStart = map[foundIdx] ?? 0;
      let rawEnd = map[normEndIdx - 1] !== undefined ? map[normEndIdx - 1] + 1 : rawStart + effectiveQuery.length;

      // Include any trailing diacritics belonging to the last matched letter
      while (rawEnd < rawText.length && /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/.test(rawText[rawEnd])) {
        rawEnd++;
      }

      const matchText = rawText.substring(rawStart, rawEnd);

      // Extract surrounding context
      const snippetStart = Math.max(0, rawStart - contextRadius);
      const snippetEnd = Math.min(rawText.length, rawEnd + contextRadius);

      const preContext = (snippetStart > 0 ? '...' : '') + rawText.substring(snippetStart, rawStart);
      const postContext = rawText.substring(rawEnd, snippetEnd) + (snippetEnd < rawText.length ? '...' : '');
      const fullSnippet = `${preContext}<mark>${matchText}</mark>${postContext}`;

      results.push({
        start: rawStart,
        end: rawEnd,
        matchText,
        preContext,
        postContext,
        fullSnippet,
      });

      fromIndex = foundIdx + 1;
    }
  } else {
    // Standard literal search without Arabic normalizations
    let searchTarget = rawText;
    let effectiveQuery = query;
    if (!caseSensitive) {
      searchTarget = searchTarget.toLowerCase();
      effectiveQuery = effectiveQuery.toLowerCase();
    }

    let fromIndex = 0;
    while (fromIndex < searchTarget.length) {
      const foundIdx = searchTarget.indexOf(effectiveQuery, fromIndex);
      if (foundIdx === -1) break;

      const endIdx = foundIdx + effectiveQuery.length;

      if (matchWholeWord) {
        const prevChar = foundIdx > 0 ? searchTarget[foundIdx - 1] : ' ';
        const nextChar = endIdx < searchTarget.length ? searchTarget[endIdx] : ' ';
        const isWordBoundary = /[\s\p{P}]/u;
        if (!isWordBoundary.test(prevChar) || !isWordBoundary.test(nextChar)) {
          fromIndex = foundIdx + 1;
          continue;
        }
      }

      const matchText = rawText.substring(foundIdx, endIdx);
      const snippetStart = Math.max(0, foundIdx - contextRadius);
      const snippetEnd = Math.min(rawText.length, endIdx + contextRadius);

      const preContext = (snippetStart > 0 ? '...' : '') + rawText.substring(snippetStart, foundIdx);
      const postContext = rawText.substring(endIdx, snippetEnd) + (snippetEnd < rawText.length ? '...' : '');
      const fullSnippet = `${preContext}<mark>${matchText}</mark>${postContext}`;

      results.push({
        start: foundIdx,
        end: endIdx,
        matchText,
        preContext,
        postContext,
        fullSnippet,
      });

      fromIndex = foundIdx + 1;
    }
  }

  return results;
}

/**
 * Formats a raw user search query into an FTS5 compatible query.
 * - Preserves Boolean keywords: AND, OR, NOT
 * - Preserves exact quoted phrases: "exact phrase"
 * - Preserves prefix wildcards: term*
 * - Normalizes individual tokens so they match against `normalized_content`.
 */
export function formatFts5Query(rawQuery: string): string {
  if (!rawQuery || !rawQuery.trim()) return '';

  const trimmed = rawQuery.trim();

  // Tokenize preserving quotes and operators
  const tokenRegex = /"([^"]+)"|(\b(?:AND|OR|NOT)\b)|([^\s"]+)/g;
  const parts: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(trimmed)) !== null) {
    if (match[1]) {
      // Quoted phrase
      const phraseContent = match[1];
      const normalizedPhrase = normalizeSearchString(phraseContent);
      if (normalizedPhrase) {
        parts.push(`"${normalizedPhrase}"`);
      }
    } else if (match[2]) {
      // Boolean operator
      parts.push(match[2].toUpperCase());
    } else if (match[3]) {
      // Standard word or prefix wildcard
      const word = match[3];
      const isWildcard = word.endsWith('*');
      const baseWord = isWildcard ? word.slice(0, -1) : word;
      const normalizedWord = normalizeSearchString(baseWord);

      if (normalizedWord) {
        parts.push(isWildcard ? `${normalizedWord}*` : normalizedWord);
      }
    }
  }

  // Sanitize trailing/leading operators
  let result = parts.join(' ').trim();
  result = result.replace(/^(?:AND|OR|NOT)\s+/, '');
  result = result.replace(/\s+(?:AND|OR|NOT)$/, '');

  return result || normalizeSearchString(rawQuery);
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
