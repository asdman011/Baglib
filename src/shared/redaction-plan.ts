export type RedactionRect = [number, number, number, number];
export interface RedactionRegion { page: number; rect: number[] }

/** A page's unrotated visible size in points, as stored in the file. */
export interface RedactionPageGeometry { page: number; width: number; height: number; rotation: number; userUnit?: number }

export interface RedactionBox { x: number; y: number; width: number; height: number; page: number; color: string }
export interface RedactionPlan { pages: number[]; boxes: { sourcePage: number; temporaryPage: number; rect: RedactionRect }[] }

const validRect = (rect: number[]): rect is RedactionRect => rect.length === 4 && rect.every(Number.isFinite) && rect[2] > rect[0] && rect[3] > rect[1];

/** Groups boxes by page and gives each page its 1-based position in the temporary PDF, in document order. */
export function planRedaction(regions: RedactionRegion[]): RedactionPlan {
  for (const region of regions) if (!Number.isInteger(region.page) || region.page < 1 || !validRect(region.rect)) throw new Error('invalid-request');
  const pages = [...new Set(regions.map(region => region.page))].sort((first, second) => first - second);
  const positions = new Map(pages.map((page, index) => [page, index + 1]));
  return { pages, boxes: regions.map(region => ({ sourcePage: region.page, temporaryPage: positions.get(region.page)!, rect: region.rect as RedactionRect })) };
}

/**
 * Converts a box drawn on the page as displayed, top-left origin, to the same area of the unrotated page.
 * A page displayed at 90 degrees was turned clockwise, so its top edge is the stored page's left edge.
 */
export function displayRectToPageRect(rect: RedactionRect, geometry: RedactionPageGeometry): RedactionRect {
  const unit = geometry.userUnit || 1;
  const [left, top, right, bottom] = rect.map(value => value / unit);
  const { width, height } = geometry;
  switch (((geometry.rotation % 360) + 360) % 360) {
    case 0: return [left, top, right, bottom];
    case 90: return [top, height - right, bottom, height - left];
    case 180: return [width - right, height - bottom, width - left, height - top];
    case 270: return [width - bottom, left, width - top, right];
    default: throw new Error('invalid-request');
  }
}

const clampRect = ([left, top, right, bottom]: RedactionRect, width: number, height: number): RedactionRect => [Math.max(0, left), Math.max(0, top), Math.min(width, right), Math.min(height, bottom)];

/** Boxes for the engine, on the temporary PDF whose pages are upright and start at the origin. */
export function engineRedactionBoxes(plan: RedactionPlan, geometry: RedactionPageGeometry[]): RedactionBox[] {
  return plan.boxes.map(box => {
    const page = geometry.find(item => item.page === box.sourcePage);
    if (!page) throw new Error('invalid-request');
    const [left, top, right, bottom] = clampRect(displayRectToPageRect(box.rect, page), page.width, page.height);
    if (right <= left || bottom <= top) throw new Error('invalid-request');
    return { x: left, y: top, width: right - left, height: bottom - top, page: box.temporaryPage, color: '#000000' };
  });
}
