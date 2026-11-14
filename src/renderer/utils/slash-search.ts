import { groupSlashResults, SLASH_SCOPES, type SlashScope } from '../../shared/slash-command';
import { bookStudyTarget, matchesStudyQuery, studyLinkText, type StudyNote } from '../../shared/study-notes';
import type { CorpusKind, CorpusOption } from './corpus-lookup';

export interface SlashResult { scope: SlashScope; target: string; label: string; snippet: string; score: number }
export interface SlashBook { id: string; title: string; author?: string; sourceId?: string; workType?: string }
export interface SlashSearchInput {
  scope: SlashScope | null; query: string; notes: StudyNote[]; books: SlashBook[];
  searchCorpus?: (kinds: CorpusKind[], query: string) => Promise<CorpusOption[]>;
  stale?: () => boolean;
}
const corpusScopes = { quran: 'quran', hadith: 'sunnah', poem: 'albayan' } as const;
const mediaTypes = new Set(['lecture', 'podcast', 'video']);
/** Canonical names stay untouched. Matching uses the same conservative Arabic rules as note search. */
export async function searchSlashDatasets({ scope, query, notes, books, searchCorpus, stale = () => false }: SlashSearchInput): Promise<SlashResult[]> {
  const text = query.trim().slice(0, 200);
  const scopes = scope ? [scope] : SLASH_SCOPES;
  const results: SlashResult[] = [];
  const score = (title: string) => text && matchesStudyQuery(title, text) ? 10 : 0;
  if (scopes.includes('notes')) for (const note of notes) {
    if (!matchesStudyQuery(`${note.title} ${note.content} ${note.aliases.join(' ')} ${note.tags.join(' ')}`, text)) continue;
    results.push({ scope: 'notes', target: `note:${note.id}`, label: note.title || note.content.slice(0, 70), snippet: note.content.slice(0, 120), score: score(note.title) });
  }
  for (const book of books) {
    const dataset = mediaTypes.has(book.workType || '') ? 'lectures' : 'books';
    if (!scopes.includes(dataset) || !matchesStudyQuery(`${book.title} ${book.author || ''}`, text)) continue;
    results.push({ scope: dataset, target: bookStudyTarget(book), label: book.title, snippet: book.author || '', score: score(book.title) });
  }
  const kinds = (Object.keys(corpusScopes) as CorpusKind[]).filter(kind => scopes.includes(corpusScopes[kind]));
  if (text && kinds.length && searchCorpus && !stale()) {
    const found = await searchCorpus(kinds, text).catch(() => []);
    if (stale()) return [];
    for (const item of found) results.push({ scope: corpusScopes[item.kind], target: item.target, label: item.label, snippet: item.snippet, score: score(item.label) });
  }
  return groupSlashResults(results.filter(item => !!studyLinkText(item.target, item.label)), scope ? 8 : 3).flatMap(group => group.items);
}
export const slashResultLink = (item: SlashResult) => studyLinkText(item.target, item.label);
