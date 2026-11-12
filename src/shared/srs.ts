import type { KnowledgeCard } from './types/knowledge-cards';

export type ReviewRating = 1 | 2 | 3 | 4;
export interface ReviewCard extends KnowledgeCard {
  revision: string;
  /** Minutes until the next review for each rating, as the scheduler would set it now. */
  intervals?: Partial<Record<ReviewRating, number>>;
}
export interface ReviewQueue {
  cards: ReviewCard[];
  due: number;
  reviewedToday: number;
  nextDue: string | null;
}
export interface GradeReviewInput {
  id: string;
  revision: string;
  rating: ReviewRating;
  durationMs: number;
}

export function validateReview(input: unknown): GradeReviewInput {
  if (!input || typeof input !== 'object') throw new Error('invalid-request');
  const value = input as GradeReviewInput;
  if (typeof value.id !== 'string' || !value.id || value.id.length > 500 || typeof value.revision !== 'string' || value.revision.length > 500 || ![1, 2, 3, 4].includes(value.rating) || !Number.isSafeInteger(value.durationMs) || value.durationMs < 0 || value.durationMs > 86_400_000) throw new Error('invalid-request');
  return value;
}
