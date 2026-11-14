import { SLASH_SCOPES, type SlashScope } from '../../shared/slash-command';
import { bookStudyTarget, studyLinkText, type StudyNote } from '../../shared/study-notes';
import { normalizeArabicText } from '../../shared/utils/text-normalizer';
import type { CorpusKind, CorpusOption, CorpusSearchOptions } from './corpus-lookup';

export interface SlashResult { scope: SlashScope; target: string; label: string; snippet: string; score: number; quote?: string; cursor?: number; material?: SlashBook }
export interface SlashBook { id: string; title: string; author?: string; sourceId?: string; workType?: string; filePath?: string; digitalFormat?: string }
export interface SlashSearchInput {
  scope: SlashScope | null; query: string; notes: StudyNote[]; books: SlashBook[];
  searchCorpus?: (kinds: CorpusKind[], query: string, options?: CorpusSearchOptions) => Promise<CorpusOption[]>;
  stale?: () => boolean; limit?: number; offset?: number; after?: number; requestId?: string;
}
const corpusScopes = { quran: 'quran', hadith: 'sunnah', poem: 'albayan' } as const;
const mediaTypes = new Set(['lecture', 'podcast', 'video']);
const normalize = (text: string) => normalizeArabicText(text, { normalizeTaaMarbuta: false });
const cached = new WeakMap<object, { title: string; body: string }>();
const yieldInput = () => new Promise<void>(resolve => setTimeout(resolve, 0));
/** Cached normalized text, bounded result buffers and yielding scans keep large local collections responsive. */
export async function searchSlashDatasets({ scope, query, notes, books, searchCorpus, stale = () => false, limit = scope ? 20 : 8, offset = 0, after, requestId }: SlashSearchInput): Promise<SlashResult[]> {
  const text = query.trim().slice(0, 200);
  if (text && text.length < 3 && !/^\d[:\d-]+$/u.test(text)) return [];
  const terms = normalize(text).split(/\s+/u).filter(Boolean);
  const matches = (value: string) => terms.every(term => value.includes(term));
  const scopes = scope ? [scope] : SLASH_SCOPES;
  const results: SlashResult[] = [];
  for (const dataset of scopes) {
    if (stale()) return [];
    if (dataset !== 'notes' && dataset !== 'books' && dataset !== 'lectures') continue;
    const top: SlashResult[] = [], other: SlashResult[] = [];
    const source = dataset === 'notes' ? notes : books;
    for (let i = 0; i < source.length; i++) {
      if (i % 32 === 0) { await yieldInput(); if (stale()) return []; }
      const item = source[i];
      const note: StudyNote | undefined = dataset === 'notes' ? item as StudyNote : undefined;
      const book: SlashBook | undefined = note ? undefined : item as SlashBook;
      if (book && (mediaTypes.has(book.workType || '') ? 'lectures' : 'books') !== dataset) continue;
      let index = cached.get(item);
      if (!index) {
        index = { title: normalize(item.title), body: normalize(note ? [note.content, ...note.aliases, ...note.tags].join(' ') : book!.author || '') };
        cached.set(item, index);
      }
      const titleMatch = matches(index.title);
      const bucket = titleMatch ? top : other;
      if (bucket.length >= offset + limit || !titleMatch && !matches(index.title + ' ' + index.body)) continue;
      bucket.push({ scope: dataset, target: note ? `note:${note.id}` : bookStudyTarget(book!), label: item.title || note?.content.slice(0, 70) || '', snippet: note ? note.content.slice(0, 120) : book!.author || '', score: titleMatch ? 10 : 0, ...(book ? { material: book } : {}) });
    }
    results.push(...[...top, ...other].slice(offset, offset + limit));
  }
  const kinds = (Object.keys(corpusScopes) as CorpusKind[]).filter(kind => scopes.includes(corpusScopes[kind]));
  if (text && kinds.length && searchCorpus && !stale()) {
    const found = await searchCorpus(kinds, text, { limit, offset, after, requestId, stale }).catch(() => []);
    if (stale()) return [];
    for (const item of found) results.push({ scope: corpusScopes[item.kind], target: item.target, label: item.label, snippet: item.snippet, score: 0, quote: item.quote, cursor: item.cursor });
  }
  return SLASH_SCOPES.flatMap(dataset => results.filter(item => item.scope === dataset && !!studyLinkText(item.target, item.label)).slice(0, limit));
}
export const slashResultLink = (item: SlashResult) => studyLinkText(item.target, item.label);
export const slashResultInsert = (item: SlashResult) => item.quote || slashResultLink(item);
