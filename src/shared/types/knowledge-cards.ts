import { validateQuestion, type QuestionKind, type QuestionPayload } from '../practice';
export const CARD_SOURCE_KINDS = ['book', 'quran', 'hadith', 'poetry', 'note', 'term', 'person'] as const;
export type CardSourceKind = typeof CARD_SOURCE_KINDS[number];

const MAX_CARD_TEXT = 20_000;
const MAX_CARD_FIELD = 500;

export interface SaveCardInput {
  questionKind?: QuestionKind;
  payload?: QuestionPayload;
  front: string;
  back: string;
  sourceKind: CardSourceKind;
  sourceRef?: string;
  sourceLabel?: string;
  language?: string;
  /** Only for cards from a library book. */
  workId?: string;
}

export interface KnowledgeCard {
  id: string;
  questionKind?: QuestionKind;
  payload?: QuestionPayload;
  cardRevision?: number;
  front: string;
  back: string;
  sourceKind: CardSourceKind;
  sourceRef: string | null;
  sourceLabel: string | null;
  language: string | null;
  workId: string | null;
  memorizing: boolean;
  createdAt: string;
}

/** A note or highlight kept after its book was deleted. */
export interface PreservedKnowledge {
  id: string;
  bookTitle: string;
  type: string;
  text: string;
  createdAt: string;
}

export const DECK_SOURCES = ['notes', 'highlights', 'quran', 'hadith', 'poetry'] as const;
export type DeckSource = typeof DECK_SOURCES[number];

export interface DeckInput {
  name: string;
  sources: DeckSource[];
  memorize: boolean;
}

export interface CardDeck {
  id: string;
  name: string;
  cards: number;
}

export interface DeckResult {
  deck: CardDeck;
  added: number;
  /** Texts too long to be a card. They are left out, never shortened. */
  skipped: number;
}

/** KEY-318: a deck straight from a range of ayahs (Hafs). The back of each card is the pack text, exact. */
export interface AyahDeckInput {
  name: string;
  surah: number;
  from: number;
  to: number;
  memorize: boolean;
}

export function validateAyahDeckInput(input: unknown, ayahCounts: readonly number[]): AyahDeckInput {
  const { name, surah, from, to, memorize } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new Error('invalid-request');
  if (!Number.isInteger(surah) || (surah as number) < 1 || (surah as number) > ayahCounts.length) throw new Error('invalid-request');
  const last = ayahCounts[(surah as number) - 1];
  if (!Number.isInteger(from) || !Number.isInteger(to) || (from as number) < 1 || (to as number) < (from as number) || (to as number) > last) throw new Error('invalid-request');
  return { name: name.trim(), surah: surah as number, from: from as number, to: to as number, memorize: memorize === true };
}

export function validateDeckInput(input: unknown): DeckInput {
  const { name, sources, memorize } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new Error('invalid-request');
  if (!Array.isArray(sources) || !sources.length || sources.some(source => !DECK_SOURCES.includes(source))) throw new Error('invalid-request');
  return { name: name.trim(), sources: [...new Set(sources)] as DeckSource[], memorize: memorize === true };
}

export interface KnowledgeCardsAPI {
  recordAttempt(input: import('../practice').PracticeInput): Promise<import('../practice').PracticeAttempt>;
  judgeAttempt(input: import('../practice').JudgeAttemptInput): Promise<import('../practice').PracticeAttempt>;
  listAttempts(query?: import('../practice').AttemptQuery): Promise<import('../practice').PracticeAttempt[]>;
  clearPracticeHistory(confirmed: boolean): Promise<void>;
  update(id: string, input: SaveCardInput, expectedRevision: number): Promise<KnowledgeCard>;
  decks(): Promise<CardDeck[]>;
  generateDeck(input: DeckInput): Promise<DeckResult>;
  /** KEY-318: one card per ayah in the range; rejects with quran-not-installed when the pack is missing. */
  generateAyahDeck(input: AyahDeckInput): Promise<DeckResult>;
  /** Resolves false when the save dialog is cancelled. */
  exportDeck(id: string): Promise<boolean>;
  reviewQueue(): Promise<import('../srs').ReviewQueue>;
  gradeReview(input: import('../srs').GradeReviewInput): Promise<import('../srs').ReviewQueue>;
  list(query?: { search?: string; offset?: number }): Promise<KnowledgeCard[]>;
  save(input: SaveCardInput): Promise<KnowledgeCard>;
  listPreserved(): Promise<PreservedKnowledge[]>;
  remove(id: string): Promise<boolean>;
  setMemorizing(id: string, memorizing: boolean): Promise<boolean>;
}

const optionalField = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > MAX_CARD_FIELD) throw new Error('invalid-request');
  return value;
};

/** Text is kept exactly as given, because sacred text must stay verbatim. */
export function validateCardInput(input: unknown): SaveCardInput {
  const value = (input ?? {}) as Record<string, unknown>;
  const { front, back, sourceKind } = value;
  if (typeof front !== 'string' || !front.trim() || front.length > MAX_CARD_TEXT) throw new Error('invalid-request');
  if (typeof back !== 'string' || back.length > MAX_CARD_TEXT) throw new Error('invalid-request');
  if (!CARD_SOURCE_KINDS.includes(sourceKind as CardSourceKind)) throw new Error('invalid-request');
  if (['quran','hadith','poetry'].includes(sourceKind as string) && (value.questionKind && value.questionKind !== 'recall' || value.payload)) throw new Error('invalid-request');
  return {
    ...validateQuestion(value.questionKind, value.payload),
    front,
    back,
    sourceKind: sourceKind as CardSourceKind,
    sourceRef: optionalField(value.sourceRef),
    sourceLabel: optionalField(value.sourceLabel),
    language: optionalField(value.language),
    workId: optionalField(value.workId),
  };
}
