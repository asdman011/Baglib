export const CARD_SOURCE_KINDS = ['book', 'quran', 'hadith', 'poetry', 'note', 'term', 'person'] as const;
export type CardSourceKind = typeof CARD_SOURCE_KINDS[number];

const MAX_CARD_TEXT = 20_000;
const MAX_CARD_FIELD = 500;

export interface SaveCardInput {
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

export interface KnowledgeCardsAPI {
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
  return {
    front,
    back,
    sourceKind: sourceKind as CardSourceKind,
    sourceRef: optionalField(value.sourceRef),
    sourceLabel: optionalField(value.sourceLabel),
    language: optionalField(value.language),
    workId: optionalField(value.workId),
  };
}
