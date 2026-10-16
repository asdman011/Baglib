/**
 * Reading Ruler Algorithm & Coordinate Geometry Engine
 * Reverse-engineered from Readest (ReadingRuler.tsx & readingRuler.ts)
 * 
 * Provides line-box measurement, median thickness filtering, line merging,
 * and smooth snapping for horizontal LTR/RTL and vertical reading flows.
 */

import { RulerLineBox } from './types';

export interface ClientRectLike {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface ContainerRectLike {
  top: number;
  left: number;
  right: number;
  bottom?: number;
  width?: number;
  height?: number;
}

/**
 * Range.getClientRects() aggregates the border boxes of every fully-enclosed
 * element, so multi-line <p>/container blocks show up as rects much taller
 * than a text line. Drop those by calculating the median thickness and filtering
 * out elements with thickness > median * 1.8.
 */
export function dropBlockRects(rects: ClientRectLike[], isVertical = false): ClientRectLike[] {
  const valid = rects.filter((r) => r && r.width > 0 && r.height > 0);
  if (valid.length < 3) return valid;

  const thickness = (r: ClientRectLike) => (isVertical ? r.width : r.height);
  const sorted = valid.map(thickness).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  if (median <= 0) return valid;

  const limit = median * 1.8;
  return valid.filter((r) => thickness(r) <= limit);
}

/**
 * Merge sorted spans into visual lines: spans that overlap by more
 * than half of the smaller span are treated as one line.
 */
export function mergeLineSpans(spans: RulerLineBox[]): RulerLineBox[] {
  if (spans.length === 0) return [];

  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const lines: RulerLineBox[] = [];

  for (const span of sorted) {
    const current = lines[lines.length - 1];
    if (current) {
      const overlap = Math.min(current.end, span.end) - Math.max(current.start, span.start);
      const minHeight = Math.min(current.end - current.start, span.end - span.start);
      if (overlap > 0.5 * minHeight) {
        current.start = Math.min(current.start, span.start);
        current.end = Math.max(current.end, span.end);
        continue;
      }
    }
    lines.push({ start: span.start, end: span.end });
  }

  return lines;
}

/**
 * Converts per-fragment client rects into sorted visual line boxes along the
 * ruler axis in container-relative coordinates.
 */
export function buildLineBoxes(
  rects: ClientRectLike[],
  isVertical: boolean,
  rtl: boolean,
  containerRect: ContainerRectLike
): RulerLineBox[] {
  const spans: RulerLineBox[] = [];
  const filtered = dropBlockRects(rects, isVertical);

  for (const r of filtered) {
    let start: number;
    let end: number;

    if (isVertical) {
      if (rtl) {
        start = containerRect.right - r.right;
        end = containerRect.right - r.left;
      } else {
        start = r.left - containerRect.left;
        end = r.right - containerRect.left;
      }
    } else {
      start = r.top - containerRect.top;
      end = r.bottom - containerRect.top;
    }

    if (end < start) {
      [start, end] = [end, start];
    }
    spans.push({ start, end });
  }

  return mergeLineSpans(spans);
}

const READING_RULER_MIN_VISIBLE_RATIO = 0.5;

/**
 * Filters line boxes that are at least half visible within [0, dimension] viewport boundary.
 */
export function filterVisibleLineBoxes(
  lineBoxes: RulerLineBox[],
  dimension: number
): RulerLineBox[] {
  if (dimension <= 0) return lineBoxes;
  return lineBoxes.filter((b) => {
    const height = b.end - b.start;
    if (height <= 0) return false;
    const visible = Math.min(b.end, dimension) - Math.max(b.start, 0);
    return visible >= READING_RULER_MIN_VISIBLE_RATIO * height;
  });
}

/**
 * Snaps the reading ruler to the closest line box.
 * Returns { top, height } for the clear reading slot.
 */
export function snapReadingRulerToLines(
  boxes: RulerLineBox[],
  targetPosition: number,
  rulerHeight = 36
): { slotStart: number; slotHeight: number } {
  if (boxes.length === 0) {
    return {
      slotStart: Math.max(0, targetPosition - rulerHeight / 2),
      slotHeight: rulerHeight,
    };
  }

  // Find line box closest to target position
  let closestBox = boxes[0];
  let minDiff = Infinity;

  for (const box of boxes) {
    const boxCenter = (box.start + box.end) / 2;
    const diff = Math.abs(boxCenter - targetPosition);
    if (diff < minDiff) {
      minDiff = diff;
      closestBox = box;
    }
  }

  const boxHeight = closestBox.end - closestBox.start;
  const padding = Math.max(4, Math.floor((rulerHeight - boxHeight) / 2));
  const slotStart = Math.max(0, closestBox.start - padding);
  const slotHeight = Math.max(rulerHeight, boxHeight + padding * 2);

  return { slotStart, slotHeight };
}

/**
 * Hit-tests a document point to find caret range using modern caretRangeFromPoint / caretPositionFromPoint.
 */
export function getCaretRangeFromPoint(
  doc: Document,
  x: number,
  y: number
): Range | null {
  if (typeof (doc as any).caretRangeFromPoint === 'function') {
    return (doc as any).caretRangeFromPoint(x, y);
  }
  if (typeof (doc as any).caretPositionFromPoint === 'function') {
    const pos = (doc as any).caretPositionFromPoint(x, y);
    if (pos && pos.offsetNode) {
      const range = doc.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.setEnd(pos.offsetNode, pos.offset);
      return range;
    }
  }
  return null;
}
