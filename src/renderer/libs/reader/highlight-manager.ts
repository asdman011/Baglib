/**
 * W3C CSS Custom Highlight API Manager (Readest Non-Destructive Highlighting Pattern)
 *
 * Implements non-destructive text highlighting using `CSS.highlights.set()`.
 * Crucial for Arabic typography: does NOT wrap text nodes in intrusive <span> elements,
 * completely preventing ligature breakage, letter disconnection, and diacritic clipping.
 */

import type { AnnotationDTO } from '../../../shared/types/annotation';

export const HIGHLIGHT_COLORS = [
  { id: 'amber', label: 'Amber', hex: '#f59e0b', cssClass: 'baglib-highlight-amber' },
  { id: 'emerald', label: 'Emerald', hex: '#10b981', cssClass: 'baglib-highlight-emerald' },
  { id: 'rose', label: 'Rose', hex: '#f43f5e', cssClass: 'baglib-highlight-rose' },
  { id: 'sky', label: 'Sky', hex: '#0ea5e9', cssClass: 'baglib-highlight-sky' },
  { id: 'violet', label: 'Violet', hex: '#8b5cf6', cssClass: 'baglib-highlight-violet' },
];

export function isCustomHighlightSupported(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof (window as any).Highlight !== 'undefined';
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
    let startNodeInfo = nodeOffsetMap.find((m) => matchIdx >= m.startInFull && matchIdx < m.endInFull);
    let endNodeInfo = nodeOffsetMap.find((m) => matchEnd > m.startInFull && matchEnd <= m.endInFull);

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
`;

/**
 * Injects W3C Custom Highlight API styles dynamically into the document.
 * This prevents build-time CSS parsers (PostCSS/Turbopack/LightningCSS) from choking
 * on the ::highlight pseudo-element while providing full runtime styling in Chromium.
 */
export function injectHighlightStyles(doc: Document = document): void {
  if (typeof doc === 'undefined' || !doc.head) return;
  if (doc.getElementById('baglib-highlight-styles')) return;
  const styleEl = doc.createElement('style');
  styleEl.id = 'baglib-highlight-styles';
  styleEl.textContent = HIGHLIGHT_STYLES;
  doc.head.appendChild(styleEl);
}

/**
 * Registers annotations into W3C CSS Highlight API registry.
 */
export function registerCssCustomHighlights(container: HTMLElement, annotations: AnnotationDTO[]): void {
  if (!isCustomHighlightSupported()) return;

  const targetDoc = container?.ownerDocument || document;
  injectHighlightStyles(targetDoc);

  const CSSObj = CSS as any;
  const HighlightClass = (window as any).Highlight;

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
    if (annot.type !== 'highlight' && annot.type !== 'underline' && annot.type !== 'note') continue;
    if (!annot.selectedText) continue;

    let group = 'baglib-highlight-amber';
    if (annot.type === 'underline') {
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

    const matchedRanges = findRangesForText(container, annot.selectedText);
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
 * Clears all Baglib highlights from CSS.highlights
 */
export function clearCssCustomHighlights(): void {
  if (!isCustomHighlightSupported()) return;
  const CSSObj = CSS as any;
  const groups = [
    'baglib-highlight-amber',
    'baglib-highlight-emerald',
    'baglib-highlight-rose',
    'baglib-highlight-sky',
    'baglib-highlight-violet',
    'baglib-underline',
  ];
  for (const g of groups) {
    CSSObj.highlights.delete(g);
  }
}
