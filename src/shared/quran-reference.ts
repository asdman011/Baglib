/**
 * BagLib Quran — direct reference parsing (KEY-169)
 *
 * Users type references such as `2:255`, `٢:٢٥٥` or `البقرة 255` into Quran
 * search. This module recognises those references so the search layer can jump
 * straight to the requested ayah(s) instead of running a text search.
 *
 * Supported forms (surrounding whitespace ignored):
 * - `surah:ayah` with `:`, `：`, `.` or `/` as separator.
 * - Optional ayah range with `-` or an en/em dash: `2:255-257`.
 * - Arabic-Indic (`٠-٩`) and Persian (`۰-۹`) digits.
 * - Surah name followed by an ayah/range: `البقرة 255`, `سورة البقرة ٢٥٥`,
 *   `Al-Baqarah 255`, `baqarah 255`.
 * - A surah name alone returns the whole surah: `البقرة`.
 *
 * Surah names come from `quran-wird.ts`; matching uses the shared search
 * normalizer, the canonical names are never modified. Ayah counts follow the
 * requested Mushaf profile (`hafs` by default). Invalid references (unknown
 * name, out-of-range ayah, reversed range, a bare number) return `null`; this
 * function never throws, so callers can safely fall back to plain search.
 */

import {
  SURAH_NAMES_AR,
  SURAH_NAMES_EN,
  getSurahAyahCount,
  type QuranWirdProfile,
} from './quran-wird';
import { normalizeSearchString } from './utils/text-normalizer';

export interface QuranReference {
  surah: number;
  from: number;
  to: number;
}

const SURAH_COUNT = 114;

/** Arabic-Indic digits (U+0660 .. U+0669), in order. */
const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
/** Persian / Eastern Arabic-Indic digits (U+06F0 .. U+06F9), in order. */
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** `:`, fullwidth `：`, `.` and `/` are all accepted between surah and ayah. */
const SEPARATOR_PATTERN = '[:.\\/：]';
/** Hyphen, en dash, em dash and minus sign are accepted as range separators. */
const RANGE_PATTERN = '[-\\u2013\\u2014\\u2212]';

const NUMERIC_REFERENCE_PATTERN = new RegExp(
  `^(\\d{1,3})\\s*${SEPARATOR_PATTERN}\\s*(\\d{1,3})(?:\\s*${RANGE_PATTERN}\\s*(\\d{1,3}))?$`
);

/** A trailing ayah or ayah range, preceded by whitespace after the name. */
const NAME_WITH_AYAH_PATTERN = new RegExp(
  `^(.*\\S)\\s+(\\d{1,3})(?:\\s*${RANGE_PATTERN}\\s*(\\d{1,3}))?$`
);

/** Definite article prefixes used by the Arabic surah names. */
const ARABIC_ARTICLE = 'ال';

/**
 * Latin articles transliterated from the Arabic definite article.
 * Longest first so `ash` is not truncated to `as`.
 */
const ENGLISH_ARTICLES: readonly string[] = ['ash', 'al', 'an', 'at', 'ar', 'as', 'az'];

/** Converts Arabic-Indic and Persian digits to ASCII digits. */
function toAsciiDigits(value: string): string {
  let result = '';
  for (const char of value) {
    const arabicIndex = ARABIC_INDIC_DIGITS.indexOf(char);
    if (arabicIndex >= 0) {
      result += String(arabicIndex);
      continue;
    }
    const persianIndex = PERSIAN_DIGITS.indexOf(char);
    if (persianIndex >= 0) {
      result += String(persianIndex);
      continue;
    }
    result += char;
  }
  return result;
}

/** Removes a leading Arabic definite article (`ال`) from a normalized name. */
function stripArabicArticle(value: string): string {
  if (value.startsWith(ARABIC_ARTICLE) && value.length > ARABIC_ARTICLE.length) {
    return value.slice(ARABIC_ARTICLE.length).trim();
  }
  return value;
}

/** Removes a leading `سورة` word (`سوره` once normalized) from an Arabic name. */
function stripArabicSurahPrefix(value: string): string {
  return value.replace(/^سوره\s+/, '').trim();
}

/** Lower-cases a Latin name and drops hyphens, apostrophes and spaces. */
function compactLatinName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Removes one transliterated Latin article, keeping at least two letters. */
function stripEnglishArticle(value: string): string {
  for (const article of ENGLISH_ARTICLES) {
    if (value.startsWith(article) && value.length - article.length >= 2) {
      return value.slice(article.length);
    }
  }
  return value;
}

/** Removes a leading `surah` / `surat` / `sura` word from a compact name. */
function stripEnglishSurahPrefix(value: string): string {
  return value.replace(/^(?:surah|surat|sura)(?=[a-z]{2,})/, '');
}

/**
 * Candidate lookup keys for a typed name: the canonical name normalized for
 * search, plus the same name without its definite article.
 */
function nameCandidates(rawName: string): string[] {
  const candidates = new Set<string>();

  const arabicName = stripArabicSurahPrefix(normalizeSearchString(rawName));
  if (arabicName) {
    candidates.add(arabicName);
    candidates.add(stripArabicArticle(arabicName));
  }

  const latinName = stripEnglishSurahPrefix(compactLatinName(rawName));
  if (latinName) {
    candidates.add(latinName);
    candidates.add(stripEnglishArticle(latinName));
  }

  candidates.delete('');
  return [...candidates];
}

/**
 * Normalized name key -> surah number(s). A key shared by more than one surah
 * is ambiguous and never resolves.
 */
function buildSurahNameIndex(): ReadonlyMap<string, readonly number[]> {
  const index = new Map<string, Set<number>>();

  const addKey = (key: string, surah: number): void => {
    if (!key) return;
    let surahs = index.get(key);
    if (!surahs) {
      surahs = new Set<number>();
      index.set(key, surahs);
    }
    surahs.add(surah);
  };

  const lastSurah = Math.min(SURAH_COUNT, SURAH_NAMES_AR.length, SURAH_NAMES_EN.length);
  for (let index0 = 0; index0 < lastSurah; index0 += 1) {
    const surah = index0 + 1;

    const arabicName = normalizeSearchString(SURAH_NAMES_AR[index0]);
    addKey(arabicName, surah);
    addKey(stripArabicArticle(arabicName), surah);

    const latinName = compactLatinName(SURAH_NAMES_EN[index0]);
    addKey(latinName, surah);
    addKey(stripEnglishArticle(latinName), surah);
  }

  const frozen = new Map<string, readonly number[]>();
  for (const [key, surahs] of index) {
    frozen.set(key, [...surahs].sort((a, b) => a - b));
  }
  return frozen;
}

const SURAH_NAME_INDEX: ReadonlyMap<string, readonly number[]> = buildSurahNameIndex();

/** Resolves a typed name to a surah only when exactly one surah matches. */
function resolveSurahByName(rawName: string): number | null {
  const matches = new Set<number>();

  for (const candidate of nameCandidates(rawName)) {
    const surahs = SURAH_NAME_INDEX.get(candidate);
    if (!surahs) continue;
    for (const surah of surahs) matches.add(surah);
  }

  if (matches.size !== 1) return null;
  return [...matches][0];
}

/** Ayah count for a surah, or `null` when the surah/profile is unusable. */
function safeAyahCount(surah: number, profile: QuranWirdProfile): number | null {
  try {
    const count = getSurahAyahCount(surah, profile);
    return Number.isInteger(count) && count >= 1 ? count : null;
  } catch {
    return null;
  }
}

/** Validates a numeric reference against the requested profile's ayah counts. */
function buildReference(
  surah: number,
  from: number,
  to: number,
  profile: QuranWirdProfile
): QuranReference | null {
  if (!Number.isInteger(surah) || surah < 1 || surah > SURAH_COUNT) return null;
  if (!Number.isInteger(from) || from < 1) return null;
  if (!Number.isInteger(to) || to < from) return null;

  const ayahCount = safeAyahCount(surah, profile);
  if (ayahCount === null) return null;
  if (to > ayahCount) return null;

  return { surah, from, to };
}

/**
 * Parses a direct Quran reference typed into search.
 *
 * Returns `null` for anything that is not a valid reference, including plain
 * search text and a bare surah number, so callers can fall back to search.
 *
 * @param input Raw user query.
 * @param profile Mushaf profile used for ayah counts; `hafs` by default.
 */
export function parseQuranReference(
  input: string,
  profile: 'hafs' | 'warsh' = 'hafs'
): QuranReference | null {
  if (typeof input !== 'string') return null;

  const profileValue: QuranWirdProfile = profile === 'warsh' ? 'warsh' : 'hafs';
  const trimmed = toAsciiDigits(input.trim());
  if (!trimmed) return null;

  const numeric = NUMERIC_REFERENCE_PATTERN.exec(trimmed);
  if (numeric) {
    const surah = Number(numeric[1]);
    const from = Number(numeric[2]);
    const to = numeric[3] ? Number(numeric[3]) : from;
    return buildReference(surah, from, to, profileValue);
  }

  const nameWithAyah = NAME_WITH_AYAH_PATTERN.exec(trimmed);
  const namePart = nameWithAyah ? nameWithAyah[1] : trimmed;
  const surah = resolveSurahByName(namePart);
  if (surah === null) return null;

  if (!nameWithAyah) {
    const ayahCount = safeAyahCount(surah, profileValue);
    if (ayahCount === null) return null;
    return buildReference(surah, 1, ayahCount, profileValue);
  }

  const from = Number(nameWithAyah[2]);
  const to = nameWithAyah[3] ? Number(nameWithAyah[3]) : from;
  return buildReference(surah, from, to, profileValue);
}
