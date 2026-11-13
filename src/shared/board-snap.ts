/**
 * Snapping and alignment guides for study boards (KEY-244): pure maths over board pixels with no
 * DOM, so any renderer can use it. While an item is dragged, each axis independently looks for the
 * nearest pair of left/centre/right (top/middle/bottom) edges within the threshold; item snapping
 * beats grid rounding, ties prefer the earlier rect and the earlier edge, and guides describe the
 * aligned line so the UI can draw it across every rect it passes through.
 */

export interface SnapRect { x: number; y: number; w: number; h: number }
export interface SnapGuide { axis: 'x' | 'y'; position: number; from: number; to: number }
export interface SnapResult { x: number; y: number; guides: SnapGuide[] }
export interface SnapOptions { threshold?: number; grid?: number | null }

export const BOARD_SNAP_THRESHOLD = 6;

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Others the maths cannot trust: not a rect, non-finite numbers or a zero/negative size. */
const usable = (value: unknown): value is SnapRect => {
  const rect = value as SnapRect | null | undefined;
  return !!rect && [rect.x, rect.y, rect.w, rect.h].every(isFiniteNumber) && rect.w > 0 && rect.h > 0;
};

/** Left, centre and right of a rect on one axis (top, middle and bottom for the y axis). */
const edges = (rect: SnapRect, axis: 'x' | 'y'): [number, number, number] =>
  axis === 'x' ? [rect.x, rect.x + rect.w / 2, rect.x + rect.w] : [rect.y, rect.y + rect.h / 2, rect.y + rect.h];

interface AxisSnap { shift: number; position: number }

/** Nearest edge pair on one axis within the threshold: the earlier rect, then the earlier edge, wins ties. */
function snapAxis(axis: 'x' | 'y', moving: SnapRect, others: SnapRect[], threshold: number): AxisSnap | null {
  let best: AxisSnap | null = null;
  for (const other of others) {
    const otherEdges = edges(other, axis);
    for (const movingEdge of edges(moving, axis)) {
      for (const otherEdge of otherEdges) {
        const shift = otherEdge - movingEdge;
        if (Math.abs(shift) <= threshold && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, position: otherEdge };
      }
    }
  }
  return best;
}

/** The line a guide draws: the span the moving rect and every rect touching the aligned coordinate cover. */
function guideExtent(axis: 'x' | 'y', position: number, moving: SnapRect, others: SnapRect[]): { from: number; to: number } {
  let from = axis === 'x' ? moving.y : moving.x;
  let to = axis === 'x' ? moving.y + moving.h : moving.x + moving.w;
  for (const other of others) {
    if (!edges(other, axis).some(edge => edge === position)) continue;
    from = Math.min(from, axis === 'x' ? other.y : other.x);
    to = Math.max(to, axis === 'x' ? other.y + other.h : other.x + other.w);
  }
  return { from, to };
}

/** Where a dragged rect should land and which alignment guides to draw; inputs are never mutated. */
export function snapBoardRect(moving: SnapRect, others: SnapRect[], options: SnapOptions = {}): SnapResult {
  const threshold = options.threshold ?? BOARD_SNAP_THRESHOLD;
  const grid = isFiniteNumber(options.grid) && options.grid > 0 ? options.grid : null;
  const valid = Array.isArray(others) ? others.filter(usable) : [];
  const snapX = snapAxis('x', moving, valid, threshold);
  const snapY = snapAxis('y', moving, valid, threshold);
  const x = snapX ? moving.x + snapX.shift : grid ? Math.round(moving.x / grid) * grid : moving.x;
  const y = snapY ? moving.y + snapY.shift : grid ? Math.round(moving.y / grid) * grid : moving.y;
  // Guides are measured on the final position, after both axes have moved.
  const landed: SnapRect = { x, y, w: moving.w, h: moving.h };
  const guides: SnapGuide[] = [];
  if (snapX) guides.push({ axis: 'x', position: snapX.position, ...guideExtent('x', snapX.position, landed, valid) });
  if (snapY) guides.push({ axis: 'y', position: snapY.position, ...guideExtent('y', snapY.position, landed, valid) });
  return { x, y, guides };
}
