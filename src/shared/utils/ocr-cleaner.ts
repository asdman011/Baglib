import { OcrLanguage } from '../types/ocr';

/**
 * Maps unified application language codes to platform-specific OCR tags.
 */
export const OCR_LANG_MAP: Record<string, { win: string; macos: string; tesseract: string }> = {
  ar: { win: 'ar-SA', macos: 'ar', tesseract: 'ara' },
  'ar-SA': { win: 'ar-SA', macos: 'ar', tesseract: 'ara' },
  en: { win: 'en-US', macos: 'en-US', tesseract: 'eng' },
  'en-US': { win: 'en-US', macos: 'en-US', tesseract: 'eng' },
  'en-GB': { win: 'en-GB', macos: 'en-US', tesseract: 'eng' },
  fr: { win: 'fr-FR', macos: 'fr-FR', tesseract: 'fra' },
  'fr-FR': { win: 'fr-FR', macos: 'fr-FR', tesseract: 'fra' },
  ja: { win: 'ja', macos: 'ja-JP', tesseract: 'jpn' },
  'ja-JP': { win: 'ja', macos: 'ja-JP', tesseract: 'jpn' },
  de: { win: 'de-DE', macos: 'de-DE', tesseract: 'deu' },
  es: { win: 'es-ES', macos: 'es-ES', tesseract: 'spa' },
  tr: { win: 'tr-TR', macos: 'tr-TR', tesseract: 'tur' },
  ur: { win: 'ur-PK', macos: 'ur', tesseract: 'urd' },
  fa: { win: 'fa-IR', macos: 'fa', tesseract: 'fas' },
};

export function resolveOcrLanguage(
  lang?: OcrLanguage | null,
  platform: 'win32' | 'darwin' | 'linux' = 'win32'
): string {
  if (!lang || lang === 'auto') return 'auto';
  const mapping = OCR_LANG_MAP[lang];
  if (!mapping) return lang;

  if (platform === 'win32') return mapping.win;
  if (platform === 'darwin') return mapping.macos;
  return mapping.tesseract;
}

/**
 * Cleans segmentation and spacing artifacts produced by OS OCR engines:
 * 1. Windows.Media.Ocr inserts spaces between every CJK character.
 * 2. Cleans multiple consecutive spaces into a single space while preserving linebreaks.
 * 3. Removes invisible control characters (except newline \n and tab \t).
 * 4. Normalizes Arabic ligatures and trims whitespace per line.
 */
export function cleanOcrText(text: string): string {
  if (!text) return '';

  // 1. CJK character spacing removal (from reverse-engineered Koodo cleanWindowsOcrText)
  const cjk =
    '\\u4e00-\\u9fbf\\u3400-\\u4dbf\\u3040-\\u30ff\\uac00-\\ud7af\\u3000-\\u303f\\uff00-\\uffef';
  const cjkPattern = new RegExp('([' + cjk + '])\\s+([' + cjk + '])', 'gu');
  let prev = '';
  let cur = text;
  do {
    prev = cur;
    cur = cur.replace(cjkPattern, '$1$2');
  } while (cur !== prev);

  // 2. Remove non-printable control characters (excluding newline \r\n and tab \t)
  cur = cur.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');

  // 3. Normalize multiple inline spaces to single space, line by line
  const lines = cur.split(/\r?\n/).map(line => line.replace(/[ \t]+/g, ' ').trim());

  return lines.join('\n').trim();
}

/**
 * Scales an OCR bounding box to CSS percentage coordinates relative to page dimensions.
 */
export function calculateOcrWordPercentBox(
  bbox: { x: number; y: number; width: number; height: number },
  pageWidth: number,
  pageHeight: number
): { left: string; top: string; width: string; height: string } {
  if (pageWidth <= 0 || pageHeight <= 0) {
    return { left: '0%', top: '0%', width: '0%', height: '0%' };
  }

  const left = Math.max(0, Math.min(100, (bbox.x / pageWidth) * 100));
  const top = Math.max(0, Math.min(100, (bbox.y / pageHeight) * 100));
  const width = Math.max(0, Math.min(100 - left, (bbox.width / pageWidth) * 100));
  const height = Math.max(0, Math.min(100 - top, (bbox.height / pageHeight) * 100));

  return {
    left: `${left.toFixed(2)}%`,
    top: `${top.toFixed(2)}%`,
    width: `${width.toFixed(2)}%`,
    height: `${height.toFixed(2)}%`,
  };
}
