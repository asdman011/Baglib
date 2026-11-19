/**
 * KEY-425 (WS-9): the side-by-side panes' pure rules. Where the divider sits, how keys move it, and whether a tab
 * dragged over the content is on a side edge (to open it beside). In Arabic the first pane is on the right.
 */

/** Each pane keeps at least this share of the width. */
export const MIN_PANE_RATIO = 0.2;
/** The divider's resting place and where a double-click returns it. */
export const DEFAULT_SPLIT_RATIO = 0.5;
/** One arrow-key press moves the divider this much; with Shift, four times as much. */
export const SPLIT_KEY_STEP = 0.02;
/** A dragged tab within this many pixels of a side edge offers to open beside. */
export const EDGE_ZONE_PX = 96;

export const clampRatio = (ratio: number): number =>
  Number.isFinite(ratio) ? Math.min(1 - MIN_PANE_RATIO, Math.max(MIN_PANE_RATIO, ratio)) : DEFAULT_SPLIT_RATIO;

/** A box along the screen's x axis. */
export interface Span { left: number; width: number }

/**
 * The first pane's share of the width for a pointer at `x`. In RTL the first pane is on the right, so its
 * share grows as the pointer moves left.
 */
export function ratioFromPointer(x: number, box: Span, dir: 'rtl' | 'ltr'): number {
  if (box.width <= 0) return DEFAULT_SPLIT_RATIO;
  const fromLeft = (x - box.left) / box.width;
  return clampRatio(dir === 'ltr' ? fromLeft : 1 - fromLeft);
}

/**
 * Arrow keys move the divider the way it looks: ArrowRight moves it right in both languages, which grows the
 * first pane in English and shrinks it in Arabic. Home and End go to the limits. Returns null for other keys.
 */
export function ratioFromKey(ratio: number, key: string, dir: 'rtl' | 'ltr', shift = false): number | null {
  const step = SPLIT_KEY_STEP * (shift ? 4 : 1);
  const growFirst = dir === 'ltr' ? 'ArrowRight' : 'ArrowLeft';
  const shrinkFirst = dir === 'ltr' ? 'ArrowLeft' : 'ArrowRight';
  if (key === growFirst) return clampRatio(ratio + step);
  if (key === shrinkFirst) return clampRatio(ratio - step);
  if (key === 'Home') return MIN_PANE_RATIO;
  if (key === 'End') return 1 - MIN_PANE_RATIO;
  return null;
}

/**
 * Which side edge a dragged tab is over: `end` is the side the second pane takes (right in English, left in
 * Arabic), `start` the other one. Null away from the edges.
 */
export function edgeZone(x: number, box: Span, dir: 'rtl' | 'ltr', zone: number = EDGE_ZONE_PX): 'start' | 'end' | null {
  if (box.width <= 0 || x < box.left || x > box.left + box.width) return null;
  const width = Math.min(zone, box.width / 4);
  const nearLeft = x - box.left <= width;
  const nearRight = box.left + box.width - x <= width;
  if (!nearLeft && !nearRight) return null;
  const physical = nearLeft ? 'left' : 'right';
  return (physical === 'right') === (dir === 'ltr') ? 'end' : 'start';
}
