import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { quranPageKeyDelta, quranReadingKeyTarget } from '../../src/renderer/components/quran/quran-page-keys';

test('Quran page keys follow reading direction and support Space/Shift+Space without stealing modified keys', () => {
  const event = { key: 'ArrowLeft', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, defaultPrevented: false, isComposing: false, repeat: false };
  assert.equal(quranPageKeyDelta(event, 'rtl'), 1);
  assert.equal(quranPageKeyDelta(event, 'ltr'), -1);
  assert.equal(quranPageKeyDelta({ ...event, key: 'ArrowRight' }, 'rtl'), -1);
  assert.equal(quranPageKeyDelta({ ...event, key: 'ArrowRight' }, 'ltr'), 1);
  for (const direction of ['rtl', 'ltr'] as const) {
    assert.equal(quranPageKeyDelta({ ...event, key: ' ' }, direction), 1);
    assert.equal(quranPageKeyDelta({ ...event, key: ' ', shiftKey: true }, direction), -1);
    for (const flag of ['ctrlKey', 'metaKey', 'altKey', 'defaultPrevented', 'isComposing', 'repeat']) assert.equal(quranPageKeyDelta({ ...event, [flag]: true }, direction), 0);
    assert.equal(quranPageKeyDelta({ ...event, key: 'ArrowDown' }, direction), 0);
  }
});
test('Quran page navigation leaves form controls, editable text, dialogs and long study panels alone', () => {
  const { document } = parseHTML('<html><body><div id="page"></div><input><textarea></textarea><button><span id="icon"></span></button><div contenteditable="true"><p id="edit"></p></div><aside data-quran-study-panel><p id="tafsir"></p></aside><dialog role="dialog"><p id="dialog"></p></dialog></body></html>');
  assert.equal(quranReadingKeyTarget(document.querySelector('#page')), true);
  for (const selector of ['input', 'textarea', '#icon', '#edit', '#tafsir', '#dialog']) assert.equal(quranReadingKeyTarget(document.querySelector(selector)), false, selector);
});
