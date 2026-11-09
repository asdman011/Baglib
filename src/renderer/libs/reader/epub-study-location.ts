import { buildEpubCfi } from '../../../shared/epub-marks';
import type { FormattedPage } from './epub-paginator';

const compact = (text: string) => text.replace(/\s/gu, '');

function pageLength(page: FormattedPage): number {
  const root = document.createElement('div');
  root.innerHTML = page.html;
  return compact(root.textContent ?? '').length;
}

/** BagLib's reflow adapter anchors section-wide text offsets, independent of screen pagination. */
export function selectionStudyLocation(pages: FormattedPage[], range: Range, page: number): { cfi: string; chapter: string } {
  const element = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as Element
    : range.startContainer.parentElement;
  const root = element?.closest<HTMLElement>('[data-study-epub-page]');
  if (!root || !root.contains(range.endContainer)) throw new Error('invalid-selection');
  const current = pages[Number(root.dataset.studyEpubPage ?? page) - 1];
  if (!current) throw new Error('invalid-selection');

  const prefix = range.cloneRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(range.startContainer, range.startOffset);
  const precedingLength = pages
    .filter(p => p.sectionIndex === current.sectionIndex && p.pageNumber < current.pageNumber)
    .reduce((total, p) => total + pageLength(p), 0);
  const offset = precedingLength + compact(prefix.toString()).length;
  return {
    cfi: buildEpubCfi(current.sectionIndex, offset, offset + compact(range.toString()).length),
    chapter: current.chapterLabel,
  };
}

export function resolveStudyCfi(pages: FormattedPage[], cfi: string): { page: number; start: number; end: number } | null {
  const match = /^epubcfi\(\/6\/(\d+)(?:\[[^\]]*\])?!\/4\/2(?:\/1:(\d+)|,\/1:(\d+),\/1:(\d+))\)$/u.exec(cfi);
  if (!match) return null;
  const section = Number(match[1]) / 2 - 1;
  let start = Number(match[2] ?? match[3]);
  const length = Number(match[4] ?? start) - start;
  for (const page of pages.filter(p => p.sectionIndex === section)) {
    const size = pageLength(page);
    if (start < size || start === 0) return { page: page.pageNumber, start, end: start + length };
    start -= size;
  }
  return null;
}

export function revealStudyRange(root: HTMLElement, start: number, end: number): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let offset = 0;
  let found = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    for (let i = 0; i < text.length; i++) {
      if (/\s/u.test(text[i])) continue;
      if (offset === start) {
        range.setStart(node, i);
        found = true;
      }
      offset++;
      if (offset === end && found) {
        range.setEnd(node, i + 1);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        node.parentElement?.scrollIntoView({ block: 'center' });
        root.dataset.studyPassage = 'true';
        return;
      }
    }
  }
}
