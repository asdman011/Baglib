import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PdfCanvasPool } from '../../src/shared/pdf-canvas-pool';

test('canvas pool reuses released surfaces but never leases an active surface twice', () => {
  const pool = new PdfCanvasPool(() => ({ width: 10, height: 10 }));
  const first = pool.acquire(), second = pool.acquire();
  assert.notEqual(first, second);
  pool.release(first);
  pool.release(first);
  assert.equal(pool.acquire(), first);
  assert.notEqual(pool.acquire(), first);
  pool.dispose();
  assert.equal(second.width, 10);
  pool.release(second);
  assert.equal(second.width, 0);
  assert.throws(() => pool.acquire(), /cancelled/);
});

test('canvas pool bounds idle count and retained backing-store bytes', () => {
  const pool = new PdfCanvasPool(() => ({ width: 10, height: 10 }), 1, 500);
  const first = pool.acquire(), second = pool.acquire();
  pool.release(first); pool.release(second);
  assert.equal(second.width, 0);
  pool.dispose();
  assert.equal(first.width, 0);
  const limited = new PdfCanvasPool(() => ({ width: 100, height: 100 }), 4, 500);
  const oversized = limited.acquire(); limited.release(oversized);
  assert.equal(oversized.width, 0);
});
