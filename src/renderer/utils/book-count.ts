import type { TranslationKey } from '../translations';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

const countKeys = {
  zero: 'bookCountZero', one: 'bookCountOne', two: 'bookCountTwo',
  few: 'bookCountFew', many: 'bookCountMany', other: 'bookCountOther',
} as const;
const restoredKeys = {
  zero: 'booksRestoredZero', one: 'booksRestoredOne', two: 'booksRestoredTwo',
  few: 'booksRestoredFew', many: 'booksRestoredMany', other: 'booksRestoredOther',
} as const;
const discardedKeys = {
  zero: 'discardedArtifactCountZero', one: 'discardedArtifactCountOne', two: 'discardedArtifactCountTwo',
  few: 'discardedArtifactCountFew', many: 'discardedArtifactCountMany', other: 'discardedArtifactCountOther',
} as const;
const pageKeys = {
  zero: 'libraryPageCountZero', one: 'libraryPageCountOne', two: 'libraryPageCountTwo',
  few: 'libraryPageCountFew', many: 'libraryPageCountMany', other: 'libraryPageCountOther',
} as const;

export function bookCountLabel(count: number, lang: string, t: Translate): string {
  return t(countKeys[new Intl.PluralRules(lang).select(count)], { count: count.toLocaleString(lang) });
}

export function restoredBookCountLabel(count: number, lang: string, t: Translate): string {
  return t(restoredKeys[new Intl.PluralRules(lang).select(count)], { count: count.toLocaleString(lang) });
}

export function discardedArtifactCountLabel(count: number, lang: string, t: Translate): string {
  return t(discardedKeys[new Intl.PluralRules(lang).select(count)], { count: formatLibraryNumber(count, lang) });
}

export function formatLibraryNumber(count: number, lang: string): string {
  return count.toLocaleString(lang, { numberingSystem: lang === 'ar' ? 'arab' : 'latn' });
}

export function pageCountLabel(value: string, lang: string, t: Translate): string {
  const digits = value.trim().replace(/[٠-٩۰-۹]/gu, digit => String(digit.charCodeAt(0) - (digit >= '۰' ? 0x6f0 : 0x660)));
  const count = /^\d+$/u.test(digits) ? Number(digits) : NaN;
  if (!Number.isSafeInteger(count)) return t('libraryPagesValue', { value });
  return t(pageKeys[new Intl.PluralRules(lang).select(count)], { count: formatLibraryNumber(count, lang) });
}
