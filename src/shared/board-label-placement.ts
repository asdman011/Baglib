import { edgeEndpoints, type Board, type BoardItem } from './boards';
import type { EdgeGeometry } from './board-edge-path';

export interface LabelBox { x: number; y: number; w: number; h: number }
export interface BoardLabelPlacement extends LabelBox { centreX: number; centreY: number }

/** Conservative code-point sizing, including Arabic marks and mixed scripts; shared by both views. */
export function boardLabelSize(label: string): { w: number; h: number } {
  return { w: Math.max(32, Array.from(label).length * 8 + 24), h: 28 };
}

export function labelBoxesIntersect(a: LabelBox, b: LabelBox, gap = 4): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

/** Start at the quadratic midpoint. Try both normal directions in six bounded steps.
 * Stable edge order gives earlier labels priority; dense/impossible boards keep a deterministic fallback.
 * A quadratic's midpoint tangent is parallel to its endpoint chord, including negative bends.
 */
export function placeBoardLabels(
  items: readonly BoardItem[], edges: Board['edges'], geometries: ReadonlyMap<string, EdgeGeometry>,
): Map<string, BoardLabelPlacement> {
  const byId = new Map(items.map(item => [item.id, item]));
  const obstacles: LabelBox[] = [...items];
  const labels = new Map<string, BoardLabelPlacement>();
  for (const edge of edges) {
    const geometry = geometries.get(edge.id), from = byId.get(edge.from), to = byId.get(edge.to);
    if (!edge.label || !geometry || !from || !to) continue;
    const ends = edgeEndpoints(from, to);
    const dx = ends.x2 - ends.x1, dy = ends.y2 - ends.y1;
    const length = Math.hypot(dx, dy);
    const nx = length ? dy / length : 0, ny = length ? -dx / length : -1;
    const size = boardLabelSize(edge.label);
    const at = (distance: number): BoardLabelPlacement => {
      const centreX = geometry.labelX + nx * distance, centreY = geometry.labelY + ny * distance;
      return { ...size, x: centreX - size.w / 2, y: centreY - size.h / 2, centreX, centreY };
    };
    let placed = at(0);
    if (obstacles.some(box => labelBoxesIntersect(placed, box))) {
      search: for (let step = 1; step <= 6; step++) {
        for (const sign of [1, -1]) {
          const candidate = at(sign * step * 32);
          if (!obstacles.some(box => labelBoxesIntersect(candidate, box))) { placed = candidate; break search; }
        }
      }
    }
    labels.set(edge.id, placed);
    obstacles.push(placed);
  }
  return labels;
}
