import { poetryBayts } from '../../../shared/poetry';

/** Below this viewport width (Tailwind `sm`), the two hemistichs stack, each centred. */
export const POETRY_STACK_BREAKPOINT_PX = 640;

export type PoetryRowKind = 'hemistichs' | 'single';

export interface PoetryRowModel {
  /** Row number, starting at 0. */
  index: number;
  kind: PoetryRowKind;
  /** The first hemistich (صدر), or the whole line for single-line forms. */
  sadr: string;
  /** The second hemistich (عجز); null for single-line forms (rajaz, free verse, prose, stanzas). */
  ajuz: string | null;
  /** Index of the first source line in `verses_json`. */
  sourceFrom: number;
  /** Index of the last source line in `verses_json`. */
  sourceTo: number;
}

/**
 * Turns the stored lines into display rows. Classical Arabic bayts pair two lines into one row of two hemistichs;
 * every other form keeps one line per row. A trailing odd line of a classical poem is a single, centred row.
 */
export function buildPoetryRows(verses: readonly string[], paired: boolean): PoetryRowModel[] {
  if (!paired) return verses.map((line, index) => ({ index, kind: 'single', sadr: line, ajuz: null, sourceFrom: index, sourceTo: index }));
  return poetryBayts(verses).map(bayt => ({
    index: bayt.index,
    kind: bayt.ajuz === null ? 'single' : 'hemistichs',
    sadr: bayt.sadr,
    ajuz: bayt.ajuz,
    sourceFrom: bayt.index * 2,
    sourceTo: bayt.index * 2 + (bayt.ajuz === null ? 0 : 1),
  }));
}

/** Plain-text form of a row, with the traditional `***` between the hemistichs. */
export function poetryRowText(row: Pick<PoetryRowModel, 'sadr' | 'ajuz'>): string {
  return row.ajuz === null ? row.sadr : `${row.sadr} *** ${row.ajuz}`;
}

export function poetryRowsText(rows: readonly Pick<PoetryRowModel, 'sadr' | 'ajuz'>[]): string {
  return rows.map(poetryRowText).join('\n');
}

/** Reference line appended to copied text: poet, title and metre. */
export function poetryCitation(poem: { poet_name: string; title: string; meter: string | null }): string {
  return [poem.poet_name, poem.title, poem.meter].filter(Boolean).join(' — ');
}

export function poetryCopyText(rows: readonly Pick<PoetryRowModel, 'sadr' | 'ajuz'>[], poem: { poet_name: string; title: string; meter: string | null }): string {
  return `${poetryRowsText(rows)}\n${poetryCitation(poem)}`;
}

/** Space between the two hemistichs of a row (Tailwind `gap-x-8`). */
export const POETRY_HEMISTICH_GAP_PX = 32;

/**
 * Whether both hemistichs fit side by side, each on one line. When the widest hemistich needs more than half the row
 * (a large text size or a narrow window), the two halves stack instead, so a hemistich never breaks inside a column.
 * An unmeasured row (width 0) keeps the two columns.
 */
export function poetryHemistichsFit(rowWidth: number, widestHemistich: number, gap = POETRY_HEMISTICH_GAP_PX): boolean {
  if (!(rowWidth > 0) || !(widestHemistich > 0)) return true;
  return widestHemistich * 2 + gap <= rowWidth;
}

/**
 * CSS classes of a row's line block: two equal, centred columns, or one column. Arabic lines are centred;
 * English stanza lines keep the reading direction's start edge inside the centred poem block.
 * `stacked` puts the second hemistich under the first at any width.
 */
export function poetryRowLineClass(kind: PoetryRowKind, centred = true, stacked = false): string {
  const align = centred ? 'text-center' : 'text-start';
  if (kind === 'hemistichs' && stacked) return `grid grid-cols-1 gap-y-1 ${align}`;
  return kind === 'hemistichs'
    ? `grid grid-cols-2 items-start gap-x-8 ${align} max-sm:grid-cols-1 max-sm:gap-x-0 max-sm:gap-y-1`
    : `grid grid-cols-1 ${align}`;
}

const ARABIC_LETTER = /[\u0621-\u064A\u066E-\u06D3]/u;
const ARABIC_MARKS = /[\u064B-\u065F\u0670\u0640\u06D6-\u06ED]/gu;

/**
 * The rhyme letter (الروي) of a poem: the commonest last letter across the closing hemistichs
 * (alif maqsura counts as ya, ta marbuta as ha).
 * Derived from the text only, nothing is stored. Returns null when there is no clear Arabic ending.
 */
export function poetryRhymeLetter(rows: readonly Pick<PoetryRowModel, 'sadr' | 'ajuz'>[]): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const line = (row.ajuz ?? row.sadr).replace(/<[^>]*>/gu, '').replace(ARABIC_MARKS, '').replace(/[^\p{L}]+$/gu, '');
    const letter = [...line].at(-1);
    if (!letter || !ARABIC_LETTER.test(letter)) continue;
    const key = letter === 'ى' ? 'ي' : letter === 'ة' ? 'ه' : letter;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | null = null, bestCount = 0, total = 0;
  for (const [letter, count] of counts) { total += count; if (count > bestCount) { best = letter; bestCount = count; } }
  return best !== null && total >= 2 && bestCount / total >= 0.5 ? best : null;
}
