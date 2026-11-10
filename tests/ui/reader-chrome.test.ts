import { test } from 'node:test';
import assert from 'node:assert/strict';
import { READER_CHROME_TABS, parseReaderChrome, readerChromeKey, resizeReaderPanel } from '../../src/renderer/components/reader/reader-chrome-state';

test('PDF and EPUB share Outline, Marks, Notes, Search in a stable order', () => {
  assert.deepEqual(READER_CHROME_TABS.map(tab => tab.id), ['toc', 'knowledge', 'annotations', 'search']);
});

test('per-book reader panel settings validate old and malformed preferences and bound widths', () => {
  assert.notEqual(readerChromeKey('book-a'), readerChromeKey('book-b'));
  assert.deepEqual(parseReaderChrome(null), { tab: 'toc', open: false, width: 320 });
  assert.deepEqual(parseReaderChrome({ tab: 'search', open: true, width: 360 }), { tab: 'search', open: true, width: 360 });
  assert.deepEqual(parseReaderChrome({ tab: 'unknown', open: 'yes', width: Infinity }), { tab: 'toc', open: false, width: 320 });
  assert.equal(parseReaderChrome({ width: -1 }).width, 280);
  assert.equal(parseReaderChrome({ width: 9999 }).width, 480);
});

test('resizing the end panel mirrors RTL and reserves a readable page', () => {
  assert.equal(resizeReaderPanel(320, 40, 'ltr', 1280), 280);
  assert.equal(resizeReaderPanel(320, 40, 'rtl', 1280), 360);
  assert.equal(resizeReaderPanel(480, -200, 'ltr', 900), 400);
});
