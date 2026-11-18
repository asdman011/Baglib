/**
 * Baglib — dictionary lookup features (KEY-414): multi-word search, prefix suggestions, the user's
 * dictionary order, lookup history and the Reading pad (with Qasidah layout). Pure helpers shared
 * by the main process and the renderer; nothing here touches storage.
 */

export const DICTIONARY_ORDER_SETTING = 'dictionary.order.v1';
export const DICTIONARY_HISTORY_SETTING = 'dictionary.history.v1';
export const DICTIONARY_PAD_SETTING = 'dictionary.readingPad.v1';

export const MAX_LOOKUP_WORDS = 12;
export const MAX_LOOKUP_WORD_LENGTH = 64;
export const MAX_SUGGESTIONS = 10;
export const MAX_HISTORY = 100;
export const MAX_PAD_TEXT = 50_000;
export const MAX_PAD_HIGHLIGHTS = 500;

export const OPEN_DICTIONARY_EVENT = 'baglib:open-dictionary';
export const OPEN_READING_PAD_EVENT = 'baglib:open-reading-pad';

/** Splits typed or pasted text into lookup words (spaces, commas, semicolons, new lines), unique, at most 12. */
export function splitLookupWords(text: unknown): string[] {
  if (typeof text !== 'string') return [];
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of text.split(/[\s,،;؛]+/u)) {
    const word = raw.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '').slice(0, MAX_LOOKUP_WORD_LENGTH);
    const key = suggestionKey(word);
    if (!word || seen.has(key)) continue;
    seen.add(key);
    words.push(word);
    if (words.length === MAX_LOOKUP_WORDS) break;
  }
  return words;
}

/**
 * The comparison form for suggestions (AGENTS.md Arabic search rules): tashkeel and tatweel removed,
 * alef forms unified, final ى read as ي, Latin lower-cased. ة and ه stay apart, to avoid false matches.
 */
export function suggestionKey(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/gu, '')
    .replace(/[أإآٱ]/gu, 'ا')
    .replace(/ى/gu, 'ي')
    .toLowerCase()
    .trim();
}

/** Sorts items by the user's order (a list of ids). Ids not in the order keep their place, after the ordered ones. */
export function applyDictionaryOrder<T extends { id: string }>(items: readonly T[], order: readonly string[]): T[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (rank.get(a.item.id) ?? order.length + a.index) - (rank.get(b.item.id) ?? order.length + b.index))
    .map(({ item }) => item);
}

/** A stored order, cleaned: strings only, unique, at most 500 ids. */
export function cleanDictionaryOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200))].slice(0, 500);
}

export interface LookupHistoryEntry {
  word: string;
  /** ISO time of the lookup. */
  at: string;
  /** Title of the dictionary that answered first, if any. */
  dictionary?: string;
}

/** A stored history, cleaned: valid entries only, newest first, at most 100. */
export function cleanHistory(value: unknown): LookupHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const out: LookupHistoryEntry[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const word = typeof entry.word === 'string' ? entry.word.trim().slice(0, MAX_LOOKUP_WORD_LENGTH) : '';
    const at = typeof entry.at === 'string' && !Number.isNaN(Date.parse(entry.at)) ? entry.at : '';
    if (!word || !at || seen.has(suggestionKey(word))) continue;
    seen.add(suggestionKey(word));
    out.push({ word, at, ...(typeof entry.dictionary === 'string' && entry.dictionary ? { dictionary: entry.dictionary.slice(0, 200) } : {}) });
    if (out.length === MAX_HISTORY) break;
  }
  return out;
}

/** Adds a lookup at the top; looking the same word up again moves it up instead of repeating it. */
export function addToHistory(history: readonly LookupHistoryEntry[], entry: LookupHistoryEntry): LookupHistoryEntry[] {
  const key = suggestionKey(entry.word);
  return cleanHistory([entry, ...history.filter(item => suggestionKey(item.word) !== key)]);
}

export function removeFromHistory(history: readonly LookupHistoryEntry[], word: string): LookupHistoryEntry[] {
  const key = suggestionKey(word);
  return history.filter(item => suggestionKey(item.word) !== key);
}

export interface ReadingPadState {
  text: string;
  /** Highlighted words, in their suggestion form, so every occurrence is marked. */
  highlights: string[];
}

export function cleanPad(value: unknown): ReadingPadState {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const text = typeof raw.text === 'string' ? raw.text.slice(0, MAX_PAD_TEXT) : '';
  const highlights = Array.isArray(raw.highlights)
    ? [...new Set(raw.highlights.filter((w): w is string => typeof w === 'string').map(w => suggestionKey(w)).filter(w => w && w.length <= MAX_LOOKUP_WORD_LENGTH))].slice(0, MAX_PAD_HIGHLIGHTS)
    : [];
  return { text, highlights };
}

export function toggleHighlight(state: ReadingPadState, word: string): ReadingPadState {
  const key = suggestionKey(word);
  if (!key) return state;
  const highlights = state.highlights.includes(key) ? state.highlights.filter(w => w !== key) : [...state.highlights, key];
  return cleanPad({ ...state, highlights });
}

/**
 * A verse line split into its two hemistichs (sadr and ajuz), or null when the line isn't one.
 * Separators: a tab, three or more spaces, an asterisk, or an ellipsis (… or ...).
 */
export function splitHemistichs(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  for (const separator of [/\t+/u, / {3,}| {3,}/u, /\s*\*+\s*/u, /\s*(?:…|\.{3})\s*/u]) {
    const match = separator.exec(trimmed);
    if (!match || match.index === 0) continue;
    const sadr = trimmed.slice(0, match.index).trim();
    const ajuz = trimmed.slice(match.index + match[0].length).trim();
    if (sadr && ajuz) return [sadr, ajuz];
  }
  return null;
}

export type PadLine = { kind: 'verse'; sadr: string; ajuz: string } | { kind: 'text'; text: string } | { kind: 'blank' };

/** The pad's lines; `qasidah` is true when most non-empty lines are verses of two hemistichs. */
export function layoutPad(text: string): { lines: PadLine[]; qasidah: boolean } {
  const lines: PadLine[] = text.split(/\r?\n/u).map(line => {
    if (!line.trim()) return { kind: 'blank' };
    const verse = splitHemistichs(line);
    return verse ? { kind: 'verse', sadr: verse[0], ajuz: verse[1] } : { kind: 'text', text: line.trim() };
  });
  const filled = lines.filter(line => line.kind !== 'blank');
  const verses = filled.filter(line => line.kind === 'verse').length;
  return { lines, qasidah: filled.length > 0 && verses * 2 >= filled.length };
}

/** Splits a line into word and non-word pieces, so each word can be clicked. */
export function padTokens(text: string): { text: string; word: boolean }[] {
  const out: { text: string; word: boolean }[] = [];
  const pattern = /[\p{L}\p{M}\p{N}ـ]+(?:['’][\p{L}\p{M}]+)*/gu;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > last) out.push({ text: text.slice(last, match.index), word: false });
    out.push({ text: match[0], word: true });
    last = match.index! + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), word: false });
  return out;
}

/** Revision cards take at most 10,000 characters of meaning; long lexicon entries are cut at a word, with "…". */
export const MAX_REVISION_MEANING = 4000;
export function revisionMeaning(text: string): string {
  const clean = text.replace(/\s+/gu, ' ').trim();
  if (clean.length <= MAX_REVISION_MEANING) return clean;
  const cut = clean.slice(0, MAX_REVISION_MEANING);
  const space = cut.lastIndexOf(' ');
  return `${(space > MAX_REVISION_MEANING * 0.8 ? cut.slice(0, space) : cut).trim()} …`;
}
