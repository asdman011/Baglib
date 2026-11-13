/**
 * KEY-335: one connected, stable selection over the PDF text layer.
 *
 * pdf.js text spans are absolutely positioned and leave gaps between them. Without help:
 * - while dragging, a pointer over a gap lands on the layer itself, so the selection jumps to the
 *   start or end of the page and back (flicker);
 * - native ::selection paints one box per span, with holes between words and between lines.
 *
 * The fix follows pdf.js's own TextLayerBuilder: an `endOfContent` element that covers the page while
 * selecting, moved next to the selection's moving end in Chromium. The selection is also painted as
 * merged per-line blocks instead of the per-span native boxes.
 */

export interface NormalizedRect { x: number; y: number; width: number; height: number }
interface Box { left: number; top: number; width: number; height: number; right?: number; bottom?: number }

/**
 * Merge rects on the same line into one block, then close the small vertical gaps between
 * consecutive lines, so a multi-line selection reads as one connected shape.
 * Rects are percentages of the page (x/width of the page width, y/height of the page height).
 */
export function mergeNormalizedRects(rects: NormalizedRect[]): NormalizedRect[] {
  const valid = rects.filter(r => r.width >= 0.5 && r.height >= 0.5 && r.x >= 0 && r.y >= 0);
  if (valid.length <= 1) return valid.map(r => ({ ...r }));
  const sorted = [...valid].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: NormalizedRect[][] = [];
  for (const rect of sorted) {
    // Same line: the boxes overlap vertically by at least half of the smaller one.
    const line = lines.find(group => group.some(other => {
      const overlap = Math.min(other.y + other.height, rect.y + rect.height) - Math.max(other.y, rect.y);
      return overlap >= Math.min(other.height, rect.height) * 0.5;
    }));
    if (line) line.push(rect); else lines.push([rect]);
  }
  const merged: NormalizedRect[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
    let current = { ...line[0] };
    for (const next of line.slice(1)) {
      // Join runs on one line unless the gap is column-sized (more than 4% of the page width).
      if (next.x <= current.x + current.width + 4) {
        const right = Math.max(current.x + current.width, next.x + next.width);
        const bottom = Math.max(current.y + current.height, next.y + next.height);
        current.y = Math.min(current.y, next.y);
        current.width = right - current.x;
        current.height = bottom - current.y;
      } else { merged.push(current); current = { ...next }; }
    }
    merged.push(current);
  }
  merged.sort((a, b) => a.y - b.y || a.x - b.x);
  // Close the gap to the next line when it is smaller than one line (leading), so lines touch.
  for (let i = 0; i < merged.length; i++) {
    const current = merged[i];
    const next = merged.slice(i + 1).find(other => other.y > current.y + current.height * 0.5
      && other.x < current.x + current.width && other.x + other.width > current.x);
    if (!next) continue;
    const gap = next.y - (current.y + current.height);
    if (gap > 0 && gap < current.height) current.height = next.y - current.y;
  }
  return merged;
}

/** Client rects of a selection range → merged blocks in page percentages; boundary leaks are dropped. */
export function selectionBlocks(clientRects: Box[], page: Box): NormalizedRect[] {
  const pageRight = page.right ?? page.left + page.width;
  const normalized = clientRects
    .filter(r => {
      const right = r.right ?? r.left + r.width;
      if (r.width < 3 || r.height < 3) return false;
      if (r.left <= page.left || right <= page.left + 2 || r.left >= pageRight - 2) return false;
      return r.width < page.width * 0.98;
    })
    .map(r => {
      const x = Math.max(0, Math.min(100, ((r.left - page.left) / page.width) * 100));
      const y = Math.max(0, Math.min(100, ((r.top - page.top) / page.height) * 100));
      return { x, y, width: Math.max(0, Math.min(100 - x, (r.width / page.width) * 100)), height: Math.max(0, Math.min(100 - y, (r.height / page.height) * 100)) };
    })
    .filter(r => r.width >= 0.5 && r.height >= 0.5 && !(r.x <= 0.2 && r.width < 2));
  return mergeNormalizedRects(normalized);
}

/* ---------------------------------------------------------------- endOfContent management */

const layers = new Map<HTMLElement, HTMLElement>();
let listening = false;
let pointerDown = false;
let previousRange: Range | null = null;

function reset(end: HTMLElement, layer: HTMLElement) {
  end.style.width = '';
  end.style.height = '';
  layer.append(end);
  layer.classList.remove('selecting');
}

function listen() {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener('pointerdown', () => { pointerDown = true; });
  document.addEventListener('pointerup', () => { pointerDown = false; layers.forEach(reset); });
  window.addEventListener('blur', () => { pointerDown = false; layers.forEach(reset); });
  document.addEventListener('keyup', () => { if (!pointerDown) layers.forEach(reset); });
  document.addEventListener('selectionchange', () => {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) { layers.forEach(reset); previousRange = null; return; }
    const active = new Set<HTMLElement>();
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i);
      for (const layer of layers.keys()) if (!active.has(layer) && range.intersectsNode(layer)) active.add(layer);
    }
    for (const [layer, end] of layers) {
      if (active.has(layer)) layer.classList.add('selecting'); else reset(end, layer);
    }
    // Chromium: keep the cover right after the moving end of the selection, as pdf.js does.
    const range = selection.getRangeAt(0);
    const modifyStart = previousRange && (range.compareBoundaryPoints(Range.END_TO_END, previousRange) === 0 || range.compareBoundaryPoints(Range.START_TO_END, previousRange) === 0);
    let anchor: Node | null = modifyStart ? range.startContainer : range.endContainer;
    if (anchor?.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;
    const parent = (anchor as HTMLElement | null)?.parentElement;
    const layer = parent?.closest<HTMLElement>('.textLayer');
    const end = layer ? layers.get(layer) : undefined;
    if (end && layer && anchor && parent) {
      end.style.width = layer.style.width;
      end.style.height = layer.style.height;
      parent.insertBefore(end, modifyStart ? anchor : anchor.nextSibling);
    }
    previousRange = range.cloneRange();
  });
}

/** Adds the endOfContent cover to a rendered text layer; returns the cleanup for when the layer is rebuilt. */
export function attachTextLayerSelection(layer: HTMLElement): () => void {
  listen();
  const end = document.createElement('div');
  end.className = 'endOfContent';
  layer.append(end);
  layers.set(layer, end);
  // Place the cover right after the pressed span at once, so the first pointer move cannot reach a cover still
  // sitting at the end of the layer (which would select to the page end for a frame) before selectionchange runs.
  const down = (event: MouseEvent) => {
    layer.classList.add('selecting');
    const span = (event.target as HTMLElement | null)?.closest?.('span');
    if (span?.parentElement && layer.contains(span)) {
      end.style.width = layer.style.width;
      end.style.height = layer.style.height;
      span.parentElement.insertBefore(end, span.nextSibling);
    }
  };
  layer.addEventListener('mousedown', down);
  return () => { layer.removeEventListener('mousedown', down); layers.delete(layer); end.remove(); layer.classList.remove('selecting'); };
}
