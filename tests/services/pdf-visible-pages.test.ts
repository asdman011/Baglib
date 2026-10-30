import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearbyPdfPages } from '../../src/shared/pdf-visible-pages';

test('PDF viewport residency evicts departed pages and bounds adjacent pages', () => {
  const intersections = new Map([[1, 0.8], [2, 0.1]]);
  assert.deepEqual([...nearbyPdfPages(intersections, 100)], [1, 2, 3]);
  intersections.clear();
  intersections.set(50, 0.9);
  assert.deepEqual([...nearbyPdfPages(intersections, 100)], [49, 50, 51]);
  intersections.clear();
  intersections.set(100, 1);
  assert.deepEqual([...nearbyPdfPages(intersections, 100)], [99, 100]);
});
