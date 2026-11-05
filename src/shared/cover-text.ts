import type { OcrLine } from './types/ocr';

export interface CoverProposal { title: string; author: string; lines: string[] }

const AUTHOR_MARK = /^(?:تأليف|تاليف|بقلم|إعداد|اعداد|للإمام|للامام|للشيخ|للحافظ|للعلامة|by|written by)\s*[:：]?\s*/iu;
// \p{N} also covers Arabic-Indic digits such as a printed year ٢٠٠٣.
const NOISE = /^[\p{P}\p{S}\p{N}\s]*$/u;
const clean = (text: string) => text.replace(/\s+/gu, ' ').trim();

/**
 * Title and author from the lines read off a cover. The title is the largest print, joined with
 * an adjacent line of near the same size. The author follows a marker such as تأليف, otherwise it
 * is the next largest line. This is a proposal: the reader reviews it before anything is saved.
 */
export function proposeFromCover(lines: OcrLine[]): CoverProposal {
  const usable = lines.map(line => ({ ...line, text: clean(line.text) })).filter(line => line.text.length > 1 && !NOISE.test(line.text));
  if (!usable.length) return { title: '', author: '', lines: [] };
  const byTop = [...usable].sort((first, second) => first.bbox.y - second.bbox.y);
  const tallest = Math.max(...usable.map(line => line.bbox.height));
  const start = byTop.findIndex(line => line.bbox.height === tallest);
  const title = [byTop[start]];
  for (let at = start + 1; at < byTop.length && byTop[at].bbox.height >= tallest * 0.8 && byTop[at].bbox.y - (title[title.length - 1].bbox.y + title[title.length - 1].bbox.height) < tallest; at++) title.push(byTop[at]);
  for (let at = start - 1; at >= 0 && byTop[at].bbox.height >= tallest * 0.8 && byTop[at + 1].bbox.y - (byTop[at].bbox.y + byTop[at].bbox.height) < tallest; at--) title.unshift(byTop[at]);
  const rest = byTop.filter(line => !title.includes(line));
  const marked = rest.findIndex(line => AUTHOR_MARK.test(line.text));
  let author = '';
  if (marked >= 0) {
    const after = rest[marked].text.replace(AUTHOR_MARK, '');
    author = after || rest[marked + 1]?.text || '';
  } else if (rest.length) {
    author = [...rest].sort((first, second) => second.bbox.height - first.bbox.height)[0].text;
  }
  return { title: title.map(line => line.text).join(' '), author: clean(author), lines: byTop.map(line => line.text) };
}
