import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePageSelectionSyntax } from '../../src/renderer/components/reader/PdfPageEditor';

test('parsePageSelectionSyntax parses ranges, numbers, formulas, and keywords', () => {
  // Test range "1-3"
  assert.deepEqual(parsePageSelectionSyntax('1-3', 10), [1, 2, 3]);

  // Test single numbers and commas "1, 3, 5"
  assert.deepEqual(parsePageSelectionSyntax('1, 3, 5', 10), [1, 3, 5]);

  // Test formula "2n+1" (odd pages)
  assert.deepEqual(parsePageSelectionSyntax('2n+1', 6), [1, 3, 5]);

  // Test formula "2n" (even pages)
  assert.deepEqual(parsePageSelectionSyntax('2n', 6), [2, 4, 6]);

  // Test combined syntax "1-3, 5, 2n+1"
  assert.deepEqual(parsePageSelectionSyntax('1-3, 5, 2n+1', 7), [1, 2, 3, 5, 7]);

  // Test "all"
  assert.deepEqual(parsePageSelectionSyntax('all', 4), [1, 2, 3, 4]);

  // Out of bounds numbers are safely filtered
  assert.deepEqual(parsePageSelectionSyntax('0, 1.5, 2, 15', 5), [2]);
  assert.deepEqual(parsePageSelectionSyntax('1..3', 5), [1, 2, 3]);
});
