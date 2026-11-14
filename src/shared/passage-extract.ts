import { normalizeArabicText } from './utils/text-normalizer';
export interface Passage { text: string; start: number; end: number }
/** Return whole paragraphs when short, otherwise whole matching sentences. Never clip a sentence. */
export function extractPassages(text: string, query: string, options: { limit?: number; maxLength?: number } = {}): Passage[] {
  const limit = Math.max(1, Math.floor(options.limit ?? 20));
  const maxLength = Math.max(1, options.maxLength ?? 1200);
  const normalize = (value: string) => normalizeArabicText(value, { normalizeTaaMarbuta: false });
  const terms = normalize(query).trim().split(/\s+/u).filter(Boolean);
  if (!terms.length) return [];
  const found: Passage[] = [];
  for (const paragraph of text.matchAll(/[^\r\n]+(?:\r?\n(?!\s*\r?\n)[^\r\n]+)*/gu)) {
    const chunks = paragraph[0].length <= maxLength ? [{ 0: paragraph[0], index: 0 }] : [...paragraph[0].matchAll(/[^.!?\u061f\u06d4]+(?:[.!?\u061f\u06d4]+|$)/gu)];
    for (const chunk of chunks) {
      const raw = chunk[0], trimmed = raw.trim();
      if (!trimmed || !terms.every(term => normalize(trimmed).includes(term))) continue;
      const start = paragraph.index! + chunk.index! + raw.indexOf(trimmed);
      found.push({ text: trimmed, start, end: start + trimmed.length });
      if (found.length >= limit) return found;
    }
  }
  return found;
}
