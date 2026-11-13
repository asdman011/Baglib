/**
 * KEY-340: draw passage highlights over rendered text with the CSS Custom Highlight API
 * (`::highlight(baglib-<color>)`), so the text itself is never rewritten.
 */
import { PASSAGE_HIGHLIGHT_COLORS, type PassageHighlightColor } from '../../../shared/passage-highlights';

/** Where the first occurrence of `text` starts and ends across consecutive text pieces (node index + offset). */
export function locateText(pieces: string[], text: string): { start: [number, number]; end: [number, number] } | null {
  const wanted = text.trim();
  if (!wanted) return null;
  const whole = pieces.join('');
  const from = whole.indexOf(wanted);
  if (from < 0) return null;
  const to = from + wanted.length;
  let offset = 0;
  let start: [number, number] | null = null;
  for (let index = 0; index < pieces.length; index++) {
    const next = offset + pieces[index].length;
    if (!start && from < next) start = [index, from - offset];
    if (start && to <= next) return { start, end: [index, to - offset] };
    offset = next;
  }
  return null;
}

/** The DOM range of the first occurrence of `text` inside `root`, across text nodes; null when it is not there. */
export function findTextRange(root: Node, text: string): Range | null {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
  const found = locateText(nodes.map(node => node.data), text);
  if (!found) return null;
  const range = document.createRange();
  range.setStart(nodes[found.start[0]], found.start[1]);
  range.setEnd(nodes[found.end[0]], found.end[1]);
  return range;
}

type HighlightRegistry = { set: (name: string, value: unknown) => void; delete: (name: string) => void };

/** Replace this owner's highlights with the given ranges, one CSS highlight per colour. */
export function paintTextHighlights(owner: string, ranges: { range: Range; color: PassageHighlightColor }[]): void {
  const registry = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS?.highlights;
  const HighlightClass = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  if (!registry || !HighlightClass) return;
  for (const color of PASSAGE_HIGHLIGHT_COLORS) {
    const mine = ranges.filter(entry => entry.color === color).map(entry => entry.range);
    const name = `baglib-${owner}-${color}`;
    if (mine.length) registry.set(name, new HighlightClass(...mine)); else registry.delete(name);
  }
}
