/**
 * The single list of per-line actions in the poem reader. The hover/focus icon group, long-press on touch and
 * the planned right-click menu (KEY-316) all read this list, so they never drift apart.
 */
export type PoetryLineActionId = 'copy' | 'share' | 'saveNote' | 'select';

export interface PoetryLineAction {
  id: PoetryLineActionId;
  /** Translation key of the visible/accessible label. */
  labelKey: 'bayanCopyVerse' | 'bayanShare' | 'bayanSaveNote' | 'bayanSelectVerse';
  /** Name of the icon in the icon group. */
  icon: 'copy' | 'share' | 'note' | 'select';
  /** Key that triggers the action while a line has keyboard focus. */
  key: string;
}

export const POETRY_LINE_ACTIONS: readonly PoetryLineAction[] = [
  { id: 'select', labelKey: 'bayanSelectVerse', icon: 'select', key: 'Enter' },
  { id: 'share', labelKey: 'bayanShare', icon: 'share', key: 's' },
  { id: 'copy', labelKey: 'bayanCopyVerse', icon: 'copy', key: 'c' },
  { id: 'saveNote', labelKey: 'bayanSaveNote', icon: 'note', key: 'n' },
];

/** How long a touch must be held on a line before its actions appear. */
export const POETRY_LONG_PRESS_MS = 500;
/** A touch that moves further than this many pixels is a scroll, not a long-press. */
export const POETRY_LONG_PRESS_SLOP_PX = 10;

export interface PoetryLineActionRow { index: number; sadr: string; ajuz: string | null }

export type PoetryLineActionHandlers = Record<PoetryLineActionId, (row: PoetryLineActionRow) => void>;

/** The action bound to a key press on a focused line, or null. Modified key presses are never actions. */
export function poetryLineActionForKey(event: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): PoetryLineActionId | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return POETRY_LINE_ACTIONS.find(action => action.key === key)?.id ?? null;
}

export function runPoetryLineAction(id: PoetryLineActionId, row: PoetryLineActionRow, handlers: PoetryLineActionHandlers): void {
  handlers[id](row);
}

/** Pure long-press decision, so the touch behaviour is testable without a browser. */
export function isPoetryLongPress(input: { heldMs: number; movedPx: number }): boolean {
  return input.heldMs >= POETRY_LONG_PRESS_MS && input.movedPx <= POETRY_LONG_PRESS_SLOP_PX;
}
