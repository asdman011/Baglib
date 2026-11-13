import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeNormalizedRects, selectionBlocks } from '../../src/renderer/libs/reader/pdf-text-selection';

// KEY-335: a multi-line PDF selection reads as one connected shape, one block per line.
test('word boxes on one line become one block, even with small gaps between spans', () => {
  const line = [{ x: 10, y: 20, width: 5, height: 2 }, { x: 16.5, y: 20.1, width: 6, height: 1.9 }, { x: 25, y: 19.9, width: 8, height: 2.1 }];
  const merged = mergeNormalizedRects(line);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].x, 10);
  assert.ok(Math.abs(merged[0].x + merged[0].width - 33) < 1e-9);
});

test('consecutive lines touch: the leading between them is closed', () => {
  const merged = mergeNormalizedRects([
    { x: 10, y: 20, width: 70, height: 2 },
    { x: 10, y: 23, width: 70, height: 2 },
    { x: 10, y: 26, width: 40, height: 2 },
  ]);
  assert.equal(merged.length, 3, 'one block per line');
  assert.equal(merged[0].y + merged[0].height, merged[1].y, 'first line reaches the second');
  assert.equal(merged[1].y + merged[1].height, merged[2].y, 'second line reaches the third');
  assert.equal(merged[2].height, 2, 'the last line keeps its own height');
});

test('overlapping lines are trimmed so they meet edge to edge, never doubling the colour', () => {
  const merged = mergeNormalizedRects([
    { x: 10, y: 20, width: 70, height: 3 },
    { x: 10, y: 22.4, width: 70, height: 3 },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].y + merged[0].height, merged[1].y);
});

test('a far gap (another column) and a paragraph break stay separate', () => {
  const columns = mergeNormalizedRects([{ x: 5, y: 10, width: 35, height: 2 }, { x: 55, y: 10, width: 35, height: 2 }]);
  assert.equal(columns.length, 2);
  const paragraphs = mergeNormalizedRects([{ x: 10, y: 10, width: 70, height: 2 }, { x: 10, y: 20, width: 70, height: 2 }]);
  assert.equal(paragraphs[0].height, 2, 'a gap bigger than a line is not bridged');
});

test('Arabic right-aligned lines with ragged starts still join per line', () => {
  // Spans of an RTL line arrive in visual order with uneven heights.
  const merged = mergeNormalizedRects([
    { x: 60, y: 30, width: 30, height: 2.2 }, { x: 40, y: 30.2, width: 19, height: 1.8 },
    { x: 50, y: 33, width: 40, height: 2 },
  ]);
  assert.equal(merged.length, 2);
  assert.deepEqual([merged[0].x, Math.round((merged[0].x + merged[0].width) * 100) / 100], [40, 90]);
});

test('client rects become page percentages and boundary leaks are dropped', () => {
  const page = { left: 100, top: 50, width: 600, height: 800 };
  const blocks = selectionBlocks([
    { left: 160, top: 210, width: 120, height: 16 },
    { left: 290, top: 211, width: 100, height: 15 },
    { left: 100, top: 300, width: 600, height: 800 }, // the whole page: a leak
    { left: 400, top: 400, width: 1, height: 16 }, // a zero-width caret
  ], page);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].x, 10);
  assert.equal(blocks[0].y, 20);
});
