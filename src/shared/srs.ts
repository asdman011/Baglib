import type { KnowledgeCard } from './types/knowledge-cards';

export type ReviewRating = 1 | 2 | 3 | 4;
export type SrsCardState = 'new' | 'learning' | 'review' | 'relearning' | 'suspended';
export type SrsEntryKind = 'learn' | 'review' | 'relearn' | 'filtered' | 'reset' | 'rescheduled';
export type DeckKind = 'normal' | 'filtered';
export type FilteredDeckOrder = 'due' | 'retrievability_asc' | 'lapses_desc' | 'random' | 'added';

export const SRS_ROLLOVER_SETTING_KEY = 'srs.rolloverHour';

export interface SrsPreset {
  id: string;
  name: string;
  learnSteps: number[];
  relearnSteps: number[];
  newPerDay: number;
  reviewsPerDay: number;
  desiredRetention: number;
  maximumInterval: number;
  buryNew: boolean;
  buryReviews: boolean;
  buryInterday: boolean;
  leechThreshold: number;
  leechAction: 'tag' | 'suspend';
  newOrder: 'position' | 'random';
  fsrsParams: number[] | null;
  ankiId: number | null;
  ankiExtra: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveSrsPresetInput {
  id?: string;
  name: string;
  learnSteps?: number[];
  relearnSteps?: number[];
  newPerDay?: number;
  reviewsPerDay?: number;
  desiredRetention?: number;
  maximumInterval?: number;
  buryNew?: boolean;
  buryReviews?: boolean;
  buryInterday?: boolean;
  leechThreshold?: number;
  leechAction?: 'tag' | 'suspend';
  newOrder?: 'position' | 'random';
  fsrsParams?: number[] | null;
}

export interface DeckItem {
  id: string;
  name: string;
  fullName: string;
  parentId: string | null;
  kind: DeckKind;
  presetId: string | null;
  effectivePresetId: string;
  filterSearch: string | null;
  filterLimit: number | null;
  filterOrder: FilteredDeckOrder | string | null;
  filterReschedule: boolean;
  description: string | null;
  ankiId: number | null;
  ankiExtra: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeckTreeNode extends DeckItem {
  cardsCount: number;
  totalCardsCount: number;
  newCount: number;
  learningCount: number;
  dueCount: number;
  buriedCount: number;
  children: DeckTreeNode[];
}

export interface SaveDeckInput {
  id?: string;
  name: string;
  parentId?: string | null;
  presetId?: string | null;
  description?: string | null;
}

export interface SaveFilteredDeckInput {
  id?: string;
  name: string;
  parentId?: string | null;
  filterSearch: string;
  filterLimit?: number;
  filterOrder?: FilteredDeckOrder;
  filterReschedule?: boolean;
  description?: string | null;
}

export interface ReviewCard extends KnowledgeCard {
  revision: string;
  state?: SrsCardState;
  lapses?: number;
  reps?: number;
  learningStep?: number;
  buriedUntil?: string | null;
  deckId?: string | null;
  /** Minutes until the next review for each rating, as the scheduler would set it now. */
  intervals?: Partial<Record<ReviewRating, number>>;
}

export interface LeechAlert {
  cardId: string;
  front: string;
  lapses: number;
  suspended: boolean;
}

export interface ReviewQueue {
  cards: ReviewCard[];
  due: number;
  newCount?: number;
  learningCount?: number;
  dueCount?: number;
  buriedCount?: number;
  reviewedToday: number;
  nextDue: string | null;
  deckId?: string | null;
  deckName?: string | null;
  isFiltered?: boolean;
  filterReschedule?: boolean;
  leechAlert?: LeechAlert | null;
}

export interface GradeReviewInput {
  id: string;
  revision: string;
  rating: ReviewRating;
  durationMs: number;
  deckId?: string | null;
}

export function validateReview(input: unknown): GradeReviewInput {
  if (!input || typeof input !== 'object') throw new Error('invalid-request');
  const value = input as GradeReviewInput;
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    value.id.length > 500 ||
    typeof value.revision !== 'string' ||
    value.revision.length > 500 ||
    ![1, 2, 3, 4].includes(value.rating) ||
    !Number.isSafeInteger(value.durationMs) ||
    value.durationMs < 0 ||
    value.durationMs > 86_400_000
  ) {
    throw new Error('invalid-request');
  }
  const deckId =
    value.deckId !== undefined && value.deckId !== null && value.deckId !== ''
      ? String(value.deckId).slice(0, 128)
      : undefined;
  return {
    id: value.id,
    revision: value.revision,
    rating: value.rating,
    durationMs: value.durationMs,
    ...(deckId ? { deckId } : {}),
  };
}

export function validateStepsArray(steps: unknown, fieldName: string): number[] {
  if (!Array.isArray(steps) || steps.length > 10) {
    throw new Error(`invalid-request: ${fieldName} must be an array of at most 10 numbers`);
  }
  return steps.map((val, idx) => {
    const num = typeof val === 'number' ? val : Number(val);
    if (!Number.isFinite(num) || num <= 0 || num > 43_200) {
      throw new Error(`invalid-request: ${fieldName}[${idx}] must be a positive number of minutes`);
    }
    return num;
  });
}

export function validateSrsPresetInput(input: unknown): Required<Omit<SaveSrsPresetInput, 'id'>> & { id?: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('invalid-request: preset input must be an object');
  }
  const val = input as Record<string, unknown>;
  const id = val.id !== undefined && val.id !== null ? String(val.id).trim() : undefined;
  if (id !== undefined && (!id || id.length > 128)) {
    throw new Error('invalid-request: invalid preset id');
  }
  if (typeof val.name !== 'string' || !val.name.trim() || val.name.trim().length > 200) {
    throw new Error('invalid-request: preset name is required');
  }
  const name = val.name.trim();

  const learnSteps = val.learnSteps !== undefined ? validateStepsArray(val.learnSteps, 'learnSteps') : [1, 10];
  const relearnSteps = val.relearnSteps !== undefined ? validateStepsArray(val.relearnSteps, 'relearnSteps') : [10];

  const newPerDay = val.newPerDay !== undefined ? Number(val.newPerDay) : 20;
  if (!Number.isInteger(newPerDay) || newPerDay < 0 || newPerDay > 9999) {
    throw new Error('invalid-request: newPerDay must be an integer between 0 and 9999');
  }

  const reviewsPerDay = val.reviewsPerDay !== undefined ? Number(val.reviewsPerDay) : 200;
  if (!Number.isInteger(reviewsPerDay) || reviewsPerDay < 0 || reviewsPerDay > 9999) {
    throw new Error('invalid-request: reviewsPerDay must be an integer between 0 and 9999');
  }

  const desiredRetention = val.desiredRetention !== undefined ? Number(val.desiredRetention) : 0.9;
  if (!Number.isFinite(desiredRetention) || desiredRetention < 0.7 || desiredRetention > 0.99) {
    throw new Error('invalid-request: desiredRetention must be between 0.7 and 0.99');
  }

  const maximumInterval = val.maximumInterval !== undefined ? Number(val.maximumInterval) : 36500;
  if (!Number.isInteger(maximumInterval) || maximumInterval < 1 || maximumInterval > 365000) {
    throw new Error('invalid-request: maximumInterval must be a positive integer');
  }

  const leechThreshold = val.leechThreshold !== undefined ? Number(val.leechThreshold) : 8;
  if (!Number.isInteger(leechThreshold) || leechThreshold < 1 || leechThreshold > 999) {
    throw new Error('invalid-request: leechThreshold must be between 1 and 999');
  }

  const leechAction = val.leechAction !== undefined ? val.leechAction : 'tag';
  if (leechAction !== 'tag' && leechAction !== 'suspend') {
    throw new Error('invalid-request: leechAction must be tag or suspend');
  }

  const newOrder = val.newOrder !== undefined ? val.newOrder : 'position';
  if (newOrder !== 'position' && newOrder !== 'random') {
    throw new Error('invalid-request: newOrder must be position or random');
  }

  let fsrsParams: number[] | null = null;
  if (val.fsrsParams !== undefined && val.fsrsParams !== null) {
    if (!Array.isArray(val.fsrsParams) || val.fsrsParams.length !== 21) {
      throw new Error('invalid-request: fsrsParams must be null or an array of exactly 21 numbers');
    }
    fsrsParams = val.fsrsParams.map((p, idx) => {
      const n = typeof p === 'number' ? p : Number(p);
      if (!Number.isFinite(n)) {
        throw new Error(`invalid-request: fsrsParams[${idx}] must be a finite number`);
      }
      return n;
    });
  }

  return {
    ...(id ? { id } : {}),
    name,
    learnSteps,
    relearnSteps,
    newPerDay,
    reviewsPerDay,
    desiredRetention,
    maximumInterval,
    buryNew: Boolean(val.buryNew),
    buryReviews: Boolean(val.buryReviews),
    buryInterday: Boolean(val.buryInterday),
    leechThreshold,
    leechAction,
    newOrder,
    fsrsParams,
  };
}

export type PropOperator = '<' | '<=' | '>' | '>=' | '=';

export interface ParsedFilterClause {
  kind:
    | 'is_due'
    | 'is_new'
    | 'is_learn'
    | 'is_review'
    | 'is_suspended'
    | 'is_buried'
    | 'is_lapsed'
    | 'prop_r'
    | 'prop_d'
    | 'deck'
    | 'tag'
    | 'source'
    | 'text';
  op?: PropOperator;
  numValue?: number;
  strValue?: string;
}

/**
 * Tokenizes a filtered deck search query, respecting double-quoted strings,
 * and parses each token into a structured filter clause combined with AND.
 */
export function parseFilteredSearch(search: string): ParsedFilterClause[] {
  const tokens: string[] = [];
  const regex = /(?:[^\s"]+|"[^"]*")+/gu;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(search)) !== null) {
    const token = match[0].trim();
    if (!token || token.toUpperCase() === 'AND') continue;
    tokens.push(token);
  }

  const clauses: ParsedFilterClause[] = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();

    if (lower === 'is:due') {
      clauses.push({ kind: 'is_due' });
      continue;
    }
    if (lower === 'is:new') {
      clauses.push({ kind: 'is_new' });
      continue;
    }
    if (lower === 'is:learn') {
      clauses.push({ kind: 'is_learn' });
      continue;
    }
    if (lower === 'is:review') {
      clauses.push({ kind: 'is_review' });
      continue;
    }
    if (lower === 'is:suspended') {
      clauses.push({ kind: 'is_suspended' });
      continue;
    }
    if (lower === 'is:buried') {
      clauses.push({ kind: 'is_buried' });
      continue;
    }
    if (lower === 'is:lapsed') {
      clauses.push({ kind: 'is_lapsed' });
      continue;
    }

    const propMatch = /^prop:(r|d)(<=|>=|<|>|=)(-?\d+(?:\.\d+)?)$/iu.exec(token);
    if (propMatch) {
      const prop = propMatch[1].toLowerCase();
      const op = propMatch[2] as PropOperator;
      let numValue = Number(propMatch[3]);
      if (prop === 'r' && numValue > 1) {
        numValue = numValue / 100;
      }
      clauses.push({
        kind: prop === 'r' ? 'prop_r' : 'prop_d',
        op,
        numValue,
      });
      continue;
    }

    if (lower.startsWith('deck:')) {
      const rawDeck = token.slice(5).replace(/^"|"$/gu, '').trim();
      if (rawDeck) {
        clauses.push({ kind: 'deck', strValue: rawDeck });
      }
      continue;
    }

    if (lower.startsWith('tag:')) {
      const rawTag = token.slice(4).replace(/^"|"$/gu, '').trim();
      if (rawTag) {
        clauses.push({ kind: 'tag', strValue: rawTag });
      }
      continue;
    }

    if (lower.startsWith('source:')) {
      const rawSource = token.slice(7).replace(/^"|"$/gu, '').trim().toLowerCase();
      const normalizedSource = rawSource === 'sunnah' ? 'hadith' : rawSource;
      if (normalizedSource) {
        clauses.push({ kind: 'source', strValue: normalizedSource });
      }
      continue;
    }

    clauses.push({ kind: 'text', strValue: token.replace(/^"|"$/gu, '') });
  }

  return clauses;
}

/**
 * Computes local day start and next day rollover (dayEnd) for a given Date and rolloverHour (0 or 4).
 */
export function getSrsDayBounds(now: Date, rolloverHour: 0 | 4 = 4): { dayStart: Date; dayEnd: Date } {
  const hour = rolloverHour === 0 ? 0 : 4;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
  if (now.getTime() < start.getTime()) {
    start.setDate(start.getDate() - 1);
  }
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, hour, 0, 0, 0);
  return { dayStart: start, dayEnd: end };
}
