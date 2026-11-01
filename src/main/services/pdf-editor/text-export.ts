import { translations } from '../../../renderer/translations';
import { htmlEscape } from './inspection';

const pagesOf = (text: string) => text.split('\f').map(page => page.replace(/\r\n?/gu, '\n').trim()).filter(Boolean);
const paragraphsOf = (page: string) => page.split(/\n\s*\n/u).map(part => part.trim()).filter(Boolean);

/** Reflows plain extracted text, for machines without the engine's pdftohtml dependency. */
export function textToHtml(text: string, language: 'ar' | 'en'): string {
  const title = htmlEscape(translations[language].pdfSuiteTitle);
  const sections = pagesOf(text).map(page => `<section>${paragraphsOf(page).map(part => `<p dir="auto">${htmlEscape(part)}</p>`).join('')}</section>`).join('');
  return `<!doctype html><html lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${title}</title><style>body{max-width:64rem;margin:auto;padding:2rem;font-family:system-ui,sans-serif;line-height:2}section{border-block-end:1px solid #ccc;padding-block:1rem}p{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><main>${sections}</main></body></html>`;
}

/** On image-only pages the engine's Markdown holds nothing but one placeholder per image. */
export const markdownHasText = (markdown: string) => markdown.replace(/<image redacted:[^>]*>/gu, '').trim().length > 0;

export function textToMarkdown(text: string): string {
  return `${pagesOf(text).map(page => paragraphsOf(page).join('\n\n')).join('\n\n---\n\n')}\n`;
}
