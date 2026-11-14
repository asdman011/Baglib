import { normalizeArabicText } from './utils/text-normalizer';

/** The scopes offered in the composer's slash menu. */
export type SlashScope = 'quran' | 'sunnah' | 'albayan' | 'notes' | 'books' | 'lectures';

/** Scope order used for grouping and for showing all scopes. */
export const SLASH_SCOPES: readonly SlashScope[] = ['quran', 'sunnah', 'albayan', 'notes', 'books', 'lectures'];

/** Names and aliases that select each scope; both languages work in either interface language. */
const SCOPE_TERMS: Record<SlashScope, readonly string[]> = {
  quran: ['quran', 'قرآن', 'قران', 'القرآن'],
  sunnah: ['sunnah', 'سنة', 'السنة', 'حديث'],
  albayan: ['albayan', 'البيان', 'شعر', 'bayan'],
  notes: ['notes', 'ملاحظات', 'note'],
  books: ['books', 'كتب', 'book'],
  lectures: ['lectures', 'محاضرات', 'lecture'],
};

/** Uses established Arabic search normalization without conflating taa marbuta and haa. */
const fold = (value: string) => normalizeArabicText(value, { normalizeTaaMarbuta: false }).toLowerCase();

/** The active `/` token before the caret, or `null` when the caret is not in one. */
export function parseSlashCommand(textBeforeCaret: string): null | { start: number; scope: SlashScope | null; query: string; partialScope: string } {
  let start = -1;
  for (let index = textBeforeCaret.length - 1; index >= 0; index--) {
    const char = textBeforeCaret[index];
    if (char === '\n' || char === '\r') return null;
    if (char === '/' && (index === 0 || /\s/u.test(textBeforeCaret[index - 1]))) {
      start = index;
      break;
    }
  }
  if (start === -1) return null;

  const after = textBeforeCaret.slice(start + 1);
  const space = after.search(/\s/u);
  const firstWord = space === -1 ? after : after.slice(0, space);
  const rest = space === -1 ? '' : after.slice(space + 1);

  const foldedWord = fold(firstWord);
  for (const scope of SLASH_SCOPES) {
    if (SCOPE_TERMS[scope].some(term => fold(term) === foldedWord)) {
      return { start, scope, query: rest.trimStart(), partialScope: '' };
    }
  }

  if (space === -1 && firstWord) {
    return { start, scope: null, query: firstWord, partialScope: firstWord };
  }

  return { start, scope: null, query: after, partialScope: '' };
}

/** Scopes whose name or an alias starts with what has been typed so far. */
export function suggestScopes(partial: string): SlashScope[] {
  const needle = fold(partial);
  if (!needle) return [...SLASH_SCOPES];
  return SLASH_SCOPES.filter(scope => SCOPE_TERMS[scope].some(term => fold(term).startsWith(needle)));
}

/** Groups results by scope in menu order, best score first, capped per scope. */
export function groupSlashResults<T extends { scope: SlashScope; score: number }>(results: T[], perScope: number): { scope: SlashScope; items: T[] }[] {
  return SLASH_SCOPES.flatMap(scope => {
    const items = results
      .map((result, index) => ({ result, index }))
      .filter(entry => entry.result.scope === scope)
      .sort((left, right) => right.result.score - left.result.score || left.index - right.index)
      .slice(0, Math.max(0, perScope))
      .map(entry => entry.result);
    return items.length ? [{ scope, items }] : [];
  });
}

/** Moves a list selection with wrapping, so Up on the first item lands on the last. */
export function moveSelection(index: number, delta: number, count: number): number {
  if (count <= 0) return -1;
  return (((index + delta) % count) + count) % count;
}
