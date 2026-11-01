import type { QuranDivision, QuranReaderKind, QuranReaderSource } from './types/quran';

const position = (reference: string): number => {
  const [surah, ayah] = reference.split(':').map(Number);
  return surah * 1000 + ayah;
};

/** The division holding an ayah, or undefined when its pack is not installed. */
export function quranDivisionAt(divisions: QuranDivision[], surah: number, ayah: number): QuranDivision | undefined {
  const target = surah * 1000 + ayah;
  return divisions.find(division => position(division.first) <= target && target <= position(division.last));
}

/** A derived Arabic copy serves the Arabic interface; every other language keeps the source edition. */
export function quranLocalizedSource(sources: QuranReaderSource[], kind: QuranReaderKind, language: 'ar' | 'en'): QuranReaderSource | undefined {
  const matching = sources.filter(source => source.kind === kind);
  return (language === 'ar' ? matching.find(source => source.language === 'ar') : undefined) || matching.find(source => !source.language) || matching[0];
}

/** QUL stores wiki links without a scheme and with a doubled slash. Anything else is not linked. */
export function quranWikiUrl(link: string): string | null {
  const match = /^(?:https?:\/\/)?((?:[a-z]{2,3}\.)?wikipedia\.org)\/+(wiki\/[^\s]+)$/iu.exec(link.trim());
  return match ? `https://${match[1]}/${match[2]}` : null;
}
