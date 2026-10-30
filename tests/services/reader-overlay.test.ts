import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setReaderOverlay, type ReaderOverlay } from '../../src/shared/reader-overlay';

test('reader overlays replace one another and stale close events preserve the current overlay', () => {
  const overlays = ['hub', 'quick-tools', 'versions'] as const;
  for (const current of [null, ...overlays] as ReaderOverlay[]) {
    for (const target of overlays) {
      assert.equal(setReaderOverlay(current, target, true), target);
      assert.equal(setReaderOverlay(current, target, false), current === target ? null : current);
    }
  }
});
