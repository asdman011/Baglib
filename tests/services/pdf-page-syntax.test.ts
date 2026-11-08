import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePageSelectionSyntax, selectPagePlanPositions } from '../../src/renderer/components/reader/PdfPageEditor';

test('page ranges support Arabic and Persian digits without changing page data', () => {
  assert.deepEqual(parsePageSelectionSyntax('١–٣، ۵؛ ٧', 7), [1, 2, 3, 5, 7]);
  assert.deepEqual(parsePageSelectionSyntax('زوجي', 5), [2, 4]);
  assert.deepEqual(parsePageSelectionSyntax('فردي', 5), [1, 3, 5]);
  assert.deepEqual(parsePageSelectionSyntax('الكل', 3), [1, 2, 3]);
  assert.deepEqual(parsePageSelectionSyntax('١e٢, ١.٥, 0x2', 200), []);
  assert.deepEqual(parsePageSelectionSyntax('all', Infinity), []);
});

test('page selection follows displayed positions after reorder, merge and blank insertion', () => {
  const plan = [
    { id: 'third', page: 3, sessionId: 'original' },
    { id: 'blank', blank: true },
    { id: 'first', page: 1, sessionId: 'original' },
    { id: 'imported', page: 1, sessionId: 'other' },
    { id: 'second', page: 2, sessionId: 'original' },
  ];
  const before = JSON.stringify(plan);
  assert.deepEqual([...selectPagePlanPositions(plan, '٢')], ['blank']);
  assert.deepEqual([...selectPagePlanPositions(plan, '3-4')], ['first', 'imported']);
  assert.deepEqual([...selectPagePlanPositions(plan, 'even')], ['blank', 'imported']);
  assert.equal(JSON.stringify(plan), before);
});

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
