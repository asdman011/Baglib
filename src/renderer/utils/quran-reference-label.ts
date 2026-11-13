import type { QuranReference } from '../../shared/quran-reference';
import { SURAH_NAMES_AR, SURAH_NAMES_EN } from '../../shared/quran-wird';
export function quranReferenceLabel(reference: QuranReference, lang: string): string {
  const number = new Intl.NumberFormat(lang);
  return (lang === 'ar' ? SURAH_NAMES_AR : SURAH_NAMES_EN)[reference.surah - 1] + ' \u2066' + number.format(reference.from) + (reference.to === reference.from ? '' : '–' + number.format(reference.to)) + '\u2069';
}
