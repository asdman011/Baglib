import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readerEdge } from '../../src/shared/reader-immersive';

test('immersive edge activation mirrors only inline edges in Arabic RTL', () => {
  for (const dir of ['ltr', 'rtl'] as const) {
    assert.equal(readerEdge(500, 20, 1000, 800, dir), 'top');
    assert.equal(readerEdge(500, 780, 1000, 800, dir), 'bottom');
    assert.equal(readerEdge(500, 400, 1000, 800, dir), '');
    assert.equal(readerEdge(10, 400, 1000, 800, dir), dir === 'rtl' ? 'end' : 'start');
    assert.equal(readerEdge(990, 400, 1000, 800, dir), dir === 'rtl' ? 'start' : 'end');
    assert.equal(readerEdge(-1, 400, 1000, 800, dir), '');
    assert.equal(readerEdge(36, 400, 1000, 800, dir), '');
    assert.equal(readerEdge(0, 0, 0, 0, dir), '');
  }
});
