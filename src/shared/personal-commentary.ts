export const COMMENTARY_KINDS = ['reflection', 'question', 'research', 'cross-reference', 'insight', 'academic'] as const;
export type CommentaryKind = typeof COMMENTARY_KINDS[number];

const MAX_TEXT = 100_000;
const REFERENCE = /^(quran:(?:(?:hafs|warsh):)?\d{1,3}:\d{1,3}|hadith:\d{1,12})$/u;

export interface CommentaryEntry {
  id: string;
  /** Profile-qualified Quran target or hadith id. Legacy unqualified Quran targets belong to Hafs. */
  reference: string;
  kind: CommentaryKind;
  text: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface CommentaryInput {
  id?: string;
  reference: string;
  kind: CommentaryKind;
  text: string;
  expectedRevision?: number;
}

export interface CommentaryAPI {
  list(reference: string): Promise<CommentaryEntry[]>;
  search(query: string): Promise<CommentaryEntry[]>;
  save(input: CommentaryInput): Promise<void>;
  remove(id: string): Promise<boolean>;
}

export const validCommentaryReference = (value: unknown): value is string => typeof value === 'string' && REFERENCE.test(value);

export function validateCommentary(input: unknown): CommentaryInput {
  const { id, reference, kind, text, expectedRevision } = (input ?? {}) as Record<string, unknown>;
  if (!validCommentaryReference(reference) || !COMMENTARY_KINDS.includes(kind as CommentaryKind)) throw new Error('invalid-request');
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) throw new Error('invalid-request');
  if (id !== undefined && (typeof id !== 'string' || !/^[\w-]{1,180}$/u.test(id))) throw new Error('invalid-request');
  if (expectedRevision !== undefined && !Number.isSafeInteger(expectedRevision)) throw new Error('invalid-request');
  return { id: id as string | undefined, reference, kind: kind as CommentaryKind, text, expectedRevision: expectedRevision as number | undefined };
}

/** Earlier Quran comments used Hafs numbering without naming its profile. */
export function commentaryReferenceKey(reference: string): string {
  return reference.replace(/^quran:(\d)/u, 'quran:hafs:$1');
}
