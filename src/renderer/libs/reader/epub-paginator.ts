/**
 * Multi-Format & EPUB Paginator Engine
 * 
 * Solves the single-scroll chapter problem by transforming raw EPUB spine chapters 
 * into screen-sized, paginated book pages (~1,200 - 1,800 characters per page).
 * Preserves HTML formatting, images, headings, and maps Table of Contents to exact page numbers.
 */

import type { BookDoc, SectionItem, TOCItem } from './types';

export interface FormattedPage {
  pageNumber: number; // 1-indexed overall book page number
  sectionIndex: number;
  sectionId: string;
  chapterLabel: string;
  html: string;
  text: string;
}

export interface PaginatedBookResult {
  pages: FormattedPage[];
  tocMap: Map<string | number, number>; // Maps TOC item ID or href to target pageNumber
  sectionStartPages: number[]; // Maps sectionIndex to starting pageNumber
}

/**
 * Splits long paragraphs into balanced chunks at natural sentence boundaries.
 */
function splitLongParagraph(pHtml: string, pText: string, maxChars = 1500): Array<{ html: string; text: string }> {
  if (pText.length <= maxChars) {
    return [{ html: pHtml, text: pText }];
  }

  // Split on Arabic and Latin sentence endings (period, question mark, exclamation, or Arabic comma)
  const sentences = pText.split(/(?<=[.!?؟،]\s+)/g);
  const chunks: Array<{ html: string; text: string }> = [];
  let curText = '';

  for (const sentence of sentences) {
    if (curText.length + sentence.length > maxChars && curText.length > 0) {
      chunks.push({
        html: `<p class="indent-4 leading-relaxed">${curText.trim()}</p>`,
        text: curText.trim(),
      });
      curText = '';
    }
    curText += sentence;
  }

  if (curText.trim().length > 0) {
    chunks.push({
      html: `<p class="indent-4 leading-relaxed">${curText.trim()}</p>`,
      text: curText.trim(),
    });
  }

  return chunks.length > 0 ? chunks : [{ html: pHtml, text: pText }];
}

/**
 * Parses section HTML or plain text into discrete block units.
 */
export function extractContentBlocks(htmlOrText: string): Array<{ tag: string; html: string; text: string }> {
  const isHtml = /<[a-z][\s\S]*>/i.test(htmlOrText);

  if (!isHtml) {
    // Plain text: split by double newlines into paragraphs
    const rawParagraphs = htmlOrText.split(/\n\s*\n+/).filter((p) => p.trim().length > 0);
    const blocks: Array<{ tag: string; html: string; text: string }> = [];

    for (const p of rawParagraphs) {
      const trimmed = p.trim();
      if (trimmed.length > 1800) {
        const subChunks = splitLongParagraph(`<p>${trimmed}</p>`, trimmed, 1400);
        for (const sub of subChunks) {
          blocks.push({ tag: 'p', html: sub.html, text: sub.text });
        }
      } else {
        blocks.push({
          tag: 'p',
          html: `<p class="indent-4 leading-relaxed">${trimmed}</p>`,
          text: trimmed,
        });
      }
    }
    return blocks;
  }

  // HTML content: extract major block-level elements
  const blockRegex = /<(h[1-6]|p|blockquote|figure|table|ul|ol|pre|div|section)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>|<(img|hr)(?:\s+[^>]*)?\/?>/gi;
  const blocks: Array<{ tag: string; html: string; text: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(htmlOrText)) !== null) {
    const fullTag = match[0];
    const tagName = (match[1] || match[3] || 'div').toLowerCase();
    const innerContent = match[2] || '';
    const cleanText = innerContent.replace(/<[^>]+>/g, '').trim();

    // If a paragraph is unusually long, split it into smaller paragraph blocks
    if (tagName === 'p' && cleanText.length > 1800) {
      const subChunks = splitLongParagraph(fullTag, cleanText, 1400);
      for (const sub of subChunks) {
        blocks.push({ tag: 'p', html: sub.html, text: sub.text });
      }
    } else {
      blocks.push({
        tag: tagName,
        html: fullTag,
        text: cleanText,
      });
    }
  }

  // Fallback if regex matched no blocks (e.g. unformatted body or unusual markup)
  if (blocks.length === 0 && htmlOrText.trim().length > 0) {
    const cleanText = htmlOrText.replace(/<[^>]+>/g, '').trim();
    blocks.push({
      tag: 'div',
      html: `<div class="leading-relaxed">${htmlOrText}</div>`,
      text: cleanText,
    });
  }

  return blocks;
}

/**
 * Paginates an array of BookDoc sections into screen-sized pages.
 * 
 * @param sections List of SectionItem from DocumentLoader
 * @param toc Optional Table of Contents
 * @param targetCharsPerPage Target character count per page (default: 1500 chars)
 */
export async function paginateBookSections(
  sections: SectionItem[],
  toc?: TOCItem[],
  targetCharsPerPage = 1500
): Promise<PaginatedBookResult> {
  const pages: FormattedPage[] = [];
  const sectionStartPages: number[] = [];
  const tocMap = new Map<string | number, number>();

  let overallPageNumber = 1;

  for (let secIdx = 0; secIdx < sections.length; secIdx++) {
    const section = sections[secIdx];
    sectionStartPages.push(overallPageNumber);

    // Determine chapter label from TOC or section ID
    let chapterLabel = `Chapter ${secIdx + 1}`;
    if (toc) {
      const matchedTOC = toc.find(
        (t) => t.index === secIdx || (t.href && t.href.includes(section.id))
      );
      if (matchedTOC?.label) {
        chapterLabel = matchedTOC.label;
      }
    }

    // Load section content
    let rawContent = '';
    if (section.createDocument) {
      try {
        const doc = await section.createDocument();
        rawContent = doc.body?.innerHTML || '';
      } catch (e) {
        console.warn(`[paginator] Error creating doc for section ${section.id}:`, e);
      }
    }
    if (!rawContent && section.loadText) {
      try {
        rawContent = (await section.loadText()) || '';
      } catch (e) {
        console.warn(`[paginator] Error loading text for section ${section.id}:`, e);
      }
    }

    if (!rawContent || rawContent.trim().length === 0) {
      // Empty section: create single blank page
      pages.push({
        pageNumber: overallPageNumber++,
        sectionIndex: secIdx,
        sectionId: section.id,
        chapterLabel,
        html: `<div class="py-8 text-center text-muted italic font-serif">~ ${chapterLabel} ~</div>`,
        text: chapterLabel,
      });
      continue;
    }

    const blocks = extractContentBlocks(rawContent);
    let curBlocks: Array<{ tag: string; html: string; text: string }> = [];
    let curChars = 0;

    for (const block of blocks) {
      const isMajorHeading = block.tag === 'h1' || block.tag === 'h2';

      // Start a new page if:
      // 1. Encountering a major heading and we already have content on this page
      // 2. Accumulated character count exceeds target and current page is not empty
      if (
        (isMajorHeading && curChars > 250) ||
        (curChars + block.text.length > targetCharsPerPage && curBlocks.length > 0)
      ) {
        pages.push({
          pageNumber: overallPageNumber++,
          sectionIndex: secIdx,
          sectionId: section.id,
          chapterLabel,
          html: curBlocks.map((b) => b.html).join('\n'),
          text: curBlocks.map((b) => b.text).join('\n\n'),
        });
        curBlocks = [];
        curChars = 0;
      }

      curBlocks.push(block);
      curChars += block.text.length;
    }

    // Flush remaining blocks for this section
    if (curBlocks.length > 0) {
      pages.push({
        pageNumber: overallPageNumber++,
        sectionIndex: secIdx,
        sectionId: section.id,
        chapterLabel,
        html: curBlocks.map((b) => b.html).join('\n'),
        text: curBlocks.map((b) => b.text).join('\n\n'),
      });
    }
  }

  // Ensure at least 1 page exists
  if (pages.length === 0) {
    pages.push({
      pageNumber: 1,
      sectionIndex: 0,
      sectionId: 'sec_0',
      chapterLabel: 'Document',
      html: '',
      text: '',
    });
  }

  // Map Table of Contents to target page numbers
  if (toc && toc.length > 0) {
    for (const item of toc) {
      let targetPage = 1;
      if (typeof item.index === 'number' && item.index >= 0 && item.index < sectionStartPages.length) {
        targetPage = sectionStartPages[item.index];
      } else if (item.href) {
        // Try matching href to section ID
        const matchedSecIdx = sections.findIndex(
          (s) => item.href.includes(s.id) || s.id.includes(item.href)
        );
        if (matchedSecIdx !== -1) {
          targetPage = sectionStartPages[matchedSecIdx];
        }
      }
      tocMap.set(item.id, targetPage);
      if (item.href) {
        tocMap.set(item.href, targetPage);
      }
    }
  }

  return {
    pages,
    tocMap,
    sectionStartPages,
  };
}
