import type { EpubChapterInput } from '../../../shared/types/web-clipper';
import type { FormattedPage } from './epub-paginator';

/** Joins the reader's screen pages back into one chapter per book section. */
export function chaptersFromPages(pages: FormattedPage[]): EpubChapterInput[] {
  const chapters = new Map<number, EpubChapterInput>();
  for (const page of pages) {
    const chapter = chapters.get(page.sectionIndex);
    if (chapter) chapter.contentHtml += `\n${page.html}`;
    else chapters.set(page.sectionIndex, { title: page.chapterLabel, contentHtml: page.html, index: chapters.size + 1 });
  }
  return [...chapters.values()];
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Book images live at blob: URLs only this page can read, so they travel to the renderer as data URLs. */
export async function inlineBlobImages(html: string): Promise<string> {
  const urls = [...new Set(html.match(/blob:[^"'\s)]+/gu) ?? [])];
  let result = html;
  for (const url of urls) {
    const dataUrl = await fetch(url).then(response => response.blob()).then(readAsDataUrl).catch(() => null);
    if (dataUrl) result = result.split(url).join(dataUrl);
  }
  return result;
}
