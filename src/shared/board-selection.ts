import { BOARD_LIMITS, type Board, type BoardItem } from './boards';

/**
 * Choosing several cards at once on a study board: the marquee a pointer drags, the selection set, and the
 * moves that act on it (nudge, duplicate, align, group drag). Pure and immutable, so the renderer can undo a
 * whole group move by keeping the previous array. Coordinates are board coordinates; the UI handles zoom and
 * the RTL mapping of `start`/`end`.
 */
export interface Marquee { x1: number; y1: number; x2: number; y2: number }
export interface Bounds { x: number; y: number; w: number; h: number }

const clamp = (value: number): number => Math.min(BOARD_LIMITS.coordinate, Math.max(-BOARD_LIMITS.coordinate, value));
const shift = (value: number): number => Math.round(clamp(value));

/** Corners in any order. `touch` keeps anything the marquee reaches (edges count), `contain` only what it covers. */
export function itemsInMarquee(items: BoardItem[], marquee: Marquee, mode: 'touch' | 'contain'): string[] {
  const left = Math.min(marquee.x1, marquee.x2), right = Math.max(marquee.x1, marquee.x2);
  const top = Math.min(marquee.y1, marquee.y2), bottom = Math.max(marquee.y1, marquee.y2);
  return items.filter(item => {
    const inside = item.x >= left && item.x + item.w <= right && item.y >= top && item.y + item.h <= bottom;
    const touches = item.x <= right && item.x + item.w >= left && item.y <= bottom && item.y + item.h >= top;
    return mode === 'contain' ? inside : touches;
  }).map(item => item.id);
}

/** Ctrl/Cmd-click or Shift-click: toggle one card, or replace the selection with it. Order is kept and ids never repeat. */
export function toggleSelection(selected: readonly string[], id: string, additive: boolean): string[] {
  if (!additive) return [id];
  const unique = [...new Set(selected)];
  return unique.includes(id) ? unique.filter(existing => existing !== id) : [...unique, id];
}

/** The box that covers the selected cards, or null when none of the ids is on the board. */
export function selectionBounds(items: BoardItem[], ids: Iterable<string>): Bounds | null {
  const wanted = new Set(ids);
  const chosen = items.filter(item => wanted.has(item.id));
  if (!chosen.length) return null;
  const left = Math.min(...chosen.map(item => item.x));
  const top = Math.min(...chosen.map(item => item.y));
  const right = Math.max(...chosen.map(item => item.x + item.w));
  const bottom = Math.max(...chosen.map(item => item.y + item.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** A group drag or arrow-key nudge: selected cards move and clamp to the board's coordinate limit, the rest stay put. Not rounded, so small zoomed-out drag steps still add up. */
export function moveItems(items: BoardItem[], ids: Iterable<string>, dx: number, dy: number): BoardItem[] {
  const wanted = new Set(ids);
  const stepX = Number.isFinite(dx) ? dx : 0;
  const stepY = Number.isFinite(dy) ? dy : 0;
  if (!stepX && !stepY) return items;
  return items.map(item => (wanted.has(item.id) ? { ...item, x: clamp(item.x + stepX), y: clamp(item.y + stepY) } : item));
}

/** Copies the selected cards beside themselves, with only the arrows that run between two copies. */
export function duplicateSelection(board: Pick<Board, 'items' | 'edges'>, ids: Iterable<string>, newId: () => string, offset = 24): { board: Pick<Board, 'items' | 'edges'>; newIds: string[] } {
  const wanted = new Set(ids);
  const step = Number.isFinite(offset) ? offset : 0;
  const remap = new Map<string, string>();
  const copies = board.items.filter(item => wanted.has(item.id)).map(item => {
    const id = newId();
    remap.set(item.id, id);
    return { ...item, id, x: shift(item.x + step), y: shift(item.y + step) };
  });
  const edges = board.edges.flatMap(edge => {
    const from = remap.get(edge.from), to = remap.get(edge.to);
    return from && to ? [{ id: newId(), from, to, label: edge.label }] : [];
  });
  return { board: { items: [...board.items, ...copies], edges: [...board.edges, ...edges] }, newIds: copies.map(copy => copy.id) };
}

export type AlignMode = 'start' | 'centre' | 'end' | 'top' | 'middle' | 'bottom';

/** Lines two or more selected cards up on one edge or centre; a single card has nothing to align to. */
export function alignItems(items: BoardItem[], ids: Iterable<string>, mode: AlignMode): BoardItem[] {
  const wanted = new Set(ids);
  const chosen = items.filter(item => wanted.has(item.id));
  if (chosen.length < 2) return items;
  const bounds = selectionBounds(chosen, chosen.map(item => item.id));
  if (!bounds) return items;
  return items.map(item => {
    if (!wanted.has(item.id)) return item;
    if (mode === 'start') return { ...item, x: shift(bounds.x) };
    if (mode === 'end') return { ...item, x: shift(bounds.x + bounds.w - item.w) };
    if (mode === 'centre') return { ...item, x: shift(bounds.x + (bounds.w - item.w) / 2) };
    if (mode === 'top') return { ...item, y: shift(bounds.y) };
    if (mode === 'bottom') return { ...item, y: shift(bounds.y + bounds.h - item.h) };
    return { ...item, y: shift(bounds.y + (bounds.h - item.h) / 2) };
  });
}
