import type { QuranReference } from '../../shared/quran-reference';
import { SURAH_NAMES_AR, SURAH_NAMES_EN } from '../../shared/quran-wird';
export function quranReferenceLabel(reference: QuranReference, lang: string): string {
  const number = new Intl.NumberFormat(lang);
  return (lang === 'ar' ? SURAH_NAMES_AR : SURAH_NAMES_EN)[reference.surah - 1] + ' \u2066' + number.format(reference.from) + (reference.to === reference.from ? '' : '–' + number.format(reference.to)) + '\u2069';
}

/** Canonical text stays byte-for-byte intact; only the separate citation is localized.
 * Clipboard text carries no bidi isolate controls: they paste as stray characters in other apps. */
export function quranCopyText(text: string, start: { surah: number; ayah: number }, lang: string, end = start): string {
  const label = start.surah === end.surah
    ? quranReferenceLabel({ surah: start.surah, from: start.ayah, to: end.ayah }, lang)
    : quranReferenceLabel({ surah: start.surah, from: start.ayah, to: start.ayah }, lang) + ' – ' + quranReferenceLabel({ surah: end.surah, from: end.ayah, to: end.ayah }, lang);
  return text + '\n[' + label.replace(/[⁦-⁩]/gu, '') + ']';
}
