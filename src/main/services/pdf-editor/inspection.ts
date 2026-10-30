import { readFile } from 'node:fs/promises';
import type { PdfInspection, PdfInspectedPage, PdfTextBlock } from '../../../shared/types/pdf-editor';
import { translations } from '../../../renderer/translations';

export const htmlEscape = (text: string) => text.replace(/[&<>"']/gu, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

export function inspectionHtml(inspection: PdfInspection, language: 'ar' | 'en'): string {
  const labels = translations[language];
  return `<!doctype html><html lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${htmlEscape(labels.pdfSuiteTitle)}</title><style>body{max-width:64rem;margin:auto;padding:2rem;font-family:system-ui,sans-serif;line-height:2}section{border-block-end:1px solid #ccc;padding-block:1rem}p{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><main>${inspection.pages.map(page => `<section id="page-${page.page}" data-page="${page.page}"><h2>${htmlEscape(labels.page)} ${page.page}</h2><p dir="auto">${htmlEscape(page.text)}</p></section>`).join('')}</main></body></html>`;
}

export async function inspectPdfFile(filename: string, password: string | undefined, progress: (current: number, total: number) => void, selectedPages?: number[]): Promise<PdfInspection> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = pdfjs.getDocument({ data: new Uint8Array(await readFile(filename)), password, isEvalSupported: false, enableXfa: false, useSystemFonts: false, verbosity: 0 });
  try {
    const document = await loading.promise;
    if (document.numPages > 10000) throw new Error('invalid-source');
    if (selectedPages && (!selectedPages.length || selectedPages.length > 200 || selectedPages.some(number => !Number.isInteger(number) || number < 1 || number > document.numPages))) throw new Error('invalid-request');
    const pageNumbers = selectedPages ?? Array.from({ length: Math.min(document.numPages, 200) }, (_, index) => index + 1);
    const permissions = await document.getPermissions();
    // PDF.js permission bit 16 permits ordinary extraction; bit 512 is accessibility.
    if (permissions && !permissions.includes(pdfjs.PermissionFlag.COPY)) throw new Error('permission-denied');
    const fields = await document.getFieldObjects();
    const signatureFields = Object.values(fields || {}).flat().filter(field => 'type' in field && field.type === 'signature').length;
    const pages: PdfInspectedPage[] = [];
    let characters = 0;
    let limited = false;
    for (const number of pageNumbers) {
      const page = await document.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const blocks: PdfTextBlock[] = [];
      const text: string[] = [];
      let previous: { x: number; y: number; width: number; height: number; end: boolean } | undefined;
      for (const item of content.items) {
        if (!('str' in item)) continue;
        if (characters + item.str.length > 2_000_000) { limited = true; break; }
        characters += item.str.length;
        const bounds = viewport.convertToViewportRectangle([item.transform[4], item.transform[5], item.transform[4] + item.width, item.transform[5] + item.height]);
        blocks.push({ text: item.str, x: Math.min(bounds[0], bounds[2]), y: Math.min(bounds[1], bounds[3]), width: Math.abs(bounds[2] - bounds[0]), height: Math.abs(bounds[3] - bounds[1]), direction: item.dir === 'rtl' ? 'rtl' : 'ltr' });
        const position = { x: item.transform[4], y: item.transform[5], width: item.width, height: item.height, end: item.hasEOL };
        if (previous && text.length) {
          const lineChanged = previous.end || Math.abs(position.y - previous.y) > Math.max(position.height, previous.height) * 0.5;
          const gap = position.x >= previous.x ? position.x - previous.x - previous.width : previous.x - position.x - position.width;
          if (lineChanged) text.push('\n');
          else if (gap > Math.max(position.height, previous.height) * 0.16 && !/\s$/u.test(text.at(-1) || '') && !/^\s/u.test(item.str)) text.push(' ');
        }
        text.push(item.str); previous = position;
      }
      pages.push({ page: number, width: viewport.width, height: viewport.height, rotation: page.rotate, text: text.join('').trim(), blocks });
      page.cleanup(); progress(pages.length, pageNumbers.length);
      if (limited || characters >= 2_000_000) break;
    }
    return { pages, totalPages: document.numPages, signatureFields, signatureValidation: 'not-performed', extraction: pages.length === document.numPages && !limited && characters < 2_000_000 ? 'complete' : 'limited', permissions };
  } catch (error) {
    if ((error as Error).name === 'PasswordException') throw new Error('encrypted');
    throw error;
  } finally { await loading.destroy(); }
}
