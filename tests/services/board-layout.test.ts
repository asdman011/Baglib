import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutBoardTree } from '../../src/shared/board-layout';
import { presetBoard, type BoardEdge, type BoardItem } from '../../src/shared/boards';

const card = (id: string, x: number, y: number, w = 100, h = 50): BoardItem => ({ id, kind: 'card', x, y, w, h, text: '', color: 'amber' });
const arrow = (from: string, to: string): BoardEdge => ({ id: `e-${from}-${to}`, from, to, label: '' });
const ids = (): (() => string) => { let n = 0; return () => `id-${++n}`; };
const at = (items: BoardItem[], id: string): BoardItem => items.find(item => item.id === id) as BoardItem;

test('the root of the tree keeps the place it had on the board', () => {
  const items = [card('r', 40, 30), card('a', 0, 0), card('b', 0, 400)];
  const edges = [arrow('r', 'a'), arrow('r', 'b')];
  for (const direction of ['ltr', 'rtl'] as const) {
    const laid = layoutBoardTree(items, edges, { rootId: 'r', direction });
    const root = at(laid, 'r');
    assert.equal(root.x, 40);
    assert.equal(root.y, 30);
  }
});

test('children grow to the right of the root in ltr and to its left in rtl', () => {
  const items = [card('r', 0, 0), card('a', 0, 0)];
  const edges = [arrow('r', 'a')];
  const ltr = layoutBoardTree(items, edges, { rootId: 'r', direction: 'ltr' });
  const rtl = layoutBoardTree(items, edges, { rootId: 'r', direction: 'rtl' });
  assert.ok(at(ltr, 'a').x >= at(ltr, 'r').x + at(ltr, 'r').w + 80);
  assert.ok(at(rtl, 'a').x + at(rtl, 'a').w <= at(rtl, 'r').x - 80);
});

test('siblings keep their top to bottom order and never overlap', () => {
  const items = [card('r', 0, 0), card('low', 0, 300), card('high', 0, -200), card('mid', 0, 20)];
  const edges = [arrow('r', 'low'), arrow('r', 'high'), arrow('r', 'mid')];
  const laid = layoutBoardTree(items, edges, { rootId: 'r', direction: 'ltr' });
  const high = at(laid, 'high');
  const mid = at(laid, 'mid');
  const low = at(laid, 'low');
  assert.ok(high.y < mid.y);
  assert.ok(mid.y < low.y);
  assert.ok(mid.y >= high.y + high.h);
  assert.ok(low.y >= mid.y + mid.h);
});

test('a parent sits at the vertical centre of the block of its children', () => {
  const items = [card('r', 0, 0), card('a', 0, -200), card('b', 0, 200)];
  const edges = [arrow('r', 'a'), arrow('r', 'b')];
  const laid = layoutBoardTree(items, edges, { rootId: 'r', direction: 'ltr' });
  const root = at(laid, 'r');
  const a = at(laid, 'a');
  const b = at(laid, 'b');
  const blockTop = Math.min(a.y, b.y);
  const blockBottom = Math.max(a.y + a.h, b.y + b.h);
  assert.equal(root.y + root.h / 2, (blockTop + blockBottom) / 2);
});

test('grandchildren are pushed one column further out than their parent', () => {
  const items = [card('r', 0, 0), card('a', 0, 0), card('b', 0, 0)];
  const edges = [arrow('r', 'a'), arrow('a', 'b')];
  const ltr = layoutBoardTree(items, edges, { rootId: 'r', direction: 'ltr' });
  assert.equal(at(ltr, 'a').x, at(ltr, 'r').x + at(ltr, 'r').w + 80);
  assert.equal(at(ltr, 'b').x, at(ltr, 'a').x + at(ltr, 'a').w + 80);
  const rtl = layoutBoardTree(items, edges, { rootId: 'r', direction: 'rtl' });
  assert.equal(at(rtl, 'a').x, at(rtl, 'r').x - 80 - at(rtl, 'a').w);
  assert.equal(at(rtl, 'b').x, at(rtl, 'a').x - 80 - at(rtl, 'b').w);
  assert.ok(at(ltr, 'b').x > at(ltr, 'a').x);
});

test('a loop of arrows ends the walk and places every card once', () => {
  const items = [card('a', 0, 0), card('b', 0, 0), card('c', 0, 0)];
  const edges = [arrow('a', 'b'), arrow('b', 'c'), arrow('c', 'a')];
  const laid = layoutBoardTree(items, edges, { rootId: 'a', direction: 'ltr' });
  assert.equal(laid.length, 3);
  assert.deepEqual([...laid.map(item => item.id)].sort(), ['a', 'b', 'c']);
  // b and c are both children of a, so they share one column but sit on different rows
  assert.equal(at(laid, 'b').x, at(laid, 'c').x);
  assert.notEqual(at(laid, 'b').y, at(laid, 'c').y);
  assert.ok(at(laid, 'b').y + at(laid, 'b').h <= at(laid, 'c').y);
});

test('cards that the tree cannot reach stay exactly where they were', () => {
  const items = [card('r', 0, 0), card('a', 0, 0), card('far', 640, 480)];
  const edges = [arrow('r', 'a')];
  const laid = layoutBoardTree(items, edges, { rootId: 'r', direction: 'ltr' });
  const far = at(laid, 'far');
  assert.equal(far.x, 640);
  assert.equal(far.y, 480);
});

test('a root that is not on the board leaves every card untouched', () => {
  const items = [card('a', 10, 20), card('b', 30, 40)];
  const edges = [arrow('a', 'b')];
  const laid = layoutBoardTree(items, edges, { rootId: 'nope', direction: 'rtl' });
  assert.deepEqual(laid, items);
  assert.notEqual(laid[0], items[0]);
  assert.notEqual(laid[1], items[1]);
});

test('the board that was handed in is never modified', () => {
  const items = [card('r', 0, 0), card('a', 0, 0)];
  const edges = [arrow('r', 'a')];
  const before = structuredClone({ items, edges });
  const laid = layoutBoardTree(items, edges, { rootId: 'r', direction: 'ltr' });
  assert.deepEqual(items, before.items);
  assert.deepEqual(edges, before.edges);
  assert.notEqual(laid[0], items[0]);
  assert.notEqual(laid[1], items[1]);
});

test('the cards come back in the order they were given in', () => {
  const items = [card('z', 0, 0), card('r', 0, 0), card('m', 0, 0)];
  const edges = [arrow('r', 'z'), arrow('r', 'm')];
  const laid = layoutBoardTree(items, edges, { rootId: 'r', direction: 'ltr' });
  assert.deepEqual(laid.map(item => item.id), ['z', 'r', 'm']);
});

test('the level and sibling gaps can be chosen by the caller', () => {
  const items = [card('r', 0, 0), card('a', 0, 0), card('b', 0, 200)];
  const edges = [arrow('r', 'a'), arrow('r', 'b')];
  const laid = layoutBoardTree(items, edges, { rootId: 'r', direction: 'ltr', levelGap: 10, siblingGap: 5 });
  assert.equal(at(laid, 'a').x, 110);
  assert.ok(at(laid, 'b').y - (at(laid, 'a').y + at(laid, 'a').h) === 5);
});

test('a mind map is laid out around its centre, branches on the Arabic side', () => {
  const words = { centre: 'الفكرة', branch: 'فرع', claim: 'الدعوى', reason: 'دليل', objection: 'اعتراض', supports: 'يؤيد', opposes: 'يعترض' };
  const mind = presetBoard('mind', words, ids());
  const centreId = mind.items[0].id;
  const rtl = layoutBoardTree(mind.items, mind.edges, { rootId: centreId, direction: 'rtl' });
  const centre = at(rtl, centreId);
  assert.equal(centre.text, 'الفكرة');
  assert.equal(centre.x, mind.items[0].x);
  assert.equal(centre.y, mind.items[0].y);
  const branches = mind.items.slice(1).map(branch => at(rtl, branch.id));
  for (const branch of branches) {
    assert.equal(branch.text, mind.items.slice(1).find(original => original.id === branch.id)?.text);
    assert.ok(branch.x + branch.w <= centre.x - 80);
  }
  for (let index = 1; index < branches.length; index += 1) {
    assert.ok(branches[index].y >= branches[index - 1].y + branches[index - 1].h);
  }
  const ltr = layoutBoardTree(mind.items, mind.edges, { rootId: centreId, direction: 'ltr' });
  for (const branch of mind.items.slice(1)) {
    const placed = at(ltr, branch.id);
    assert.ok(placed.x >= centre.x + centre.w + 80);
  }
});
