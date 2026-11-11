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

export function bookCountLabel(count: number, lang: string, t: Translate): string {
  return t(countKeys[new Intl.PluralRules(lang).select(count)], { count: count.toLocaleString(lang) });
}

export function restoredBookCountLabel(count: number, lang: string, t: Translate): string {
  return t(restoredKeys[new Intl.PluralRules(lang).select(count)], { count: count.toLocaleString(lang) });
}
