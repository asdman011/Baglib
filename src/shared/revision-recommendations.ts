/**
 * Baglib — "Revise next" recommendations (KEY-412, the rule-based layer chosen in KEY-404).
 * Each item names the rule that produced it, so the UI can explain it in a sentence.
 */

export type RecommendationKind = 'backlog' | 'leeches' | 'finished-book' | 'narrators' | 'book-questions' | 'new-waiting';

export interface Recommendation {
  /** Stable id, used to remember a dismissal: `<kind>:<deck or work id>`. */
  id: string;
  kind: RecommendationKind;
  /** The main count: overdue cards, leeches, mastered hadith, highlights or new cards. */
  count: number;
  /** backlog: how many of the overdue cards are likely forgotten (retrievability below `WEAK_RETRIEVABILITY`). */
  weak?: number;
  /** backlog: a manageable number to do today. */
  suggested?: number;
  deckId?: string | null;
  deckName?: string;
  workId?: string;
  title?: string;
}

export const RECOMMENDATIONS_DISMISSED_SETTING = 'revision.recommendations.dismissed';
export const RECOMMENDATION_DISMISS_DAYS = 7;
export const MAX_RECOMMENDATIONS = 6;
/** Below this retrievability a card counts as "likely forgotten". */
export const WEAK_RETRIEVABILITY = 0.7;
/** A backlog suggestion never asks for more than this many cards in one day. */
export const BACKLOG_DAILY_CHUNK = 20;
/** Recent lapses: this many "Again" ratings within `LAPSE_WINDOW_DAYS` make a card slip. */
export const LAPSE_AGAIN_COUNT = 2;
export const LAPSE_WINDOW_DAYS = 14;
/** New cards untouched for this many days count as waiting. */
export const NEW_IDLE_DAYS = 3;
/** Mastered hadith needed before narrator cards are suggested. */
export const NARRATOR_MIN_MASTERED = 5;
/** Highlights without questions needed before AI questions are suggested. */
export const QUESTIONS_MIN_HIGHLIGHTS = 3;

const ID_PATTERN = /^(backlog|leeches|finished-book|narrators|book-questions|new-waiting):[\w:.-]{0,200}$/u;

export function validateRecommendationId(raw: unknown): string {
  if (typeof raw !== 'string' || !ID_PATTERN.test(raw)) throw new Error('invalid-request');
  return raw;
}

/** Keeps only dismissals that have not expired, so the setting never grows without bound. */
export function activeDismissals(raw: unknown, now: Date): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, until] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof until === 'string' && ID_PATTERN.test(id) && Date.parse(until) > now.getTime()) out[id] = until;
  }
  return out;
}
