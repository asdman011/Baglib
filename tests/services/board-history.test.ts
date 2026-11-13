import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_HISTORY_LIMIT, canRedoBoard, canUndoBoard, commitBoardChange, createBoardHistory, redoBoard, undoBoard,
  type BoardSnapshot,
} from '../../src/shared/board-history';
import type { BoardEdge, BoardItem } from '../../src/shared/boards';

const item = (id: string, text = '', x = 0): BoardItem => ({ id, kind: 'card', x, y: 0, w: 100, h: 50, text, color: 'amber' });
const edge = (id: string, from: string, to: string, label = ''): BoardEdge => ({ id, from, to, label });
const snap = (items: BoardItem[], edges: BoardEdge[] = []): BoardSnapshot => ({ items, edges });

test('a commit can be undone and redone', () => {
  const start = snap([item('a', 'الفكرة')]);
  const history = createBoardHistory(start);
  assert.equal(canUndoBoard(history), false);
  assert.equal(canRedoBoard(history), false);
  const moved = commitBoardChange(history, snap([item('a', 'الفكرة', 40)]), 'drag');
  assert.equal(moved.present.items[0].x, 40);
  assert.equal(moved.lastTag, 'drag');
  assert.equal(canUndoBoard(moved), true);
  assert.equal(canRedoBoard(moved), false);

  const undone = undoBoard(moved);
  assert.deepEqual(undone.present, start);
  assert.equal(undone.lastTag, null);
  assert.equal(canUndoBoard(undone), false);
  assert.equal(canRedoBoard(undone), true);

  const redone = redoBoard(undone);
  assert.deepEqual(redone.present, moved.present);
  assert.equal(redone.lastTag, null);
  assert.equal(canUndoBoard(redone), true);
  assert.equal(canRedoBoard(redone), false);
});

test('undo and redo at either end return the same history object', () => {
  const history = createBoardHistory(snap([]));
  assert.equal(undoBoard(history), history);
  assert.equal(redoBoard(history), history);
  const one = commitBoardChange(history, snap([item('a')]));
  assert.equal(redoBoard(one), one);
  const back = undoBoard(one);
  assert.equal(undoBoard(back), back);
});

test('a new commit after undo clears the redo steps', () => {
  const history = createBoardHistory(snap([item('a')]));
  const moved = commitBoardChange(history, snap([item('a', '', 10)]), 'drag');
  const undone = undoBoard(moved);
  assert.equal(undone.future.length, 1);
  const branched = commitBoardChange(undone, snap([item('a', '', 99)]));
  assert.equal(branched.future.length, 0);
  assert.equal(canRedoBoard(branched), false);
  assert.equal(redoBoard(branched), branched);
  assert.equal(branched.present.items[0].x, 99);
});

test('the same tag coalesces one drag into a single undo step', () => {
  const start = snap([item('a', 'الفكرة')]);
  let history = createBoardHistory(start);
  for (const x of [10, 20, 30]) history = commitBoardChange(history, snap([item('a', 'الفكرة', x)]), 'drag');
  assert.equal(history.past.length, 1);
  assert.equal(history.present.items[0].x, 30);
  assert.equal(history.lastTag, 'drag');

  const undone = undoBoard(history);
  assert.deepEqual(undone.present, start);
  assert.equal(canUndoBoard(undone), false);
});

test('a different tag, an empty tag, or a commit after undo starts a new undo step', () => {
  const history = createBoardHistory(snap([item('a')]));
  const dragged = commitBoardChange(history, snap([item('a', '', 10)]), 'drag');
  const nudged = commitBoardChange(dragged, snap([item('a', '', 20)]), 'nudge');
  assert.equal(nudged.past.length, 2);
  const blank = commitBoardChange(nudged, snap([item('a', '', 30)]), '');
  assert.equal(blank.past.length, 3);
  assert.equal(blank.lastTag, '');

  const afterUndo = commitBoardChange(undoBoard(blank), snap([item('a', '', 40)]), 'drag');
  assert.equal(afterUndo.past.length, 3);
  assert.equal(afterUndo.present.items[0].x, 40);
  assert.equal(undoBoard(afterUndo).present.items[0].x, 20);

  const untagged = commitBoardChange(commitBoardChange(history, snap([item('a', '', 50)])), snap([item('a', '', 60)]));
  assert.equal(untagged.past.length, 2);
  assert.equal(untagged.lastTag, null);
});

test('an identical snapshot leaves the history object untouched', () => {
  const edges = [edge('e1', 'a', 'b', 'يؤيد')];
  const history = createBoardHistory(snap([item('a', 'الفكرة')], edges));
  const copy = snap([item('a', 'الفكرة')], [edge('e1', 'a', 'b', 'يؤيد')]);
  assert.equal(commitBoardChange(history, copy), history);
  assert.equal(commitBoardChange(history, copy, 'drag'), history);

  const moved = commitBoardChange(history, snap([item('a', 'الفكرة', 5)], edges), 'drag');
  assert.equal(commitBoardChange(moved, snap([item('a', 'الفكرة', 5)], [edge('e1', 'a', 'b', 'يؤيد')]), 'drag'), moved);
});

test('history keeps at most the newest entries', () => {
  let history = createBoardHistory(snap([item('a', '', 0)]));
  const commits = BOARD_HISTORY_LIMIT + 5;
  for (let x = 1; x <= commits; x++) history = commitBoardChange(history, snap([item('a', '', x)]));
  assert.equal(history.past.length, BOARD_HISTORY_LIMIT);
  assert.equal(history.past[0].items[0].x, 5);
  assert.equal(history.past[BOARD_HISTORY_LIMIT - 1].items[0].x, commits - 1);

  let undone = history;
  for (let step = 0; step < BOARD_HISTORY_LIMIT; step++) undone = undoBoard(undone);
  assert.equal(undone.present.items[0].x, 5);
  assert.equal(canUndoBoard(undone), false);
  assert.equal(undone.future.length, BOARD_HISTORY_LIMIT);
});

test('history copies snapshots and never mutates the caller arrays', () => {
  const items = [item('a', 'الفكرة')];
  const edges = [edge('e1', 'a', 'a', 'حول')];
  const start = { items, edges };
  const history = createBoardHistory(start);
  assert.notEqual(history.present.items, items);
  assert.notEqual(history.present.items[0], items[0]);
  assert.notEqual(history.present.edges, edges);
  assert.notEqual(history.present.edges[0], edges[0]);

  const nextItems = [item('a', 'الفكرة', 10)];
  const moved = commitBoardChange(history, { items: nextItems, edges }, 'drag');
  assert.notEqual(moved.present.items, nextItems);
  assert.notEqual(moved.present.items[0], nextItems[0]);
  assert.notEqual(moved.present.edges, edges);
  assert.equal(nextItems[0].x, 10);
  assert.equal(items[0].x, 0);
  assert.equal(items.length, 1);

  nextItems[0].x = 500;
  nextItems.push(item('b'));
  edges[0].label = 'changed';
  items[0].text = 'changed';
  assert.equal(moved.present.items.length, 1);
  assert.equal(moved.present.items[0].x, 10);
  assert.equal(moved.present.edges[0].label, 'حول');
  assert.equal(moved.past[0].items[0].text, 'الفكرة');
  assert.equal(history.present.items[0].text, 'الفكرة');

  const redone = redoBoard(undoBoard(moved));
  assert.deepEqual(redone.present, moved.present);
});
