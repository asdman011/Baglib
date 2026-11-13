/**
 * KEY-340: colour highlights on the Quran (down to single words), on hadiths and on poetry verses.
 * They are ordinary knowledge highlights with no book (workId null), told apart by their location:
 *   quran:<profile>:S:A                       a whole ayah
 *   quran:<profile>:S:A:W-S:A:W               a word range (may cross ayahs)
 *   sunnah:<collection>:<chapter>:<id>        a hadith; the highlighted words are the quoted text
 *   poetry:ashaar:<poem>:<from>:<to>          verse rows
 */
export const PASSAGE_HIGHLIGHT_COLORS = ['amber', 'emerald', 'rose', 'sky', 'violet'] as const;
export type PassageHighlightColor = typeof PASSAGE_HIGHLIGHT_COLORS[number];
export const HIGHLIGHTS_CHANGED_EVENT = 'baglib:highlights-changed';

export interface WordRef { surah: number; ayah: number; word: number }
export interface QuranRange { profile: 'hafs' | 'warsh'; start: WordRef; end: WordRef; wholeAyahs: boolean }

export function compareWords(a: WordRef, b: WordRef): number {
  return a.surah - b.surah || a.ayah - b.ayah || a.word - b.word;
}

/** A location for a word range, start before end whichever way the user dragged. */
export function quranRangeLocation(profile: 'hafs' | 'warsh', a: WordRef, b: WordRef): string {
  const [start, end] = compareWords(a, b) <= 0 ? [a, b] : [b, a];
  return `quran:${profile}:${start.surah}:${start.ayah}:${start.word}-${end.surah}:${end.ayah}:${end.word}`;
}

export function parseQuranHighlight(location: string): QuranRange | null {
  const words = /^quran:(hafs|warsh):(\d{1,3}):(\d{1,3}):(\d{1,3})-(\d{1,3}):(\d{1,3}):(\d{1,3})$/u.exec(location);
  if (words) {
    const [, profile, s1, a1, w1, s2, a2, w2] = words;
    return { profile: profile as 'hafs' | 'warsh', start: { surah: +s1, ayah: +a1, word: +w1 }, end: { surah: +s2, ayah: +a2, word: +w2 }, wholeAyahs: false };
  }
  const ayah = /^quran:(hafs|warsh):(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/u.exec(location);
  if (ayah) {
    const [, profile, surah, from, to] = ayah;
    return { profile: profile as 'hafs' | 'warsh', start: { surah: +surah, ayah: +from, word: 0 }, end: { surah: +surah, ayah: +(to ?? from), word: Number.MAX_SAFE_INTEGER }, wholeAyahs: true };
  }
  return null;
}

export function wordInRange(word: WordRef, range: Pick<QuranRange, 'start' | 'end'>): boolean {
  return compareWords(word, range.start) >= 0 && compareWords(word, range.end) <= 0;
}

export function isPassageHighlightColor(value: unknown): value is PassageHighlightColor {
  return typeof value === 'string' && (PASSAGE_HIGHLIGHT_COLORS as readonly string[]).includes(value);
}
