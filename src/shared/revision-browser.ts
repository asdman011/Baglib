/**
 * KEY-395: Revision Browser & Deck Manager shared types, FSRS retrievability calculation,
 * filtered-deck query builder, and saved-search settings persistence (no new DB table).
 */
import type { CardSourceKind } from './types/knowledge-cards';

export const REVISION_SAVED_SEARCHES_SETTING = 'revision.savedSearches.v1';

export const REVISION_SOURCE_FILTERS = [
  'all',
  'sunnah',
  'narrators',
  'poetry',
  'book',
  'note',
  'lexicon',
  'person',
  'tafsir',
  'quran',
] as const;
export type RevisionSourceFilter = typeof REVISION_SOURCE_FILTERS[number];

export const REVISION_SORT_FIELDS = [
  'due',
  'retrievability',
  'difficulty',
  'lapses',
  'created',
  'source',
] as const;
export type RevisionSortBy = typeof REVISION_SORT_FIELDS[number];
export type RevisionSortDir = 'asc' | 'desc';

export type RevisionStateFilter = 'all' | 'new' | 'learning' | 'review' | 'relearning' | 'suspended';

export interface RevisionBrowseQuery {
  search?: string;
  sourceType?: RevisionSourceFilter;
  deckId?: string | null;
  science?: string | null;
  listIds?: string[];
  listMatch?: 'any' | 'all';
  state?: RevisionStateFilter;
  sortBy?: RevisionSortBy;
  sortDir?: RevisionSortDir;
  limit?: number;
  offset?: number;
}

export interface RevisionCardRow {
  id: string;
  front: string;
  back: string;
  sourceKind: CardSourceKind;
  sourceRef: string | null;
  sourceLabel: string | null;
  createdAt: string;
  dueAt: string | null;
  state: string | null;
  stability: number | null;
  difficulty: number | null;
  lapses: number;
  reps: number;
  retrievability: number | null;
  deckIds: string[];
  deckNames: string[];
  tags: string[];
  sciences: string[];
}

export interface RevisionScienceFacet {
  id: string;
  label: string;
  kind: 'category' | 'tag';
}

export interface RevisionListFacet {
  id: string;
  name: string;
}

export interface RevisionBrowseResult {
  items: RevisionCardRow[];
  total: number;
  facets: {
    sciences: RevisionScienceFacet[];
    lists: RevisionListFacet[];
  };
}

export interface SavedRevisionSearch {
  id: string;
  name: string;
  query: RevisionBrowseQuery;
  createdAt: string;
}

export type RevisionBulkAction =
  | { action: 'suspend'; cardIds: string[] }
  | { action: 'unsuspend'; cardIds: string[] }
  | { action: 'reschedule'; cardIds: string[]; days: number }
  | { action: 'moveDeck'; cardIds: string[]; deckId: string }
  | { action: 'tag'; cardIds: string[]; tag: string }
  | { action: 'delete'; cardIds: string[]; confirmed: boolean };

export interface RevisionBulkResult {
  affected: number;
}

/**
 * Computes FSRS-style retrievability R = (1 + (19/81) * t / S)^(-0.5) in [0, 1].
 * Returns null if stability is missing or non-positive.
 */
export function computeRetrievability(
  stability: number | null | undefined,
  lastReviewAt: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!stability || !Number.isFinite(stability) || stability <= 0) return null;
  if (!lastReviewAt) return null;
  const lastMs = Date.parse(lastReviewAt);
  if (!Number.isFinite(lastMs)) return null;
  const elapsedDays = Math.max(0, (nowMs - lastMs) / 86_400_000);
  const r = Math.pow(1 + (19 / 81) * (elapsedDays / stability), -0.5);
  return Math.max(0, Math.min(1, r));
}

export function parseSavedSearches(raw: unknown): SavedRevisionSearch[] {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: SavedRevisionSearch[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== 'string' || !rec.id.trim()) continue;
    if (typeof rec.name !== 'string' || !rec.name.trim()) continue;
    if (!rec.query || typeof rec.query !== 'object' || Array.isArray(rec.query)) continue;
    out.push({
      id: rec.id,
      name: rec.name.trim().slice(0, 120),
      query: rec.query as RevisionBrowseQuery,
      createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : new Date(0).toISOString(),
    });
    if (out.length >= 100) break;
  }
  return out;
}

/**
 * Translates a browser query into a `filter_search` string compatible with `DeckRepository.createFilteredDeck`.
 */
export function buildFilteredDeckSearch(query: RevisionBrowseQuery): string {
  const tokens: string[] = [];
  if (query.search && query.search.trim()) {
    tokens.push(query.search.trim());
  }
  if (query.sourceType && query.sourceType !== 'all') {
    const map: Record<Exclude<RevisionSourceFilter, 'all'>, string> = {
      sunnah: 'source:hadith',
      narrators: 'narrator:',
      poetry: 'source:poetry',
      book: 'source:book',
      note: 'source:note',
      lexicon: 'source:term',
      person: 'source:person',
      tafsir: 'tafsir:',
      quran: 'source:quran',
    };
    tokens.push(map[query.sourceType]);
  }
  if (query.state && query.state !== 'all') {
    if (query.state === 'suspended') tokens.push('is:suspended');
    else if (query.state === 'new') tokens.push('is:new');
    else tokens.push('is:due');
  }
  if (query.science && query.science.startsWith('tag:')) {
    tokens.push(`tag:${query.science.slice(4)}`);
  }
  return tokens.join(' ').trim() || 'is:due';
}
