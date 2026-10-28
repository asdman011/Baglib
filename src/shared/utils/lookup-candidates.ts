/**
 * Baglib — Arabic Root & Morphology Candidate Generation (KEY-142)
 *
 * Implements prioritized lookup candidate generation for classical Arabic lexicons
 * (Lisan al-Arab, Taj al-Arus, etc.) and multilingual dictionaries.
 */

import type { DictionaryLookupCandidate } from '../types/dictionary';

// Arabic Tashkeel & Diacritics regex
const ARABIC_TASHKEEL_REGEX = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g;
const ARABIC_TATWEEL_REGEX = /\u0640/g;

/** Strip Tashkeel diacritics and Tatweel from Arabic text */
export function stripArabicDiacritics(text: string): string {
  return text.replace(ARABIC_TASHKEEL_REGEX, '').replace(ARABIC_TATWEEL_REGEX, '');
}

/** Normalize Arabic letters (Hamza forms, Ta Marbuta, Alif Maqsura) */
export function normalizeArabicLetters(text: string): string {
  return text
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
}

// Ordered prefixes to check (longer prefixes first)
const ARABIC_PREFIXES = [
  'وال', 'فال', 'كال', 'بال', 'لل', 'ال',
  'وب', 'فب', 'وك', 'فك', 'ول', 'فل', 'وس', 'فس',
  'و', 'ف', 'ب', 'ل', 'ك', 'س', 'ي', 'ت', 'ن', 'ا'
];

// Ordered suffixes to check (longer suffixes first)
const ARABIC_SUFFIXES = [
  'هما', 'كما', 'تين', 'تان',
  'هم', 'هن', 'كم', 'كن', 'ها', 'نا', 'ين', 'ون', 'ان', 'ات', 'ية', 'يه',
  'وا', 'ه', 'ي', 'ك', 'ت', 'ة'
];

/**
 * Strip Arabic affixes (proclitics and enclitics) down to a stem.
 * Returns distinct candidate stems with minimum remaining length of 3 letters.
 */
export function stripArabicAffixes(word: string): string[] {
  const stripped = stripArabicDiacritics(word);
  const stems = new Set<string>();

  // Helper to strip combinations
  const attemptStrip = (w: string) => {
    const current = w;
    // Prefix stripping
    for (const prefix of ARABIC_PREFIXES) {
      if (current.startsWith(prefix) && current.length - prefix.length >= 3) {
        const withoutPrefix = current.slice(prefix.length);
        stems.add(withoutPrefix);

        // Also try stripping suffix from the prefix-stripped version
        for (const suffix of ARABIC_SUFFIXES) {
          if (withoutPrefix.endsWith(suffix) && withoutPrefix.length - suffix.length >= 3) {
            stems.add(withoutPrefix.slice(0, withoutPrefix.length - suffix.length));
          }
        }
      }
    }

    // Direct suffix stripping
    for (const suffix of ARABIC_SUFFIXES) {
      if (current.endsWith(suffix) && current.length - suffix.length >= 3) {
        stems.add(current.slice(0, current.length - suffix.length));
      }
    }
  };

  attemptStrip(stripped);
  const normalized = normalizeArabicLetters(stripped);
  if (normalized !== stripped) {
    attemptStrip(normalized);
  }

  return Array.from(stems);
}

/**
 * Extract Arabic Triliteral or Quadriliteral Root candidate.
 * Recognizes common Arabic morphological patterns (Awzan: استفعال, مفعول, فاعل, تفعل, etc.)
 */
export function extractArabicRoots(word: string): string[] {
  const cleaned = normalizeArabicLetters(stripArabicDiacritics(word));
  const roots = new Set<string>();

  const stems = [cleaned, ...stripArabicAffixes(cleaned)];

  for (const s of stems) {
    const len = s.length;

    // 3-letter word: already triliteral root
    if (len === 3) {
      roots.add(s);
      continue;
    }

    // 4-letter word: candidate quadriliteral root or 3-letter root with 1 augment letter
    if (len === 4) {
      // Possible quadriliteral root (e.g. دحرج, زلزل, وسوس)
      roots.add(s);

      // Common 4-letter patterns:
      // فاعل -> فعل (e.g. كاتب -> كتب, عالم -> علم)
      if (s[1] === 'ا') {
        roots.add(s[0] + s[2] + s[3]);
      }
      // مَفعل / مَفعلة (e.g. مكتب -> كتب, معهد -> عهد)
      if (s[0] === 'م') {
        roots.add(s.slice(1));
      }
      // أفعل (e.g. أحسن -> حسن, أكبر -> كبر)
      if (s[0] === 'ا') {
        roots.add(s.slice(1));
      }
      // فعول (e.g. جلوس -> جلس, خروج -> خرج)
      if (s[2] === 'و') {
        roots.add(s[0] + s[1] + s[3]);
      }
      // فعيل (e.g. كريم -> كرم, عظيم -> عظم)
      if (s[2] === 'ي') {
        roots.add(s[0] + s[1] + s[3]);
      }
      // فعال (e.g. كتاب -> كتب, سلام -> سلم)
      if (s[2] === 'ا') {
        roots.add(s[0] + s[1] + s[3]);
      }
      continue;
    }

    // 5-letter patterns:
    if (len === 5) {
      // افتعال / افتعل (e.g. اجتماع -> جمع, استمع -> سمع)
      if (s[0] === 'ا' && s[2] === 'ت') {
        if (s[3] === 'ا') {
          roots.add(s[1] + s[4]); // 2 letters left -> handled below
        } else {
          roots.add(s[1] + s[3] + s[4]);
        }
      }
      // مفعول (e.g. مكتوب -> كتب, معلوم -> علم)
      if (s[0] === 'م' && s[3] === 'و') {
        roots.add(s[1] + s[2] + s[4]);
      }
      // تفعيل (e.g. تعليم -> علم, تكريم -> كرم)
      if (s[0] === 'ت' && s[3] === 'ي') {
        roots.add(s[1] + s[2] + s[4]);
      }
      // تفاعل (e.g. تناول -> نول, تدارس -> درس)
      if (s[0] === 'ت' && s[2] === 'ا') {
        roots.add(s[1] + s[3] + s[4]);
      }
      // انفعال (e.g. انكسار -> كسر, انطلاق -> طلق)
      if (s.startsWith('ان') && s[3] === 'ا') {
        roots.add(s[2] + s.slice(4));
      }
      // مفاعلة (e.g. مشاركة -> شرك, مقاتلة -> قتل)
      if (s[0] === 'م' && s[2] === 'ا' && s.endsWith('ه')) {
        roots.add(s[1] + s[3] + s[4]);
      }
    }

    // 6-letter patterns:
    if (len === 6) {
      // استفعال (e.g. استخراج -> خرج, استفهام -> فهم, استنصار -> نصر)
      if (s.startsWith('است') && s[4] === 'ا') {
        roots.add(s[3] + s[5]); // handled if needed
      }
      if (s.startsWith('است')) {
        // e.g. استخرج -> خرج
        const rem = s.slice(3);
        if (rem.length === 3) roots.add(rem);
        if (rem.length === 4 && rem[2] === 'ا') roots.add(rem[0] + rem[1] + rem[3]);
      }
      // مستفعل (e.g. مستخرج -> خرج)
      if (s.startsWith('مست')) {
        const rem = s.slice(3);
        if (rem.length === 3) roots.add(rem);
      }
    }
  }

  // Filter valid roots (prefer 3-letter triliteral and 4-letter quadriliteral)
  return Array.from(roots).filter((r) => r.length === 3 || r.length === 4);
}

/**
 * Generate prioritized candidate search tokens for dictionary lookup.
 *
 * Tries:
 * 1. Exact trimmed word
 * 2. Unicode NFC / NFD normalization
 * 3. Stripped Tashkeel diacritics
 * 4. Case variants (lower, capitalize, upper) & Latin diacritic folding
 * 5. Normalized letters (Arabic Hamza / Ta Marbuta unification)
 * 6. Arabic Affix-stripped stems
 * 7. Arabic Triliteral & Quadriliteral Roots for classical lexicons
 */
export function buildLookupCandidates(word: string, lang?: string | null): DictionaryLookupCandidate[] {
  const trimmed = word.trim();
  if (!trimmed) return [];

  const candidates: DictionaryLookupCandidate[] = [];
  const seen = new Set<string>();

  const add = (token: string, type: DictionaryLookupCandidate['type'], weight: number) => {
    const t = token.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    candidates.push({ token: t, type, weight });
  };

  // 1. Exact token
  add(trimmed, 'exact', 100);

  // 2. Unicode NFC & NFD
  add(trimmed.normalize('NFC'), 'normalized', 95);
  add(trimmed.normalize('NFD'), 'normalized', 94);

  // 3. Case variants
  const lower = trimmed.toLowerCase();
  const cap = trimmed.charAt(0).toUpperCase() + lower.slice(1);
  const upper = trimmed.toUpperCase();

  add(lower, 'normalized', 90);
  add(cap, 'normalized', 88);
  add(upper, 'normalized', 86);

  // Latin diacritic folding (e.g., café -> cafe)
  const latinFolded = trimmed
    .normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC');
  if (latinFolded !== trimmed.normalize('NFC')) {
    add(latinFolded, 'normalized', 85);
    add(latinFolded.toLowerCase(), 'normalized', 84);
  }

  // English basic inflection stripping (plurals, ed, ing)
  if (lower.length > 4 && lower.endsWith('ing')) {
    add(lower.slice(0, -3), 'lemma', 70);
    add(lower.slice(0, -3) + 'e', 'lemma', 69);
  }
  if (lower.length > 3 && lower.endsWith('ed')) {
    add(lower.slice(0, -2), 'lemma', 70);
    add(lower.slice(0, -1), 'lemma', 69);
  }
  if (lower.length > 3 && lower.endsWith('es')) {
    add(lower.slice(0, -2), 'lemma', 70);
  }
  if (lower.length > 3 && lower.endsWith('s') && !lower.endsWith('ss')) {
    add(lower.slice(0, -1), 'lemma', 70);
  }

  // 4. Arabic Tashkeel & Diacritics Stripping
  const strippedArabic = stripArabicDiacritics(trimmed);
  if (strippedArabic !== trimmed) {
    add(strippedArabic, 'stripped_diacritics', 82);
    add(strippedArabic.normalize('NFC'), 'stripped_diacritics', 81);
    add(strippedArabic.normalize('NFD'), 'stripped_diacritics', 80);
  }

  // 5. Arabic Normalized Letters
  const normalizedArabic = normalizeArabicLetters(strippedArabic);
  if (normalizedArabic !== strippedArabic) {
    add(normalizedArabic, 'normalized', 75);
  }

  // 6. Arabic Affix-Stripped Stems (Proclitics/Enclitics)
  const stems = stripArabicAffixes(trimmed);
  for (const stem of stems) {
    add(stem, 'stem', 60);
  }

  // 7. Arabic Triliteral & Quadriliteral Roots for Classical Lexicons
  const roots = extractArabicRoots(trimmed);
  for (const root of roots) {
    add(root, 'arabic_root', 50);
  }

  return candidates.sort((a, b) => b.weight - a.weight);
}
