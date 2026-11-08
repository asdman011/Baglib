/** Layout choices for the Word export (S8 extras): a table of contents, the page size and the margins. */
export type WordPageSize = 'a4' | 'letter' | 'a5';
export type WordMargins = 'normal' | 'narrow' | 'wide';
export interface WordLayout { contents: boolean; pageSize: WordPageSize; margins: WordMargins }
export const DEFAULT_WORD_LAYOUT: WordLayout = { contents: true, pageSize: 'a4', margins: 'normal' };

/** Page sizes in twentieths of a point (twips), portrait. */
export const WORD_PAGE_SIZES: Record<WordPageSize, { width: number; height: number }> = {
  a4: { width: 11906, height: 16838 }, letter: { width: 12240, height: 15840 }, a5: { width: 8391, height: 11906 },
};
/** Word's own presets: Normal 2.54 cm all round, Narrow 1.27 cm, Wide 2.54 cm top and bottom with 5.08 cm at the sides. */
export const WORD_MARGINS: Record<WordMargins, { top: number; bottom: number; side: number }> = {
  normal: { top: 1440, bottom: 1440, side: 1440 }, narrow: { top: 720, bottom: 720, side: 720 }, wide: { top: 1440, bottom: 1440, side: 2880 },
};

/** A layout from untrusted input; anything unknown falls back to the default. */
export function wordLayout(input: unknown): WordLayout {
  const value = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    contents: typeof value.contents === 'boolean' ? value.contents : DEFAULT_WORD_LAYOUT.contents,
    pageSize: (Object.keys(WORD_PAGE_SIZES) as WordPageSize[]).find(size => size === value.pageSize) ?? DEFAULT_WORD_LAYOUT.pageSize,
    margins: (Object.keys(WORD_MARGINS) as WordMargins[]).find(margin => margin === value.margins) ?? DEFAULT_WORD_LAYOUT.margins,
  };
}
