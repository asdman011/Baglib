import { normalizeArabicText } from './utils/text-normalizer';

export type CompareKind = 'same' | 'changed' | 'missing' | 'extra';
export interface ComparePiece { kind: CompareKind; ocr?: string; reference?: string }
export interface CompareResult { pieces: ComparePiece[]; same: number; changed: number; missing: number; extra: number; truncated: boolean }

const MAX_WORDS = 4000;
// ة and ه, and ى and ي, stay apart: a difference there is often a real reading error.
const key = (word: string) => normalizeArabicText(word, { normalizeTaaMarbuta: false, normalizeAlefMaksura: false }).replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
const words = (text: string) => text.split(/\s+/u).filter(word => key(word));

/**
 * Word alignment of OCR output against a reference such as Shamela text. Marks, tatweel and
 * punctuation are ignored when matching; both texts are returned as written.
 */
export function compareTexts(ocr: string, reference: string): CompareResult {
  const allOcr = words(ocr), allReference = words(reference);
  const truncated = allOcr.length > MAX_WORDS || allReference.length > MAX_WORDS;
  const first = allOcr.slice(0, MAX_WORDS), second = allReference.slice(0, MAX_WORDS);
  const a = first.map(key), b = second.map(key);
  const width = b.length + 1;
  const table = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const pieces: ComparePiece[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { pieces.push({ kind: 'same', ocr: first[i++], reference: second[j++] }); continue; }
    const skipOcr = i < a.length ? table[(i + 1) * width + j] : -1;
    const skipReference = j < b.length ? table[i * width + j + 1] : -1;
    if (i < a.length && j < b.length && skipOcr === skipReference) pieces.push({ kind: 'changed', ocr: first[i++], reference: second[j++] });
    else if (skipOcr >= skipReference) pieces.push({ kind: 'extra', ocr: first[i++] });
    else pieces.push({ kind: 'missing', reference: second[j++] });
  }
  const count = (kind: CompareKind) => pieces.filter(piece => piece.kind === kind).length;
  return { pieces, same: count('same'), changed: count('changed'), missing: count('missing'), extra: count('extra'), truncated };
}
