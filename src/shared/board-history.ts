import type { Board } from './boards';

/**
 * Undo/redo for the board surface. Only the two mutable parts of a board travel through
 * history; the board's id, title, preset and revision are carried by the saved file and never undone.
 * Every function is pure: a history object is never changed, so the renderer can keep the previous value
 * and simply render the one it gets back.
 */
export type BoardSnapshot = Pick<Board, 'items' | 'edges'>;

export interface BoardHistory {
  past: BoardSnapshot[];
  present: BoardSnapshot;
  future: BoardSnapshot[];
  /** The tag of the last commit, used to fold one drag into a single undo step. */
  lastTag: string | null;
}

/** How many undo steps are kept; older ones fall off the start of `past`. */
export const BOARD_HISTORY_LIMIT = 100;

/** A snapshot whose arrays and objects belong to the history, never to the caller. */
const copy = (snapshot: BoardSnapshot): BoardSnapshot => ({
  items: snapshot.items.map(item => ({ ...item })),
  edges: snapshot.edges.map(edge => ({ ...edge })),
});

const same = (a: BoardSnapshot, b: BoardSnapshot): boolean => JSON.stringify(a) === JSON.stringify(b);

export function createBoardHistory(present: BoardSnapshot): BoardHistory {
  return { past: [], present: copy(present), future: [], lastTag: null };
}

/**
 * Records a new board state. A commit with the same tag as the previous one, and nothing to redo, replaces
 * the current state instead of stacking (a drag that fires on every mouse move is one undo step).
 */
export function commitBoardChange(history: BoardHistory, next: BoardSnapshot, tag?: string): BoardHistory {
  if (same(next, history.present)) return history;
  const label = tag ?? null;
  if (label !== null && label !== '' && label === history.lastTag && history.future.length === 0) {
    return { past: history.past, present: copy(next), future: history.future, lastTag: label };
  }
  const past = [...history.past, history.present].slice(-BOARD_HISTORY_LIMIT);
  return { past, present: copy(next), future: [], lastTag: label };
}

export function undoBoard(history: BoardHistory): BoardHistory {
  if (history.past.length === 0) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
    lastTag: null,
  };
}

export function redoBoard(history: BoardHistory): BoardHistory {
  if (history.future.length === 0) return history;
  return {
    past: [...history.past, history.present].slice(-BOARD_HISTORY_LIMIT),
    present: history.future[0],
    future: history.future.slice(1),
    lastTag: null,
  };
}

export function canUndoBoard(history: BoardHistory): boolean {
  return history.past.length > 0;
}

export function canRedoBoard(history: BoardHistory): boolean {
  return history.future.length > 0;
}
