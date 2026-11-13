import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_SNAP_THRESHOLD, snapBoardRect, type SnapRect } from '../../src/shared/board-snap';

const rect = (x: number, y: number, w = 100, h = 50): SnapRect => ({ x, y, w, h });

test('a left edge snaps to another left edge within the threshold', () => {
  const result = snapBoardRect(rect(3, 10), [rect(0, 0)]);
  assert.equal(result.x, 0);
  assert.equal(result.y, 10);
  assert.deepEqual(result.guides, [{ axis: 'x', position: 0, from: 0, to: 60 }]);
});

test('nothing snaps beyond the threshold, so the rect keeps its position', () => {
  assert.equal(BOARD_SNAP_THRESHOLD, 6);
  const result = snapBoardRect(rect(20, 20), [rect(200, 200)]);
  assert.deepEqual(result, { x: 20, y: 20, guides: [] });
});

test('centres align with each other', () => {
  const result = snapBoardRect(rect(46, 300), [rect(0, 0, 200, 50)]);
  assert.equal(result.x, 50);
  assert.equal(result.y, 300);
  assert.deepEqual(result.guides, [{ axis: 'x', position: 100, from: 0, to: 350 }]);
});

test('a right edge snaps to another rect left edge for adjacency', () => {
  const result = snapBoardRect(rect(96, 300), [rect(200, 0)]);
  assert.equal(result.x, 100);
  assert.equal(result.y, 300);
  assert.deepEqual(result.guides, [{ axis: 'x', position: 200, from: 0, to: 350 }]);
});

test('x and y snap independently and emit two guides', () => {
  const result = snapBoardRect(rect(103, 97), [rect(100, 100)]);
  assert.equal(result.x, 100);
  assert.equal(result.y, 100);
  assert.deepEqual(result.guides, [
    { axis: 'x', position: 100, from: 100, to: 150 },
    { axis: 'y', position: 100, from: 100, to: 200 },
  ]);
});

test('a guide spans every rect aligned at that coordinate, not just the snapped pair', () => {
  const result = snapBoardRect(rect(3, 60, 100, 40), [rect(0, 0, 100, 50), rect(0, 150, 100, 30)]);
  assert.equal(result.x, 0);
  assert.equal(result.y, 60);
  assert.deepEqual(result.guides, [{ axis: 'x', position: 0, from: 0, to: 180 }]);
});

test('ties prefer the nearer distance, then the earlier rect', () => {
  const nearer = snapBoardRect(rect(0, 0), [rect(-2, 200), rect(5, 400)]);
  assert.equal(nearer.x, -2);
  assert.deepEqual(nearer.guides, [{ axis: 'x', position: -2, from: 0, to: 250 }]);
  const earlier = snapBoardRect(rect(0, 0), [rect(-4, 200), rect(4, 400)]);
  assert.equal(earlier.x, -4);
  assert.deepEqual(earlier.guides, [{ axis: 'x', position: -4, from: 0, to: 250 }]);
});

test('an unused grid rounds the top-left coordinate, and an item snap beats it', () => {
  assert.deepEqual(snapBoardRect(rect(13, 27), [], { grid: 10 }), { x: 10, y: 30, guides: [] });
  const snapped = snapBoardRect(rect(1000, 13), [rect(0, 15)], { grid: 10 });
  assert.equal(snapped.x, 1000);
  assert.equal(snapped.y, 15);
  assert.deepEqual(snapped.guides, [{ axis: 'y', position: 15, from: 0, to: 1100 }]);
});

test('a custom threshold widens and narrows the snap range', () => {
  const wide = snapBoardRect(rect(15, 0), [rect(0, 300)], { threshold: 20 });
  assert.equal(wide.x, 0);
  assert.deepEqual(wide.guides, [{ axis: 'x', position: 0, from: 0, to: 350 }]);
  assert.equal(snapBoardRect(rect(15, 0), [rect(0, 300)]).x, 15);
});

test('others with non-finite numbers or non-positive sizes are ignored', () => {
  const result = snapBoardRect(rect(2, 2), [
    rect(Number.NaN, 0),
    rect(Number.POSITIVE_INFINITY, 0),
    rect(2, 2, 0, 50),
    rect(2, 2, 50, -1),
    rect(0, 0),
  ]);
  assert.equal(result.x, 0);
  assert.equal(result.y, 0);
  assert.equal(result.guides.length, 2);
});

test('snapping never mutates its inputs', () => {
  const moving = rect(3, 4);
  const others = [rect(0, 0)];
  const movingCopy = { ...moving };
  const othersCopy = others.map(other => ({ ...other }));
  snapBoardRect(moving, others, { grid: 10 });
  assert.deepEqual(moving, movingCopy);
  assert.deepEqual(others, othersCopy);
});

test('a y snap keeps the x snap made on the same drag, and guides use the landed position', () => {
  const result = snapBoardRect({ x: 3, y: 4, w: 10, h: 10 }, [{ x: 0, y: 0, w: 10, h: 10 }]);
  assert.equal(result.x, 5);
  assert.equal(result.y, 5);
  assert.deepEqual(result.guides.map(guide => [guide.axis, guide.from, guide.to]), [['x', 0, 15], ['y', 0, 15]]);
});
