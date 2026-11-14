import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardEdgeGeometry } from '../../src/shared/board-edge-path';
import { boardLabelSize, labelBoxesIntersect, placeBoardLabels } from '../../src/shared/board-label-placement';
import type { BoardItem } from '../../src/shared/boards';

const item = (id: string, x: number, y = 0, w = 100, h = 100): BoardItem => ({ id, x, y, w, h, kind: 'card', color: 'sky', text: id });
const edges = [{ id: 'e', from: 'a', to: 'b', label: 'يُؤيد — supports' }];
const items = [item('a', 0), item('b', 400)];

test('unobstructed label starts at the actual curved midpoint without mutating inputs', () => {
  const geometry = boardEdgeGeometry(items[0], items[1], 'curved', 80);
  const before = JSON.stringify({ items, edges });
  const label = placeBoardLabels(items, edges, new Map([['e', geometry]])).get('e')!;
  assert.equal(label.centreX, geometry.labelX);
  assert.equal(label.centreY, geometry.labelY);
  assert.equal(JSON.stringify({ items, edges }), before);
});

test('labels move along the curve normal to clear cards and earlier parallel labels', () => {
  const obstacle = item('obstacle', 200, 20, 100, 60);
  const all = [...items, obstacle];
  const arrows = [...edges, { ...edges[0], id: 'e2' }];
  const geometry = boardEdgeGeometry(items[0], items[1], 'straight');
  const labels = [...placeBoardLabels(all, arrows, new Map(arrows.map(edge => [edge.id, geometry]))).values()];
  for (const label of labels) {
    assert.equal(label.centreX, geometry.labelX);
    assert.ok(all.every(card => !labelBoxesIntersect(label, card)));
  }
  assert.ok(!labelBoxesIntersect(labels[0], labels[1]));
});

test('diagonal and reversed paths clear mixed-script label boxes deterministically', () => {
  const all = [item('a', -200, -200), item('b', 300, 300)];
  const arrows = [...edges, { id: 'reverse', from: 'b', to: 'a', label: 'دليل / Evidence' }];
  const geometry = new Map(arrows.map(edge => [edge.id, boardEdgeGeometry(all.find(i => i.id === edge.from)!, all.find(i => i.id === edge.to)!, 'curved', -36)]));
  const labels = placeBoardLabels(all, arrows, geometry);
  assert.deepEqual(labels, placeBoardLabels(all, arrows, geometry));
  const boxes = [...labels.values()];
  assert.ok(!labelBoxesIntersect(boxes[0], boxes[1]));
  assert.ok(boxes.every(box => all.every(card => !labelBoxesIntersect(box, card))));
});

test('empty/dangling labels are skipped; coincident endpoints and impossible packing stay bounded', () => {
  assert.equal(placeBoardLabels(items, [{ ...edges[0], label: '' }], new Map()).size, 0);
  const all = [item('a', 0), item('b', 0), item('huge', -1000, -1000, 2000, 2000)];
  const geometry = boardEdgeGeometry(all[0], all[1], 'curved');
  const label = placeBoardLabels(all, edges, new Map([['e', geometry]])).get('e')!;
  assert.ok(Number.isFinite(label.centreX) && Number.isFinite(label.centreY));
  assert.ok(Math.abs(label.centreY - geometry.labelY) <= 192);
  assert.ok(boardLabelSize('عَلَم — A😀').w >= 32);
});
