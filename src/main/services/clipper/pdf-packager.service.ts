import { parseHTML } from 'linkedom';
import type { ClippedArticle, ClippedImage, EpubChapterInput } from '../../../shared/types/web-clipper';
import { renderHtmlToPdf } from '../pdf-editor/weasyprint';

export interface PrintableBookMetadata {
  title: string;
  author?: string;
  language?: string;
  direction?: 'rtl' | 'ltr';
  sourceUrl?: string;
  /** Heading of the contents page, supplied in the interface language. */
  contentsLabel?: string;
}

const REMOVED_ELEMENTS = 'script,style,link,meta,base,iframe,frame,object,embed,video,audio,source,track,form,input,button,select,textarea,noscript,canvas,template,svg';
const KEPT_ATTRIBUTES = new Set(['href', 'src', 'alt', 'title', 'id', 'dir', 'lang', 'colspan', 'rowspan']);
const LANGUAGE_TAG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;

function escapeHtml(value?: string | null): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Keeps the text and structure of web or book markup and drops whatever would change the print layout. */
export function sanitizeForPrint(html: string): string {
  const { document } = parseHTML(`<!doctype html><html><body><div id="print-root">${html}</div></body></html>`);
  const root = document.querySelector('#print-root');
  if (!root) return '';
  root.querySelectorAll(REMOVED_ELEMENTS).forEach(element => element.remove());
  root.querySelectorAll('*').forEach(element => {
    for (const { name } of Array.from(element.attributes)) {
      if (!KEPT_ATTRIBUTES.has(name.toLowerCase())) element.removeAttribute(name);
    }
    const tag = element.tagName.toLowerCase();
    if (tag === 'img') {
      if (!/^data:image\//iu.test(element.getAttribute('src') ?? '')) { element.remove(); return; }
      element.setAttribute('alt', element.getAttribute('alt') ?? '');
    } else {
      element.removeAttribute('src');
    }
    const href = element.getAttribute('href');
    if (href !== null && (tag !== 'a' || !/^(?:https?:|#)/iu.test(href))) element.removeAttribute('href');
  });
  return root.innerHTML;
}

/** Swaps bundled image paths for data URLs, because the renderer loads nothing else. */
export function inlineClippedImages(html: string, images: ClippedImage[]): string {
  if (images.length === 0) return html;
  const { document } = parseHTML(`<!doctype html><html><body><div id="print-root">${html}</div></body></html>`);
  const root = document.querySelector('#print-root');
  if (!root) return html;
  const byPath = new Map(images.map(image => [image.localPath, image]));
  root.querySelectorAll('img').forEach(element => {
    const image = byPath.get(element.getAttribute('src') ?? '');
    if (image) element.setAttribute('src', `data:${image.mimeType};base64,${Buffer.from(image.data).toString('base64')}`);
  });
  return root.innerHTML;
}

function printStyles(isRtl: boolean): string {
  // WeasyPrint's page margin boxes and print layout are written for one known direction, so `start` resolves here.
  const start = isRtl ? 'right' : 'left';
  const fonts = isRtl
    ? '"Noto Naskh Arabic", "Amiri", "Sakkal Majalla", "Traditional Arabic", "Segoe UI", Tahoma, serif'
    : 'Georgia, "Noto Serif", "Times New Roman", "Sakkal Majalla", "Traditional Arabic", serif';
  return `
@page { size: A4; margin: 22mm 20mm 24mm; @bottom-center { content: counter(page); font-size: 9pt; color: #666; } }
@page cover { @bottom-center { content: none; } }
html { font-family: ${fonts}; font-size: 11.5pt; line-height: ${isRtl ? 1.95 : 1.6}; color: #1c1c1c; }
body { margin: 0; text-align: ${start}; }
h1, h2, h3, h4, h5, h6 { line-height: 1.45; break-after: avoid; text-align: ${start}; }
h1 { font-size: 20pt; margin: 0 0 12pt; }
h2 { font-size: 15pt; margin: 18pt 0 8pt; }
h3 { font-size: 12.5pt; margin: 14pt 0 6pt; }
p { margin: 0 0 9pt; orphans: 2; widows: 2; }
img { display: block; max-width: 100%; height: auto; margin: 12pt auto; break-inside: avoid; }
blockquote { margin: 10pt 0; padding-${start}: 12pt; border-${start}: 2.5pt solid #9aa5b1; color: #444; }
pre { white-space: pre-wrap; font-size: 9.5pt; padding: 8pt; background: #f3f4f6; break-inside: avoid; direction: ltr; text-align: left; }
code { font-family: Consolas, "DejaVu Sans Mono", monospace; font-size: 0.9em; }
table { border-collapse: collapse; width: 100%; margin: 10pt 0; }
th, td { border: 0.5pt solid #b6bcc4; padding: 4pt 6pt; text-align: ${start}; vertical-align: top; }
a { color: #1f4e8c; text-decoration: none; }
.cover { page: cover; break-after: page; padding-top: 70mm; text-align: center; }
.book-title { bookmark-level: none; font-size: 28pt; text-align: center; margin-bottom: 16pt; }
.cover p { color: #555; overflow-wrap: anywhere; }
.contents { break-after: page; }
.contents h2 { bookmark-level: none; }
.contents ol { list-style: none; margin: 0; padding: 0; }
.contents li { margin-bottom: 4pt; }
.contents a { color: inherit; }
.contents a::after { content: leader('.') target-counter(attr(href), page); }
.chapter + .chapter { break-before: page; }
.meta { color: #666; font-size: 9.5pt; overflow-wrap: anywhere; }
`;
}

export class PdfPackagerService {
  private static instance: PdfPackagerService;
  private render: (html: string) => Promise<Buffer>;

  constructor(render: (html: string) => Promise<Buffer> = html => renderHtmlToPdf(html)) {
    this.render = render;
  }

  public static getInstance(): PdfPackagerService {
    if (!this.instance) {
      this.instance = new PdfPackagerService();
    }
    return this.instance;
  }

  public packageArticle(article: ClippedArticle, contentHtml: string, images: ClippedImage[] = [], contentsLabel?: string): Promise<Buffer> {
    return this.packageChapters(
      [{ title: article.title, contentHtml: inlineClippedImages(contentHtml, images), index: 1 }],
      { title: article.title, author: article.byline || article.siteName, language: article.language, sourceUrl: article.url, contentsLabel }
    );
  }

  public packageChapters(chapters: EpubChapterInput[], metadata: PrintableBookMetadata): Promise<Buffer> {
    return this.render(this.buildDocument(chapters, metadata));
  }

  public buildDocument(chapters: EpubChapterInput[], metadata: PrintableBookMetadata): string {
    const isRtl = metadata.direction ? metadata.direction === 'rtl' : metadata.language?.toLowerCase().startsWith('ar') || /[؀-ۿ]/.test(metadata.title);
    const lang = metadata.language && LANGUAGE_TAG.test(metadata.language) ? metadata.language : isRtl ? 'ar' : 'en';
    const title = escapeHtml(metadata.title);
    const details = [metadata.author, metadata.sourceUrl].filter(Boolean).map(value => `<p class="meta">${escapeHtml(value)}</p>`).join('');
    const isBook = chapters.length > 1;

    const front = !isBook ? '' : `<section class="cover"><h1 class="book-title">${title}</h1>${details}</section>
<nav class="contents">${metadata.contentsLabel ? `<h2>${escapeHtml(metadata.contentsLabel)}</h2>` : ''}<ol>${chapters
      .map((chapter, index) => `<li><a href="#chapter-${index + 1}">${escapeHtml(chapter.title || String(index + 1))}</a></li>`)
      .join('')}</ol></nav>`;

    const body = chapters.map((chapter, index) => {
      const content = sanitizeForPrint(chapter.contentHtml);
      // Book markup usually opens with its own heading, and repeating it would print the title twice.
      const heading = /^\s*<h[12][\s>]/iu.test(content) ? '' : `<h1>${escapeHtml(chapter.title)}</h1>`;
      return `<article class="chapter" id="chapter-${index + 1}">${heading}${isBook ? '' : details}${content}</article>`;
    }).join('\n');

    return `<!doctype html>
<html lang="${lang}" dir="${isRtl ? 'rtl' : 'ltr'}">
<head><meta charset="utf-8"><title>${title}</title>${metadata.author ? `<meta name="author" content="${escapeHtml(metadata.author)}">` : ''}<style>${printStyles(isRtl)}</style></head>
<body>${front}${body}</body>
</html>`;
  }
}
