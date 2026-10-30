import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PdfBitmapCache } from '../../src/shared/pdf-bitmap-cache';

const bitmap = (width = 10, height = 10) => ({ width, height, closed: false, close() { this.closed = true; } });

test('bitmap cache uses LRU eviction and closes native resources', () => {
  const cache = new PdfBitmapCache<ReturnType<typeof bitmap>>(2);
  const first = bitmap(), second = bitmap(), third = bitmap();
  cache.set('1@1', first); cache.set('2@1', second);
  assert.equal(cache.get('1@1'), first);
  cache.set('3@1', third);
  assert.equal(second.closed, true);
  assert.equal(first.closed, false);
  assert.equal(cache.preview('1@'), first);
  cache.dispose();
  assert.ok(first.closed && third.closed);
  const late = bitmap(); cache.set('late', late);
  assert.equal(late.closed, true);
  assert.equal(cache.get('late'), undefined);
});

test('bitmap cache bounds decoded bytes as well as page count and replaces safely', () => {
  const cache = new PdfBitmapCache<ReturnType<typeof bitmap>>(25, 800);
  const first = bitmap(), second = bitmap(), third = bitmap();
  cache.set('1', first); cache.set('2', second); cache.set('3', third);
  assert.equal(first.closed, true);
  const replacement = bitmap(); cache.set('2', replacement);
  assert.equal(second.closed, true);
  const oversized = bitmap(100, 100); cache.set('large', oversized);
  assert.equal(oversized.closed, true);
  assert.equal(cache.get('2'), replacement);
  cache.dispose();
});
