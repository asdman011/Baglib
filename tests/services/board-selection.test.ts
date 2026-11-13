import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_LIMITS, type BoardItem, type BoardEdge } from '../../src/shared/boards';
import { alignItems, duplicateSelection, itemsInMarquee, moveItems, selectionBounds, toggleSelection, type AlignMode } from '../../src/shared/board-selection';

const ids = (prefix = 'id'): (() => string) => { let n = 0; return () => `${prefix}-${++n}`; };
const item = (id: string, x = 0, y = 0, extra: Partial<BoardItem> = {}): BoardItem => ({ id, kind: 'card', x, y, w: 100, h: 50, text: '', color: 'amber', ...extra });
const edge = (id: string, from: string, to: string, label = ''): BoardEdge => ({ id, from, to, label });
const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

test('marquee: touch keeps what it reaches, contain only what it covers, corners in any order', () => {
  const items = [item('c', 400), item('a', 0), item('b', 200)];
  assert.deepEqual(itemsInMarquee(items, { x1: 100, y1: 0, x2: 200, y2: 50 }, 'touch'), ['a', 'b']);
  assert.deepEqual(itemsInMarquee(items, { x1: 200, y1: 50, x2: 100, y2: 0 }, 'touch'), ['a', 'b']);
  assert.deepEqual(itemsInMarquee(items, { x1: 200, y1: 0, x2: 300, y2: 50 }, 'contain'), ['b']);
  assert.deepEqual(itemsInMarquee(items, { x1: 200, y1: 50, x2: 100, y2: 0 }, 'contain'), []);
  assert.deepEqual(itemsInMarquee(items, { x1: -10, y1: -10, x2: 110, y2: 60 }, 'contain'), ['a']);
  assert.deepEqual(itemsInMarquee(items, { x1: 1000, y1: 1000, x2: 1100, y2: 1100 }, 'touch'), []);
});

test('toggle: additive adds then removes in order, plain click replaces, ids never repeat', () => {
  assert.deepEqual(toggleSelection([], 'a', true), ['a']);
  assert.deepEqual(toggleSelection(['a'], 'a', true), []);
  assert.deepEqual(toggleSelection(['a', 'b', 'c'], 'b', true), ['a', 'c']);
  assert.deepEqual(toggleSelection(['a', 'b'], 'z', false), ['z']);
  assert.deepEqual(toggleSelection(['a', 'b'], 'a', false), ['a']);
  assert.deepEqual(toggleSelection(['a', 'a', 'b'], 'c', true), ['a', 'b', 'c']);
  assert.deepEqual(toggleSelection(['a', 'b', 'a'], 'a', true), ['b']);
});

test('selection bounds cover the chosen cards and are null when none exist', () => {
  const items = [item('a', 0, 0), item('b', 200, 120, { w: 60, h: 40 })];
  assert.deepEqual(selectionBounds(items, ['b', 'a']), { x: 0, y: 0, w: 260, h: 160 });
  assert.deepEqual(selectionBounds(items, new Set(['b'])), { x: 200, y: 120, w: 60, h: 40 });
  assert.equal(selectionBounds(items, []), null);
  assert.equal(selectionBounds(items, ['missing']), null);
});

test('move shifts only the selected cards, clamps at the limit and leaves the rest identical', () => {
  const limit = BOARD_LIMITS.coordinate;
  const items = [item('a', limit - 10, -limit + 10), item('b'), item('c', 0, 0)];
  const moved = moveItems(items, new Set(['a', 'b']), 100, -100);
  assert.equal(moved.length, 3);
  assert.deepEqual(moved.map(entry => entry.id), ['a', 'b', 'c']);
  assert.equal(moved[0].x, limit);
  assert.equal(moved[0].y, -limit);
  assert.equal(moved[1].x, 100);
  assert.equal(moved[1].y, -100);
  assert.equal(moved[2], items[2]);
  assert.notEqual(moved[0], items[0]);
  assert.equal(moved[0].text, items[0].text);
});

test('move treats a non-finite delta as zero and never mutates its input', () => {
  const items = freeze([item('a', 5, 7), item('b', 10, 10)]);
  const copy = JSON.stringify(items);
  assert.deepEqual(moveItems(items, ['a'], Number.NaN, 10).map(entry => [entry.x, entry.y]), [[5, 17], [10, 10]]);
  assert.deepEqual(moveItems(items, ['a'], 10, Number.POSITIVE_INFINITY).map(entry => [entry.x, entry.y]), [[15, 7], [10, 10]]);
  assert.deepEqual(moveItems(items, ['a'], Number.NaN, Number.NaN), items);
  assert.equal(JSON.stringify(items), copy);
});

test('duplicate copies selected cards with new ids and keeps only the arrows between copies', () => {
  const board = freeze({
    items: [item('a', 0, 0, { text: 'الدعوى' }), item('b', 200, 0), item('c', 400, 0)],
    edges: [edge('e1', 'a', 'b', 'يؤيد'), edge('e2', 'b', 'c'), edge('e3', 'a', 'c')],
  });
  const next = ids('new');
  const { board: copy, newIds } = duplicateSelection(board, ['a', 'b'], next);
  assert.deepEqual(newIds, ['new-1', 'new-2']);
  assert.deepEqual(copy.items.map(entry => entry.id), ['a', 'b', 'c', 'new-1', 'new-2']);
  assert.deepEqual(copy.items.slice(3).map(entry => [entry.x, entry.y]), [[24, 24], [224, 24]]);
  assert.equal(copy.items[3].text, 'الدعوى');
  assert.deepEqual(copy.edges, [edge('e1', 'a', 'b', 'يؤيد'), edge('e2', 'b', 'c'), edge('e3', 'a', 'c'), edge('new-3', 'new-1', 'new-2', 'يؤيد')]);
});

test('duplicate honours its offset and copies nothing when nothing is selected', () => {
  const board = { items: [item('a'), item('b', 300)], edges: [edge('e1', 'a', 'b')] };
  const { board: shifted, newIds } = duplicateSelection(board, new Set(['b']), ids('n'), 0);
  assert.deepEqual(newIds, ['n-1']);
  assert.deepEqual(shifted.items[2], { ...item('b', 300), id: 'n-1' });
  assert.deepEqual(shifted.edges, [edge('e1', 'a', 'b')]);
  const empty = duplicateSelection(board, [], ids('x'));
  assert.deepEqual(empty.newIds, []);
  assert.deepEqual(empty.board.items, board.items);
  assert.deepEqual(empty.board.edges, board.edges);
});

test('align start, end and centre line up on the selection bounds', () => {
  const items = [item('a', 0, 0), item('b', 50, 100, { w: 40, h: 20 }), item('c', 300, 200)];
  const coords = (mode: AlignMode, idsToAlign: string[] = ['a', 'b']) => alignItems(items, idsToAlign, mode).map(entry => [entry.id, entry.x, entry.y]);
  assert.deepEqual(coords('start'), [['a', 0, 0], ['b', 0, 100], ['c', 300, 200]]);
  assert.deepEqual(coords('end'), [['a', 0, 0], ['b', 60, 100], ['c', 300, 200]]);
  assert.deepEqual(coords('centre'), [['a', 0, 0], ['b', 30, 100], ['c', 300, 200]]);
});

test('align top, middle and bottom line up on the selection bounds', () => {
  const items = [item('a', 0, 0), item('b', 50, 100, { w: 40, h: 20 }), item('c', 300, 200)];
  const coords = (mode: AlignMode) => alignItems(items, ['a', 'b'], mode).map(entry => [entry.id, entry.x, entry.y]);
  assert.deepEqual(coords('top'), [['a', 0, 0], ['b', 50, 0], ['c', 300, 200]]);
  assert.deepEqual(coords('bottom'), [['a', 0, 70], ['b', 50, 100], ['c', 300, 200]]);
  assert.deepEqual(coords('middle'), [['a', 0, 35], ['b', 50, 50], ['c', 300, 200]]);
});

test('align needs two existing cards and returns the same array otherwise', () => {
  const items = [item('a', 0, 0), item('b', 50, 100, { w: 40, h: 20 })];
  assert.equal(alignItems(items, ['a'], 'start'), items);
  assert.equal(alignItems(items, [], 'bottom'), items);
  assert.equal(alignItems(items, ['a', 'missing'], 'centre'), items);
});

test('no function mutates the board it is given', () => {
  const board = freeze({
    items: [item('a', 0, 0, { text: 'دليل' }), item('b', 200, 80, { w: 40, h: 20 })],
    edges: [edge('e1', 'a', 'b', 'يعترض')],
  });
  const before = JSON.stringify(board);
  itemsInMarquee(board.items, { x1: 0, y1: 0, x2: 300, y2: 200 }, 'touch');
  toggleSelection(['a'], 'b', true);
  selectionBounds(board.items, ['a', 'b']);
  moveItems(board.items, ['a'], 10, -10);
  duplicateSelection(board, ['a', 'b'], ids('n'));
  for (const mode of ['start', 'centre', 'end', 'top', 'middle', 'bottom'] as const) alignItems(board.items, ['a', 'b'], mode);
  assert.equal(JSON.stringify(board), before);
});
