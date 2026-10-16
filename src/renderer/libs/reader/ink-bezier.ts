/**
 * Stylus Handwriting & Bézier Disc Contour Engine (Readest Algorithm)
 *
 * Implements smooth, pressure-sensitive stylus drawing without inner seam artifacts.
 * Converts stroke samples into quadratic Bézier curves sampled at 1.5px intervals (`STEP = 1.5`),
 * then traces the outer envelope of tangent discs as a single continuous closed contour path (`traceOutline`).
 */

import type { InkStroke, InkStrokePoint } from '../../../shared/types/annotation';

export const STEP_INTERVAL = 1.5; // Sampling interval along Bézier curves in pixels

/**
 * Normalizes stylus pressure sensitivity:
 * pressureScale(p) = 0.5 + (p ?? 0.5)
 */
export function pressureScale(p?: number): number {
  if (p == null || isNaN(p)) return 1.0;
  return 0.5 + Math.min(1.0, Math.max(0, p));
}

export interface DiscSample {
  x: number;
  y: number;
  radius: number;
  angle: number;
}

/**
 * Calculates a point on a quadratic Bézier curve at parameter t (0 <= t <= 1)
 */
export function getQuadraticBezierPoint(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const invT = 1 - t;
  return {
    x: invT * invT * p0.x + 2 * invT * t * p1.x + t * t * p2.x,
    y: invT * invT * p0.y + 2 * invT * t * p1.y + t * t * p2.y,
  };
}

/**
 * Samples a quadratic Bézier segment at discrete intervals.
 */
export function sampleQuadraticSegment(
  p0: { x: number; y: number; p: number },
  p1: { x: number; y: number; p: number },
  p2: { x: number; y: number; p: number },
  baseRadius: number,
  samples: DiscSample[],
  step = STEP_INTERVAL
) {
  // Approximate arc length
  const chord = Math.hypot(p2.x - p0.x, p2.y - p0.y);
  const numSteps = Math.max(2, Math.ceil(chord / step));

  for (let i = 0; i <= numSteps; i++) {
    const t = i / numSteps;
    const invT = 1 - t;

    // Quadratic Bézier formula: B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
    const pt = getQuadraticBezierPoint(p0, p1, p2, t);
    const x = pt.x;
    const y = pt.y;
    const p = invT * invT * p0.p + 2 * invT * t * p1.p + t * t * p2.p;

    // Tangent derivative: B'(t) = 2(1-t)(P1-P0) + 2t(P2-P1)
    const dx = 2 * invT * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
    const dy = 2 * invT * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
    const angle = Math.atan2(dy, dx);

    const radius = baseRadius * pressureScale(p);
    samples.push({ x, y, radius, angle });
  }
}

export interface ContourPoints {
  leftPoints: Array<{ x: number; y: number }>;
  rightPoints: Array<{ x: number; y: number }>;
  samples: DiscSample[];
}

/**
 * Computes left and right contour points along the outer envelope.
 */
export function computeContourPoints(points: InkStrokePoint[], baseWidth = 3): ContourPoints {
  const baseRadius = baseWidth / 2;
  const samples: DiscSample[] = [];

  if (!points || points.length === 0) {
    return { leftPoints: [], rightPoints: [], samples: [] };
  }

  if (points.length === 1) {
    const p = points[0];
    const r = Math.max(1, baseRadius * pressureScale(p.pressure));
    samples.push({ x: p.x, y: p.y, radius: r, angle: 0 });
    return {
      leftPoints: [{ x: p.x - r, y: p.y }],
      rightPoints: [{ x: p.x + r, y: p.y }],
      samples,
    };
  }

  if (points.length === 2) {
    const p0 = { x: points[0].x, y: points[0].y, p: points[0].pressure ?? 0.5 };
    const p2 = { x: points[1].x, y: points[1].y, p: points[1].pressure ?? 0.5 };
    const p1 = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2, p: (p0.p + p2.p) / 2 };
    sampleQuadraticSegment(p0, p1, p2, baseRadius, samples);
  } else {
    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];

      const p0 =
        i === 0
          ? { x: curr.x, y: curr.y, p: curr.pressure ?? 0.5 }
          : {
              x: (points[i - 1].x + curr.x) / 2,
              y: (points[i - 1].y + curr.y) / 2,
              p: ((points[i - 1].pressure ?? 0.5) + (curr.pressure ?? 0.5)) / 2,
            };

      const p1 = { x: curr.x, y: curr.y, p: curr.pressure ?? 0.5 };
      const p2 = {
        x: (curr.x + next.x) / 2,
        y: (curr.y + next.y) / 2,
        p: ((curr.pressure ?? 0.5) + (next.pressure ?? 0.5)) / 2,
      };

      sampleQuadraticSegment(p0, p1, p2, baseRadius, samples);
    }
  }

  const leftPoints: Array<{ x: number; y: number }> = [];
  const rightPoints: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const perp = s.angle + Math.PI / 2;

    leftPoints.push({
      x: s.x + Math.cos(perp) * s.radius,
      y: s.y + Math.sin(perp) * s.radius,
    });

    rightPoints.push({
      x: s.x - Math.cos(perp) * s.radius,
      y: s.y - Math.sin(perp) * s.radius,
    });
  }

  return { leftPoints, rightPoints, samples };
}

/**
 * Converts stroke sample points into a single continuous outer envelope closed Path2D.
 */
export function traceOutline(points: InkStrokePoint[], baseWidth = 3): Path2D {
  const Path2DClass = typeof Path2D !== 'undefined' ? Path2D : (globalThis as any).Path2D;
  const path = Path2DClass ? new Path2DClass() : ({
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    closePath: () => {},
  } as any);

  if (!points || points.length === 0) return path;

  const baseRadius = baseWidth / 2;

  // Single dot click
  if (points.length === 1) {
    const p = points[0];
    const r = Math.max(1, baseRadius * pressureScale(p.pressure));
    path.arc(p.x, p.y, r, 0, Math.PI * 2);
    return path;
  }

  const { leftPoints, rightPoints, samples } = computeContourPoints(points, baseWidth);
  if (samples.length === 0) return path;

  // Construct closed polygon: Start with start cap, left edge, end cap, right edge back
  const first = samples[0];
  const last = samples[samples.length - 1];

  path.moveTo(leftPoints[0].x, leftPoints[0].y);

  // Left envelope
  for (let i = 1; i < leftPoints.length; i++) {
    path.lineTo(leftPoints[i].x, leftPoints[i].y);
  }

  // End round cap
  path.arc(last.x, last.y, last.radius, last.angle + Math.PI / 2, last.angle - Math.PI / 2, false);

  // Right envelope (reverse order)
  for (let i = rightPoints.length - 1; i >= 0; i--) {
    path.lineTo(rightPoints[i].x, rightPoints[i].y);
  }

  // Start round cap
  path.arc(first.x, first.y, first.radius, first.angle - Math.PI / 2, first.angle + Math.PI / 2, false);

  path.closePath();
  return path;
}

/**
 * Renders an InkStroke onto a canvas 2D rendering context.
 */
export function renderInkStroke(
  ctx: CanvasRenderingContext2D,
  stroke: InkStroke,
  options?: { isEraser?: boolean }
): void {
  if (!stroke.points || stroke.points.length === 0) return;

  ctx.save();

  if (options?.isEraser) {
    ctx.globalCompositeOperation = 'destination-out';
  } else if (stroke.tool === 'highlighter') {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = stroke.color;
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = stroke.color;
  }

  const path = traceOutline(stroke.points, stroke.width);
  ctx.fill(path);

  ctx.restore();
}
