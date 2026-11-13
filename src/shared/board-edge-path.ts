import { edgeEndpoints, type BoardItem } from './boards';

/**
 * Geometry for a board arrow: a straight line or a quadratic curve between the two boxes, the spot where its
 * label sits, and the angle the arrowhead points at the end. Pure numbers only, so the renderer can draw the
 * same path it measured without a DOM.
 */
export type EdgeShape = 'straight' | 'curved';
export interface EdgeGeometry { d: string; labelX: number; labelY: number; endAngle: number }

/** Two decimals, without a negative zero and without trailing zeros when printed. */
const round2 = (value: number): number => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};
const text = (value: number): string => String(round2(value));
const degrees = (y: number, x: number): number => round2((Math.atan2(y, x) * 180) / Math.PI);

/**
 * The path for an arrow from one box to another. `edgeEndpoints` clips both ends to the box borders, so the
 * arrowhead is never hidden under the target box. A curved arrow's control point is the midpoint pushed
 * perpendicular to the line; a positive `bend` goes to the left of the direction of travel in screen
 * coordinates, where y grows downward.
 */
export function boardEdgeGeometry(from: BoardItem, to: BoardItem, shape: EdgeShape, bend = 40): EdgeGeometry {
  const { x1, y1, x2, y2 } = edgeEndpoints(from, to);
  if (x1 === x2 && y1 === y2) {
    const point = `${text(x1)} ${text(y1)}`;
    return { d: `M ${point} L ${point}`, labelX: round2(x1), labelY: round2(y1), endAngle: 0 };
  }
  if (shape === 'straight') {
    return {
      d: `M ${text(x1)} ${text(y1)} L ${text(x2)} ${text(y2)}`,
      labelX: round2((x1 + x2) / 2),
      labelY: round2((y1 + y2) / 2),
      endAngle: degrees(y2 - y1, x2 - x1),
    };
  }
  const dx = x2 - x1, dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const cx = (x1 + x2) / 2 + (dy / length) * bend;
  const cy = (y1 + y2) / 2 + (-dx / length) * bend;
  return {
    d: `M ${text(x1)} ${text(y1)} Q ${text(cx)} ${text(cy)} ${text(x2)} ${text(y2)}`,
    labelX: round2(0.25 * x1 + 0.5 * cx + 0.25 * x2),
    labelY: round2(0.25 * y1 + 0.5 * cy + 0.25 * y2),
    endAngle: degrees(y2 - cy, x2 - cx),
  };
}

/**
 * Spreads the bends of arrows joining the same pair of boxes, so two arrows between the same boxes do not sit
 * on top of each other: `(i - (n - 1) / 2) * spacing` for the n arrows of a pair, in input order. An arrow
 * travelling the opposite way from the pair's first arrow has its bend sign flipped. Self-loops stay at 0.
 */
export function parallelEdgeBends(edges: readonly { id: string; from: string; to: string }[], spacing = 36): Map<string, number> {
  const groups = new Map<string, { id: string; from: string; to: string }[]>();
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    const key = [edge.from, edge.to].sort().join('\u0000');
    const group = groups.get(key);
    if (group) group.push(edge);
    else groups.set(key, [edge]);
  }
  const bends = new Map<string, number>();
  for (const edge of edges) if (edge.from === edge.to) bends.set(edge.id, 0);
  for (const group of groups.values()) {
    const first = group[0];
    group.forEach((edge, index) => {
      const offset = (index - (group.length - 1) / 2) * spacing;
      const opposite = edge.from !== first.from || edge.to !== first.to;
      const bend = opposite ? -offset : offset;
      bends.set(edge.id, bend === 0 ? 0 : bend);
    });
  }
  return bends;
}
