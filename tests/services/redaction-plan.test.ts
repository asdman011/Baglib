import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayRectToPageRect, engineRedactionBoxes, planRedaction, type RedactionRect } from '../../src/shared/redaction-plan';

const rect = (values: RedactionRect) => values.map(value => Math.round(value * 1000) / 1000);

test('boxes group by page and remap to the temporary document in page order', () => {
  const plan = planRedaction([{ page: 9, rect: [1, 1, 2, 2] }, { page: 3, rect: [1, 1, 2, 2] }, { page: 9, rect: [3, 3, 4, 4] }]);
  assert.deepEqual(plan.pages, [3, 9]);
  assert.deepEqual(plan.boxes.map(box => [box.sourcePage, box.temporaryPage]), [[9, 2], [3, 1], [9, 2]]);
});

test('first page, last page and every page keep their own positions', () => {
  assert.deepEqual(planRedaction([{ page: 1, rect: [1, 1, 2, 2] }]).boxes[0].temporaryPage, 1);
  assert.deepEqual(planRedaction([{ page: 155, rect: [1, 1, 2, 2] }]).boxes[0].temporaryPage, 1);
  const all = planRedaction([1, 2, 3].map(page => ({ page, rect: [1, 1, 2, 2] })));
  assert.deepEqual(all.boxes.map(box => box.temporaryPage), [1, 2, 3]);
});

test('malformed boxes are refused rather than widened', () => {
  for (const region of [{ page: 0, rect: [1, 1, 2, 2] }, { page: 1.5, rect: [1, 1, 2, 2] }, { page: 1, rect: [2, 2, 1, 1] }, { page: 1, rect: [1, 1, 2] }, { page: 1, rect: [1, 1, Number.NaN, 2] }]) {
    assert.throws(() => planRedaction([region]), /invalid-request/u);
  }
});

// A 100 by 200 stored page. Corners of the box follow the page as it turns clockwise.
const page = { page: 1, width: 100, height: 200 };

test('upright boxes are unchanged', () => {
  assert.deepEqual(rect(displayRectToPageRect([10, 20, 30, 50], { ...page, rotation: 0 })), [10, 20, 30, 50]);
});

test('a box near the displayed top-left of a page turned 90 degrees lands at the stored bottom-left', () => {
  // Displayed 200 wide and 100 tall. The stored left edge is now on top, and the stored bottom on the left.
  assert.deepEqual(rect(displayRectToPageRect([10, 20, 30, 50], { ...page, rotation: 90 })), [20, 170, 50, 190]);
});

test('a page turned 180 degrees mirrors both axes', () => {
  assert.deepEqual(rect(displayRectToPageRect([10, 20, 30, 50], { ...page, rotation: 180 })), [70, 150, 90, 180]);
});

test('a box near the displayed top-left of a page turned 270 degrees lands at the stored top-right', () => {
  assert.deepEqual(rect(displayRectToPageRect([10, 20, 30, 50], { ...page, rotation: 270 })), [50, 10, 80, 30]);
});

test('negative and over-full rotations normalize, and an odd rotation is refused', () => {
  assert.deepEqual(displayRectToPageRect([10, 20, 30, 50], { ...page, rotation: -90 }), displayRectToPageRect([10, 20, 30, 50], { ...page, rotation: 270 }));
  assert.deepEqual(displayRectToPageRect([10, 20, 30, 50], { ...page, rotation: 450 }), displayRectToPageRect([10, 20, 30, 50], { ...page, rotation: 90 }));
  assert.throws(() => displayRectToPageRect([10, 20, 30, 50], { ...page, rotation: 45 }), /invalid-request/u);
});

test('UserUnit pages convert displayed size back to stored points', () => {
  assert.deepEqual(rect(displayRectToPageRect([20, 40, 60, 100], { ...page, rotation: 0, userUnit: 2 })), [10, 20, 30, 50]);
});

test('engine boxes use remapped pages and stay on the page', () => {
  const plan = planRedaction([{ page: 7, rect: [-20, 10, 40, 500] }]);
  assert.deepEqual(engineRedactionBoxes(plan, [{ page: 7, width: 100, height: 200, rotation: 0 }]), [{ x: 0, y: 10, width: 40, height: 190, page: 1, color: '#000000' }]);
});

test('a box wholly off the page is refused', () => {
  assert.throws(() => engineRedactionBoxes(planRedaction([{ page: 1, rect: [150, 10, 170, 20] }]), [{ page: 1, width: 100, height: 200, rotation: 0 }]), /invalid-request/u);
});
