import { SLASH_SCOPES, type SlashScope } from '../../shared/slash-command';
import { bookCfiTarget, bookStudyTarget, studyLinkText, type StudyNote } from '../../shared/study-notes';
import { normalizeArabicText } from '../../shared/utils/text-normalizer';
import { extractPassages } from '../../shared/passage-extract';
import { lectureTarget } from './lecture-navigation';
import { quotePassage } from './slash-material';
import type { LibraryFtsResult } from '../../shared/types/full-text-search';
import type { DictionaryEntryMatch, PersonSearchItem, WikipediaSearchResult } from '../../shared/types/dictionary';
import type { CorpusKind, CorpusOption, CorpusSearchOptions } from './corpus-lookup';

export interface SlashResult {
  scope: SlashScope;
  target: string;
  label: string;
  snippet: string;
  score: number;
  quote?: string;
  cursor?: number;
  material?: SlashBook;
  groupLabel?: string;
  role?: 'scholar' | 'narrator';
  offline?: boolean;
}
export interface SlashBook { id: string; title: string; author?: string; sourceId?: string; workType?: string; filePath?: string; digitalFormat?: string }
export interface SlashSearchInput {
  scope: SlashScope | null; query: string; notes: StudyNote[]; books: SlashBook[];
  searchCorpus?: (kinds: CorpusKind[], query: string, options?: CorpusSearchOptions) => Promise<CorpusOption[]>;
  searchLibraryContent?: (query: string, options?: { bookId?: string; scope?: SlashScope; limit?: number; offset?: number; requestId?: string; stale?: () => boolean }) => Promise<LibraryFtsResult[]>;
  searchDictionary?: (query: string) => Promise<DictionaryEntryMatch[]>;
  searchPeople?: (query: string) => Promise<PersonSearchItem[]>;
  searchWikipedia?: (query: string, lang: 'ar' | 'en') => Promise<WikipediaSearchResult>;
  lang?: 'ar' | 'en';
  wikiLang?: 'ar' | 'en';
  stale?: () => boolean; limit?: number; offset?: number; after?: number; requestId?: string;
  isnadScope?: 'all' | 'matn_only';
  unsplitNotice?: string;
}

export function defaultWikipediaLang(query: string, uiLang?: 'ar' | 'en'): 'ar' | 'en' {
  if (/[\u0600-\u06FF]/u.test(query)) return 'ar';
  return uiLang === 'ar' ? 'ar' : 'en';
}

export function formatDictionaryQuote(dictTitle: string, headword: string, definitionText: string): string {
  const cleanBody = definitionText.replace(/\r?\n/gu, '\n').trim();
  const lines = cleanBody.split('\n').map(line => `> ${line.trim()}`).filter(line => line !== '>');
  const source = [dictTitle.trim(), headword.trim()].filter(Boolean).join(': ');
  if (!lines.length) return `> — ${source}`;
  return `${lines.join('\n')}\n> — ${source}`;
}

export function formatWikipediaQuote(title: string, summary: string, url: string): string {
  const cleanTitle = title.trim();
  const cleanSummary = summary.replace(/\s+/gu, ' ').trim();
  const lines = [`> **${cleanTitle}**`];
  if (cleanSummary) lines.push(`> ${cleanSummary}`);
  lines.push(`> [${cleanTitle}](${url})`);
  return lines.join('\n');
}
const corpusScopes = { quran: 'quran', hadith: 'sunnah', poem: 'albayan' } as const;
const mediaTypes = new Set(['lecture', 'podcast', 'video']);
const normalize = (text: string) => normalizeArabicText(text, { normalizeTaaMarbuta: false });
const cached = new WeakMap<object, { title: string; body: string }>();
const yieldInput = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const matchTerm = (val: string, term: string) => {
  if (val.includes(term)) return true;
  if (term.startsWith('ال') && term.length >= 5 && val.includes(term.slice(2))) return true;
  if (term.length >= 4 && (term.startsWith('و') || term.startsWith('ب') || term.startsWith('ف') || term.startsWith('ل') || term.startsWith('ك')) && val.includes(term.slice(1))) return true;
  return false;
};
/** Cached normalized text, bounded result buffers and yielding scans keep large local collections responsive. */
export async function searchSlashDatasets({ scope, query, notes, books, searchCorpus, searchLibraryContent, searchDictionary, searchPeople, searchWikipedia, lang, wikiLang, stale = () => false, limit = scope ? 20 : 8, offset = 0, after, requestId, isnadScope, unsplitNotice }: SlashSearchInput): Promise<SlashResult[]> {
  const text = query.trim().slice(0, 200);
  if (text && text.length < 3 && !/^\d[:\d-]+$/u.test(text) && scope !== 'dictionary' && scope !== 'people' && scope !== 'wikipedia') return [];
  const terms = normalize(text).split(/\s+/u).filter(Boolean);
  const normQ = normalize(text);
  const matches = (value: string) => terms.every(term => matchTerm(value, term));
  const scopes = scope ? [scope] : SLASH_SCOPES;
  const results: SlashResult[] = [];
  for (const dataset of scopes) {
    if (stale()) return [];
    if (dataset !== 'notes' && dataset !== 'books' && dataset !== 'lectures') continue;
    const candidates: (SlashResult & { rankScore: number; originalIndex: number })[] = [];
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
      const titleMatch = !normQ || matches(index.title);
      const bodyMatch = !normQ || matches(index.title + ' ' + index.body);
      if (!titleMatch && !bodyMatch) continue;
      let rankScore = 0;
      if (normQ) {
        if (index.title === normQ) rankScore += 1500;
        else if (index.title.startsWith(normQ)) rankScore += 1000;
        else if (normQ.length >= 3 && index.title.includes(normQ)) rankScore += 800;
        else if (note && note.aliases.some(a => normalize(a) === normQ)) rankScore += 700;
        else if (normQ.length >= 3 && index.body.includes(normQ)) rankScore += 400;
        if (terms.every(t => index.title.includes(t))) rankScore += 300;
        else if (titleMatch) rankScore += 200;
        else rankScore += 100;
        rankScore += Math.max(0, 50 - Math.abs(index.title.length - normQ.length));
      }
      candidates.push({ scope: dataset, target: note ? `note:${note.id}` : bookStudyTarget(book!), label: item.title || note?.content.slice(0, 70) || '', snippet: note ? note.content.slice(0, 120) : book!.author || '', score: titleMatch ? 10 : 0, rankScore, originalIndex: i, ...(book ? { material: book } : {}) });
    }
    if (normQ) {
      candidates.sort((a, b) => b.rankScore - a.rankScore || a.originalIndex - b.originalIndex);
    }
    if (dataset === 'notes') {
      results.push(...candidates.slice(offset, offset + limit));
      continue;
    }
    // Library content search across whole library, grouped by material
    const contentHits: (SlashResult & { rankScore: number; originalIndex: number })[] = [];
    if (normQ.length >= 3) {
      const searchFn = searchLibraryContent || (
        typeof window !== 'undefined' && window.electronAPI?.searchLibraryFullText
          ? (q: string, opts: unknown) => window.electronAPI.searchLibraryFullText(q, opts) as Promise<LibraryFtsResult[]>
          : undefined
      );
      if (searchFn) {
        try {
          const rawHits = await searchFn(text, { scope: dataset, limit, offset, requestId, stale });
          if (stale()) return [];
          for (let i = 0; i < (rawHits || []).length; i++) {
            const hit = rawHits[i];
            const hitBook = books.find(b => b.id === hit.bookId) || { id: hit.bookId, title: hit.bookTitle || 'Material', author: hit.bookAuthor, workType: hit.workType };
            if (hitBook && (mediaTypes.has(hitBook.workType || '') ? 'lectures' : 'books') !== dataset) continue;
            const passages = extractPassages(hit.content || hit.snippet, text, { limit: 1 });
            const passageText = passages[0]?.text || hit.snippet;
            const isLecture = dataset === 'lectures' || hit.workType === 'lecture' || ['lecture', 'video', 'podcast'].includes(hitBook.workType || '');
            const target = isLecture
              ? lectureTarget(hit.bookId, hit.pageNumber)
              : (hit.locationCfiOrPage.startsWith('epubcfi(') ? bookCfiTarget(hitBook, hit.locationCfiOrPage) : bookStudyTarget(hitBook, hit.pageNumber));
            const suffix = isLecture ? hit.locationCfiOrPage : String(hit.pageNumber);
            const label = hitBook.title + ' · ' + suffix;
            const quote = quotePassage(passageText, target, label);
            contentHits.push({
              scope: dataset,
              target,
              label,
              snippet: passageText.slice(0, 160),
              score: 0,
              rankScore: 500 - (hit.rank || 0),
              quote,
              material: hitBook,
              originalIndex: 1000 + i,
            });
          }
        } catch { /* cancelled */ }
      }
    }
    const materialOrder: string[] = [];
    const materialGroups = new Map<string, (SlashResult & { rankScore: number; originalIndex: number })[]>();
    for (const cand of candidates.slice(offset, offset + limit)) {
      const mid = cand.material?.id || cand.target;
      if (!materialGroups.has(mid)) {
        materialGroups.set(mid, []);
        materialOrder.push(mid);
      }
      materialGroups.get(mid)!.push(cand);
    }
    for (const hit of contentHits) {
      const mid = hit.material?.id || hit.target;
      if (!materialGroups.has(mid)) {
        materialGroups.set(mid, []);
        materialOrder.push(mid);
      }
      materialGroups.get(mid)!.push(hit);
    }
    const grouped: (SlashResult & { rankScore: number; originalIndex: number })[] = [];
    for (const mid of materialOrder) {
      grouped.push(...materialGroups.get(mid)!);
    }
    results.push(...grouped.slice(0, limit));
  }
  const kinds = (Object.keys(corpusScopes) as CorpusKind[]).filter(kind => scopes.includes(corpusScopes[kind]));
  if (text && kinds.length && searchCorpus && !stale()) {
    const found = await searchCorpus(kinds, text, { limit, offset, after, requestId, isnadScope, unsplitNotice, stale }).catch(() => []);
    if (stale()) return [];
    for (const item of found) results.push({ scope: corpusScopes[item.kind], target: item.target, label: item.label, snippet: item.snippet, score: 0, quote: item.quote, cursor: item.cursor });
  }
  if (text && scopes.includes('dictionary') && !stale()) {
    const lookupEntries = searchDictionary
      ? await searchDictionary(text).catch(() => [])
      : typeof window !== 'undefined' && window.electronAPI?.dictionaryLookup
        ? (await window.electronAPI.dictionaryLookup(text, { lang, includeWikipedia: false }).catch(() => null))?.entries ?? []
        : [];
    if (stale()) return [];
    const groupedByDict = new Map<string, DictionaryEntryMatch[]>();
    for (const entry of lookupEntries) {
      const key = entry.dictTitle || entry.dictId;
      if (!groupedByDict.has(key)) groupedByDict.set(key, []);
      groupedByDict.get(key)!.push(entry);
    }
    for (const [dictName, dictEntries] of groupedByDict) {
      for (const entry of dictEntries) {
        results.push({
          scope: 'dictionary',
          groupLabel: dictName,
          target: `dictionary:${entry.dictId}:${entry.headword}`,
          label: entry.headword,
          snippet: entry.definitionText.slice(0, 160),
          score: 0,
          quote: formatDictionaryQuote(dictName, entry.headword, entry.definitionText),
        });
      }
    }
  }
  if ((scope === 'people' || (text && scopes.includes('people'))) && !stale()) {
    const people = searchPeople
      ? await searchPeople(text).catch(() => [])
      : typeof window !== 'undefined' && window.electronAPI?.peopleSearch
        ? await window.electronAPI.peopleSearch(text, limit).then(res => (res.ok ? res.data : [])).catch(() => [])
        : [];
    if (stale()) return [];
    for (const person of people) {
      results.push({
        scope: 'people',
        target: person.target,
        label: person.name,
        snippet: person.detail || '',
        role: person.role,
        score: 0,
      });
    }
  }
  // Wikipedia query is sent ONLY after the user explicitly picks the wikipedia scope.
  if (scope === 'wikipedia' && text && !stale()) {
    const targetWikiLang = wikiLang ?? defaultWikipediaLang(text, lang);
    const wikiRes = searchWikipedia
      ? await searchWikipedia(text, targetWikiLang).catch((): WikipediaSearchResult => ({ ok: false, error: 'failed', lang: targetWikiLang, items: [] }))
      : typeof window !== 'undefined' && window.electronAPI?.wikipediaSearch
        ? await window.electronAPI.wikipediaSearch(text, targetWikiLang, limit).catch((): WikipediaSearchResult => ({ ok: false, error: 'failed', lang: targetWikiLang, items: [] }))
        : undefined;
    if (stale()) return [];
    if (wikiRes && !wikiRes.ok && wikiRes.error === 'offline') {
      results.push({ scope: 'wikipedia', target: 'wikipedia:offline', label: '', snippet: '', score: 0, offline: true });
    } else if (wikiRes?.ok) {
      for (const article of wikiRes.items) {
        results.push({
          scope: 'wikipedia',
          target: article.url,
          label: article.title,
          snippet: article.summary.slice(0, 160),
          score: 0,
          quote: formatWikipediaQuote(article.title, article.summary, article.url),
        });
      }
    }
  }
  return SLASH_SCOPES.flatMap(dataset => results.filter(item => item.scope === dataset && (item.offline || ((item.scope === 'dictionary' || item.scope === 'wikipedia') && !!item.quote) || !!studyLinkText(item.target, item.label))).slice(0, limit));
}
export const slashResultLink = (item: SlashResult) => studyLinkText(item.target, item.label);
export const slashResultInsert = (item: SlashResult) => item.quote || slashResultLink(item);
