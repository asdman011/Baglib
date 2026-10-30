/**
 * W3C CSS Custom Highlight API Manager (Readest Non-Destructive Highlighting Pattern)
 *
 * Implements non-destructive text highlighting using `CSS.highlights.set()`.
 * Crucial for Arabic typography: does NOT wrap text nodes in intrusive <span> elements,
 * completely preventing ligature breakage, letter disconnection, and diacritic clipping.
 */


export const HIGHLIGHT_COLORS = [
  { id: 'amber', label: 'Amber', hex: '#f59e0b', cssClass: 'baglib-highlight-amber' },
  { id: 'emerald', label: 'Emerald', hex: '#10b981', cssClass: 'baglib-highlight-emerald' },
  { id: 'rose', label: 'Rose', hex: '#f43f5e', cssClass: 'baglib-highlight-rose' },
  { id: 'sky', label: 'Sky', hex: '#0ea5e9', cssClass: 'baglib-highlight-sky' },
  { id: 'violet', label: 'Violet', hex: '#8b5cf6', cssClass: 'baglib-highlight-violet' },
];

export function isCustomHighlightSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof CSS !== 'undefined' &&
    'highlights' in CSS &&
    typeof (window).Highlight !== 'undefined'
  );
}

/**
 * Searches a DOM subtree for all occurrences of exact text (normalized) and returns Range objects.
 */
export function findRangesForText(root: Node, searchText: string): Range[] {
  const cleanSearch = searchText.trim().replace(/\s+/g, ' ');
  if (!cleanSearch) return [];

  const ranges: Range[] = [];
  const textNodes: Text[] = [];

  // 1. Collect all non-empty text nodes
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let node: Text | null = walker.nextNode() as Text;
  while (node) {
    if (node.textContent && node.textContent.trim().length > 0) {
      textNodes.push(node);
    }
    node = walker.nextNode() as Text;
  }

  if (textNodes.length === 0) return [];

  // Build continuous text representation while mapping offsets back to text nodes
  let fullText = '';
  const nodeOffsetMap: Array<{ node: Text; startInFull: number; endInFull: number }> = [];

  for (const tNode of textNodes) {
    const text = tNode.textContent || '';
    const startInFull = fullText.length;
    fullText += text;
    nodeOffsetMap.push({
      node: tNode,
      startInFull,
      endInFull: fullText.length,
    });
  }

  // Find match index in continuous text
  // Handle whitespace variation
  let searchIdx = 0;
  let matchIdx = fullText.indexOf(cleanSearch, searchIdx);

  // If exact substring not found, try flexible whitespace search
  if (matchIdx === -1) {
    const normalizedFull = fullText.replace(/\s+/g, ' ');
    const normIdx = normalizedFull.indexOf(cleanSearch);
    if (normIdx !== -1) {
      // Find approximate target
      matchIdx = fullText.indexOf(cleanSearch.slice(0, Math.min(20, cleanSearch.length)));
    }
  }

  while (matchIdx !== -1) {
    const matchEnd = matchIdx + cleanSearch.length;

    // Map matchIdx and matchEnd back to text nodes
    const startNodeInfo = nodeOffsetMap.find((m) => matchIdx >= m.startInFull && matchIdx < m.endInFull);
    const endNodeInfo = nodeOffsetMap.find((m) => matchEnd > m.startInFull && matchEnd <= m.endInFull);

    if (startNodeInfo && endNodeInfo) {
      const range = document.createRange();
      const startOffset = matchIdx - startNodeInfo.startInFull;
      const endOffset = matchEnd - endNodeInfo.startInFull;

      try {
        range.setStart(startNodeInfo.node, Math.min(startOffset, startNodeInfo.node.length));
        range.setEnd(endNodeInfo.node, Math.min(endOffset, endNodeInfo.node.length));
        ranges.push(range);
      } catch (err) {
        console.warn('[highlight-manager] Range construction error:', err);
      }
    }

    // Move search forward
    searchIdx = matchIdx + 1;
    matchIdx = fullText.indexOf(cleanSearch, searchIdx);
    if (ranges.length > 0) break; // Highlight first best match for this annotation
  }

  return ranges;
}

const HIGHLIGHT_STYLES = `
::highlight(baglib-highlight-amber) {
  background-color: rgba(245, 158, 11, 0.38);
  color: inherit;
}
::highlight(baglib-highlight-emerald) {
  background-color: rgba(16, 185, 129, 0.38);
  color: inherit;
}
::highlight(baglib-highlight-rose) {
  background-color: rgba(244, 63, 94, 0.38);
  color: inherit;
}
::highlight(baglib-highlight-sky) {
  background-color: rgba(14, 165, 233, 0.38);
  color: inherit;
}
::highlight(baglib-highlight-violet) {
  background-color: rgba(139, 92, 246, 0.38);
  color: inherit;
}
::highlight(baglib-underline) {
  text-decoration: underline wavy #f59e0b;
  text-decoration-thickness: 2.5px;
}
::highlight(baglib-active-selection) {
  background-color: rgba(59, 130, 246, 0.35) !important;
  color: inherit !important;
}
::highlight(baglib-tts-active) {
  background-color: rgba(14, 165, 233, 0.28) !important;
  color: inherit !important;
  text-decoration: underline;
  text-decoration-color: rgba(14, 165, 233, 0.75);
  text-decoration-thickness: 2px;
}

mark.baglib-highlight {
  color: inherit !important;
  border-radius: 2px !important;
  padding: 1px 0 !important;
  box-decoration-break: clone !important;
  -webkit-box-decoration-break: clone !important;
  cursor: pointer !important;
}
mark.baglib-highlight-amber, mark.baglib-highlight-yellow {
  background-color: rgba(250, 204, 21, 0.42) !important;
}
mark.baglib-highlight-emerald, mark.baglib-highlight-green {
  background-color: rgba(74, 222, 128, 0.42) !important;
}
mark.baglib-highlight-rose, mark.baglib-highlight-red {
  background-color: rgba(248, 113, 113, 0.42) !important;
}
mark.baglib-highlight-sky, mark.baglib-highlight-blue {
  background-color: rgba(96, 165, 250, 0.42) !important;
}
mark.baglib-highlight-violet, mark.baglib-highlight-purple {
  background-color: rgba(192, 132, 252, 0.42) !important;
}
`;

/**
 * Injects W3C Custom Highlight API styles dynamically into the document.
 * This prevents build-time CSS parsers (PostCSS/Turbopack/LightningCSS) from choking
 * on the ::highlight pseudo-element while providing full runtime styling in Chromium.
 */
export function injectHighlightStyles(doc?: Document): void {
  const targetDoc = doc || (typeof document !== 'undefined' ? document : undefined);
  if (!targetDoc || !targetDoc.head) return;
  if (targetDoc.getElementById('baglib-highlight-styles')) return;
  const styleEl = targetDoc.createElement('style');
  styleEl.id = 'baglib-highlight-styles';
  styleEl.textContent = HIGHLIGHT_STYLES;
  targetDoc.head.appendChild(styleEl);
}

/**
 * Registers annotations into W3C CSS Highlight API registry.
 */
export function registerCssCustomHighlights(container: HTMLElement, annotations: readonly { type?: string; knowledgeType?: string; selectedText?: string | null; quotedText?: string; color?: string | null }[]): void {
  if (!isCustomHighlightSupported()) return;

  const targetDoc = container?.ownerDocument || document;
  injectHighlightStyles(targetDoc);

  const CSSObj = CSS;
  const HighlightClass = (window).Highlight;

  // Group annotations by highlight identifier
  const rangesByGroup: Record<string, Range[]> = {
    'baglib-highlight-amber': [],
    'baglib-highlight-emerald': [],
    'baglib-highlight-rose': [],
    'baglib-highlight-sky': [],
    'baglib-highlight-violet': [],
    'baglib-underline': [],
  };

  for (const annot of annotations) {
    const kType = annot.type || (annot).knowledgeType;
    if (kType !== 'highlight' && kType !== 'underline' && kType !== 'note') continue;
    const text = annot.selectedText || (annot).quotedText;
    if (!text) continue;

    let group = 'baglib-highlight-amber';
    if (kType === 'underline') {
      group = 'baglib-underline';
    } else if (annot.color) {
      if (annot.color.includes('emerald') || annot.color.includes('green') || annot.color === 'emerald') {
        group = 'baglib-highlight-emerald';
      } else if (annot.color.includes('rose') || annot.color.includes('red') || annot.color === 'rose') {
        group = 'baglib-highlight-rose';
      } else if (annot.color.includes('sky') || annot.color.includes('blue') || annot.color === 'sky') {
        group = 'baglib-highlight-sky';
      } else if (annot.color.includes('violet') || annot.color.includes('purple') || annot.color === 'violet') {
        group = 'baglib-highlight-violet';
      }
    }

    const matchedRanges = findRangesForText(container, text);
    rangesByGroup[group].push(...matchedRanges);
  }

  // Set CSS highlights for each group
  for (const [groupName, ranges] of Object.entries(rangesByGroup)) {
    if (ranges.length > 0) {
      const hl = new HighlightClass(...ranges);
      CSSObj.highlights.set(groupName, hl);
    } else {
      CSSObj.highlights.delete(groupName);
    }
  }
}

/**
 * Locks the active transient selection range into the W3C CSS Highlight API.
 * Guarantees text remains visibly highlighted in blue when the mouse is released
 * and even if focus shifts to the floating action menu.
 */
export function setActiveSelectionHighlight(range: Range | null, doc?: Document): void {
  if (!isCustomHighlightSupported()) return;
  const targetDoc = doc || (typeof document !== 'undefined' ? document : undefined);
  if (targetDoc) {
    injectHighlightStyles(targetDoc);
  }

  const CSSObj = CSS as any;
  const HighlightClass = (window as any).Highlight;

  if (range && !range.collapsed) {
    try {
      const hl = new HighlightClass(range);
      CSSObj.highlights?.set?.('baglib-active-selection', hl);
    } catch (err) {
      console.warn('[highlight-manager] setActiveSelectionHighlight error:', err);
    }
  } else {
    CSSObj.highlights?.delete?.('baglib-active-selection');
  }
}

/**
 * Clears the active transient selection highlight.
 * Always purges both W3C CSS Highlights and DOM temporary selection overlays.
 */
export function clearActiveSelectionHighlight(doc?: Document): void {
  removeTempSelectionOverlay(doc);
  if (!isCustomHighlightSupported()) return;
  const CSSObj = CSS as any;
  CSSObj.highlights?.delete?.('baglib-active-selection');
}

export function setActiveTtsHighlight(ranges: Range[], doc?: Document): void {
  if (!isCustomHighlightSupported()) return;
  const targetDoc = doc || (typeof document !== 'undefined' ? document : undefined);
  if (targetDoc) injectHighlightStyles(targetDoc);
  const CSSObj = CSS;
  const HighlightClass = (window).Highlight;
  if (ranges.length > 0) {
    CSSObj.highlights.set('baglib-tts-active', new HighlightClass(...ranges));
  } else {
    CSSObj.highlights.delete('baglib-tts-active');
  }
}

export function clearActiveTtsHighlight(): void {
  if (!isCustomHighlightSupported()) return;
  (CSS).highlights.delete('baglib-tts-active');
}

/**
 * Clears all Baglib highlights from CSS.highlights and removes any lingering selection overlays.
 */
export function clearCssCustomHighlights(): void {
  removeTempSelectionOverlay();
  if (!isCustomHighlightSupported()) return;
  const CSSObj = CSS as any;
  const groups = [
    'baglib-highlight-amber',
    'baglib-highlight-emerald',
    'baglib-highlight-rose',
    'baglib-highlight-sky',
    'baglib-highlight-violet',
    'baglib-underline',
    'baglib-active-selection',
    'baglib-tts-active',
  ];
  for (const g of groups) {
    CSSObj.highlights?.delete?.(g);
  }
}

/**
 * Injects a temporary active-selection overlay (.baglib-temp-selection-overlay)
 * directly over the exact selected client rects. This guarantees selection rects
 * remain visible on mouseup even when focus transfers to the floating toolbar or
 * when an iframe collapses its native Selection.
 *
 * Supports mounting inside a specific reader container (HTMLElement) or Document.
 */
export function renderTempSelectionOverlay(range: Range, docOrContainer?: Document | HTMLElement | null): void {
  let targetDoc: Document | null = null;
  let mountParent: HTMLElement | null = null;

  if (docOrContainer && typeof HTMLElement !== 'undefined' && docOrContainer instanceof HTMLElement) {
    mountParent = docOrContainer;
    targetDoc = docOrContainer.ownerDocument || (typeof document !== 'undefined' ? document : null);
  } else if (docOrContainer && 'body' in (docOrContainer as any)) {
    targetDoc = docOrContainer as Document;
    mountParent = (docOrContainer as Document).body;
  } else {
    targetDoc = range.startContainer?.ownerDocument || (typeof document !== 'undefined' ? document : null);
    mountParent = targetDoc?.body || null;
  }

  if (!targetDoc || !mountParent) return;

  removeTempSelectionOverlay(targetDoc);

  const rects = Array.from(range.getClientRects()).filter((r) => r.width >= 3 && r.height >= 3);
  if (rects.length === 0) return;

  const isBody = mountParent === targetDoc.body;
  const parentRect = isBody ? null : mountParent.getBoundingClientRect();

  const scrollX = isBody
    ? (targetDoc.defaultView?.scrollX || targetDoc.documentElement?.scrollLeft || 0)
    : mountParent.scrollLeft;
  const scrollY = isBody
    ? (targetDoc.defaultView?.scrollY || targetDoc.documentElement?.scrollTop || 0)
    : mountParent.scrollTop;

  const overlayContainer = targetDoc.createElement('div');
  overlayContainer.className = 'baglib-temp-selection-overlay';
  overlayContainer.setAttribute('data-baglib-overlay', 'selection');
  overlayContainer.style.cssText =
    'position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; z-index: 9999;';

  rects.forEach((r) => {
    const left = isBody ? r.left + scrollX : (parentRect ? r.left - parentRect.left + scrollX : r.left + scrollX);
    const top = isBody ? r.top + scrollY : (parentRect ? r.top - parentRect.top + scrollY : r.top + scrollY);

    const rectDiv = targetDoc!.createElement('div');
    rectDiv.className = 'baglib-temp-selection-rect';
    rectDiv.style.cssText = `position: absolute; left: ${left}px; top: ${top}px; width: ${r.width}px; height: ${r.height}px; background: rgba(59, 130, 246, 0.32); pointer-events: none; mix-blend-mode: multiply; border-radius: 2px;`;
    overlayContainer.appendChild(rectDiv);
  });

  mountParent.appendChild(overlayContainer);
}

/**
 * Removes any active .baglib-temp-selection-overlay from the document and all accessible iframes.
 */
export function removeTempSelectionOverlay(doc?: Document): void {
  const docs: Document[] = [];
  if (typeof document !== 'undefined') docs.push(document);
  if (doc && !docs.includes(doc)) docs.push(doc);

  if (typeof document !== 'undefined') {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach((iframe) => {
      try {
        if (iframe.contentDocument && !docs.includes(iframe.contentDocument)) {
          docs.push(iframe.contentDocument);
        }
      } catch {}
    });
  }

  docs.forEach((d) => {
    try {
      const existingOverlays = d.querySelectorAll('.baglib-temp-selection-overlay, [data-baglib-overlay="selection"]');
      existingOverlays.forEach((el) => el.remove());
      const existingRects = d.querySelectorAll('.baglib-temp-selection-rect');
      existingRects.forEach((el) => el.remove());
    } catch {}
  });
}
