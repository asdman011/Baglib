export type PoetryLanguage = 'ar' | 'en';
export type PoetryLayout = 'bayt' | 'free_verse' | 'stanza';
export type PoetryPanel = 'filters' | 'poet' | 'search' | 'typography' | 'saved' | 'narration' | null;

export function normalizeArabicForSearch(value: string): string {
  return value.replace(/[\u064B-\u065F\u0670\u0640]/gu, '').replace(/[أإآٱ]/gu, 'ا').replace(/ة/gu, 'ه').replace(/ى/gu, 'ي').toLowerCase().replace(/\s+/gu, ' ').trim();
}

export function poetryDisplayText(value: string, showDiacritics: boolean): string {
  return showDiacritics ? value : value.replace(/[\u064B-\u065F\u0670]/gu, '');
}

export function poetryHighlightedParts(text: string, query: string): { text: string; matched: boolean }[] {
  const tokens = new Set(normalizeArabicForSearch(query).match(/[\p{L}\p{N}_]+/gu) ?? []);
  return text.split(/([\p{L}\p{N}\p{M}_]+)/gu).filter(Boolean).map(part => ({ text: part, matched: tokens.has(normalizeArabicForSearch(part)) }));
}

export function poetrySearchExcerpt(verses: readonly string[], layout: PoetryLayout, query: string): { from: number; lines: string[] } | null {
  const tokens = new Set(normalizeArabicForSearch(query).match(/[\p{L}\p{N}_]+/gu) ?? []);
  if (!tokens.size) return null;
  const step = layout === 'bayt' ? 2 : 1;
  let best = -1, bestScore = 0;
  for (let from = 0; from < verses.length; from += step) {
    const words = new Set(normalizeArabicForSearch(verses.slice(from, from + step).join(' ')).match(/[\p{L}\p{N}_]+/gu) ?? []);
    const score = [...tokens].filter(token => words.has(token)).length;
    if (score > bestScore) { best = from; bestScore = score; }
    if (score === tokens.size) break;
  }
  return best < 0 ? null : { from: best, lines: verses.slice(best, best + step) };
}

export function classifyPoetryLayout(language: PoetryLanguage, meter: string | null, verses: readonly string[]): PoetryLayout {
  if (language === 'en') return 'stanza';
  const normalized = normalizeArabicForSearch(meter || '');
  if (/تفعيله|شعر حر|نثر/gu.test(normalized)) return 'free_verse';
  const lengths = verses.map(line => normalizeArabicForSearch(line.replace(/\[\/?[A-Za-z][^\]]*\]/gu, '').replace(/<[^>]*>/gu, '')).replace(/\s/gu, '').length).filter(length => length > 0).sort((left, right) => left - right);
  if (lengths.length >= 4) {
    const lower = lengths[Math.floor(lengths.length / 4)];
    const upper = lengths[Math.floor(lengths.length * 3 / 4)];
    if (upper >= 16 && upper > lower * 3) return 'free_verse';
  }
  if (normalized.startsWith('بحر ') && verses.length > 0 && verses.length % 2 === 0) return 'bayt';
  return 'free_verse';
}

export function poetryBayts(verses: readonly string[]): { index: number; sadr: string; ajuz: string | null }[] {
  const result: { index: number; sadr: string; ajuz: string | null }[] = [];
  for (let index = 0; index < verses.length; index += 2) result.push({ index: index / 2, sadr: verses[index], ajuz: verses[index + 1] ?? null });
  return result;
}

export function togglePoetryPanel(current: PoetryPanel, requested: Exclude<PoetryPanel, null>): PoetryPanel {
  return current === requested ? null : requested;
}

export function poetryDescriptionText(value: unknown): string {
  if (typeof value === 'string') return value.replace(/&(?:nbsp|#160|#x0*a0);/giu, '\u00a0');
  if (Array.isArray(value)) return value.map(poetryDescriptionText).filter(Boolean).join('\n');
  if (!value || typeof value !== 'object') return '';
  const node = value as Record<string, unknown>;
  return ['text', 'partA', 'partB', 'children'].map(key => poetryDescriptionText(node[key])).filter(Boolean).join('\n');
}
