/**
 * Baglib — a one-shot request to open part of the Notes view from elsewhere (KEY-412).
 * The Notes view may not be mounted yet when the request is made (for example from the Dashboard),
 * so the request is kept until the component that handles it takes it, on mount or on the event.
 */

export type RevisionIntent = { kind: 'review'; deckId: string | null } | { kind: 'narrators' };

export const REVISION_INTENT_EVENT = 'baglib:revision-intent';

let pending: RevisionIntent | null = null;

export function requestRevisionIntent(intent: RevisionIntent): void {
  pending = intent;
  window.dispatchEvent(new CustomEvent(REVISION_INTENT_EVENT));
}

export function peekRevisionIntent(): RevisionIntent | null {
  return pending;
}

/** Takes the pending request if it is of this kind. */
export function takeRevisionIntent<K extends RevisionIntent['kind']>(kind: K): Extract<RevisionIntent, { kind: K }> | null {
  if (pending?.kind !== kind) return null;
  const intent = pending as Extract<RevisionIntent, { kind: K }>;
  pending = null;
  return intent;
}
