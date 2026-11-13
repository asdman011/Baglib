import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeEndpoints, type BoardItem } from '../../src/shared/boards';
import { boardEdgeGeometry, parallelEdgeBends } from '../../src/shared/board-edge-path';

const item = (id: string, x = 0, y = 0, w = 100, h = 50): BoardItem => ({ id, kind: 'card', x, y, w, h, text: '', color: 'amber' });
const r2 = (value: number): number => Math.round(value * 100) / 100;

test('a straight horizontal arrow runs from box edge to box edge with angle 0', () => {
  const geometry = boardEdgeGeometry(item('a'), item('b', 300), 'straight');
  assert.equal(geometry.d, 'M 100 25 L 300 25');
  assert.equal(geometry.labelX, 200);
  assert.equal(geometry.labelY, 25);
  assert.equal(geometry.endAngle, 0);
});

test('a straight vertical arrow has angle 90, and -90 when it points back up', () => {
  const down = boardEdgeGeometry(item('a'), item('b', 0, 300), 'straight');
  assert.equal(down.d, 'M 50 50 L 50 300');
  assert.equal(down.labelX, 50);
  assert.equal(down.labelY, 175);
  assert.equal(down.endAngle, 90);
  const up = boardEdgeGeometry(item('b', 0, 300), item('a'), 'straight');
  assert.equal(up.d, 'M 50 300 L 50 50');
  assert.equal(up.endAngle, -90);
});

test('a positive bend pushes a left-to-right curve up, to the left of travel', () => {
  const left = boardEdgeGeometry(item('a'), item('b', 300), 'curved', 40);
  assert.equal(left.d, 'M 100 25 Q 200 -15 300 25');
  assert.equal(left.labelY, 5);
  const right = boardEdgeGeometry(item('a'), item('b', 300), 'curved', -40);
  assert.equal(right.d, 'M 100 25 Q 200 65 300 25');
  assert.equal(right.labelY, 45);
  assert.ok(left.labelY < 25 && right.labelY > 25);
});

test('the curved label sits on the curve at t = 0.5, not at the plain midpoint', () => {
  const a = item('a', 0, 0), b = item('b', 300, 100);
  const { x1, y1, x2, y2 } = edgeEndpoints(a, b);
  const dx = x2 - x1, dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const cx = (x1 + x2) / 2 + (dy / length) * 40;
  const cy = (y1 + y2) / 2 + (-dx / length) * 40;
  const geometry = boardEdgeGeometry(a, b, 'curved');
  assert.equal(geometry.labelX, r2(0.25 * x1 + 0.5 * cx + 0.25 * x2));
  assert.equal(geometry.labelY, r2(0.25 * y1 + 0.5 * cy + 0.25 * y2));
  assert.notEqual(geometry.labelX, r2((x1 + x2) / 2));
  assert.notEqual(geometry.labelY, r2((y1 + y2) / 2));
});

test('a bend of 0 gives a degenerate curve whose label is the midpoint', () => {
  const geometry = boardEdgeGeometry(item('a'), item('b', 300), 'curved', 0);
  assert.equal(geometry.d, 'M 100 25 Q 200 25 300 25');
  assert.equal(geometry.labelX, 200);
  assert.equal(geometry.labelY, 25);
  assert.equal(geometry.endAngle, 0);
});

test('numbers in d are rounded to two decimals without trailing zeros', () => {
  const diagonal = boardEdgeGeometry(item('a'), item('b', 300, 100), 'straight');
  assert.equal(diagonal.d, 'M 100 41.67 L 300 108.33');
  assert.equal(diagonal.labelX, 200);
  assert.equal(diagonal.labelY, 75);
  assert.equal(diagonal.endAngle, 18.43);

  const fractional = boardEdgeGeometry(item('a', 0.25, 0.5), item('b', 300.75, 0.5), 'straight');
  assert.equal(fractional.d, 'M 100.25 25.5 L 300.75 25.5');
  assert.equal(fractional.labelX, 200.5);
  assert.equal(fractional.labelY, 25.5);

  const curved = boardEdgeGeometry(item('a'), item('b', 300), 'curved', 12.34);
  assert.equal(curved.d, 'M 100 25 Q 200 12.66 300 25');
  assert.equal(curved.labelY, 18.83);
});

test('overlapping boxes give a zero-length path with a label and no NaN', () => {
  for (const shape of ['straight', 'curved'] as const) {
    const geometry = boardEdgeGeometry(item('a'), item('b'), shape);
    assert.equal(geometry.d, 'M 50 25 L 50 25');
    assert.equal(geometry.labelX, 50);
    assert.equal(geometry.labelY, 25);
    assert.equal(geometry.endAngle, 0);
    assert.doesNotMatch(geometry.d, /NaN|Infinity/u);
    for (const value of [geometry.labelX, geometry.labelY, geometry.endAngle]) assert.ok(Number.isFinite(value));
  }
});

test('a single arrow between two boxes keeps bend 0', () => {
  const bends = parallelEdgeBends([{ id: 'e1', from: 'a', to: 'b' }]);
  assert.deepEqual([...bends.entries()], [['e1', 0]]);
  assert.equal(bends.get('e1'), 0);
});

test('two and three arrows between the same boxes are spread around the line', () => {
  const two = parallelEdgeBends([{ id: 'e1', from: 'a', to: 'b' }, { id: 'e2', from: 'a', to: 'b' }]);
  assert.deepEqual([...two.entries()], [['e1', -18], ['e2', 18]]);
  const three = parallelEdgeBends([
    { id: 'e1', from: 'a', to: 'b' },
    { id: 'e2', from: 'a', to: 'b' },
    { id: 'e3', from: 'a', to: 'b' },
  ]);
  assert.deepEqual([...three.entries()], [['e1', -36], ['e2', 0], ['e3', 36]]);
  assert.ok(Object.is(three.get('e2'), 0));
});

test('an arrow travelling the opposite way gets its bend sign flipped, and spacing can be set', () => {
  const opposite = parallelEdgeBends([{ id: 'e1', from: 'a', to: 'b' }, { id: 'e2', from: 'b', to: 'a' }]);
  assert.deepEqual([...opposite.entries()], [['e1', -18], ['e2', -18]]);
  const wide = parallelEdgeBends([{ id: 'e1', from: 'a', to: 'b' }, { id: 'e2', from: 'a', to: 'b' }], 20);
  assert.deepEqual([...wide.entries()], [['e1', -10], ['e2', 10]]);
});

test('self-loops get bend 0 and every input id appears in the map', () => {
  const edges = [
    { id: 's', from: 'a', to: 'a' },
    { id: 'e1', from: 'a', to: 'b' },
    { id: 'e2', from: 'b', to: 'a' },
    { id: 'f1', from: 'c', to: 'd' },
  ];
  const bends = parallelEdgeBends(edges);
  assert.equal(bends.get('s'), 0);
  assert.equal(bends.size, edges.length);
  assert.deepEqual([...bends.keys()].sort(), edges.map(edge => edge.id).sort());
  assert.equal(bends.get('e1'), -18);
  assert.equal(bends.get('e2'), -18);
  assert.equal(bends.get('f1'), 0);
});

test('the geometry functions do not mutate their inputs', () => {
  const a = Object.freeze(item('a'));
  const b = Object.freeze(item('b', 300, 100));
  const edges = Object.freeze([Object.freeze({ id: 'e1', from: 'a', to: 'b' }), Object.freeze({ id: 'e2', from: 'b', to: 'a' })]);
  const before = JSON.stringify([a, b, edges]);
  boardEdgeGeometry(a, b, 'straight');
  boardEdgeGeometry(a, b, 'curved', 24);
  parallelEdgeBends(edges);
  assert.equal(JSON.stringify([a, b, edges]), before);
});
