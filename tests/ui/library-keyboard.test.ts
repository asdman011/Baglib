import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libraryNavigationIndex } from '../../src/renderer/components/library/library-keyboard';
import { SHORTCUTS, shortcutForEvent, shortcutCollisions, SHORTCUT_SCOPES } from '../../src/renderer/components/actions/shortcuts';
import { translations } from '../../src/renderer/translations';

const move = (key: string, index: number, dir: 'ltr' | 'rtl' = 'ltr', columns = 3, count = 8) =>
  libraryNavigationIndex({ key, index, dir, columns, count });

test('horizontal browsing follows English and Arabic reading directions', () => {
  assert.equal(move('ArrowRight', 2), 3);
  assert.equal(move('ArrowLeft', 2), 1);
  assert.equal(move('ArrowRight', 2, 'rtl'), 1);
  assert.equal(move('ArrowLeft', 2, 'rtl'), 3);
});

test('grid vertical keys use actual columns, with clamping on a partial last row', () => {
  assert.equal(move('ArrowDown', 1), 4);
  assert.equal(move('ArrowUp', 4), 1);
  assert.equal(move('ArrowDown', 5), 7);
  assert.equal(move('ArrowUp', 1), 1);
  assert.equal(move('ArrowDown', 6), 6);
  assert.equal(move('ArrowDown', 0, 'rtl', 2), 2);
});

test('list, boundaries, Home/End and empty or unknown navigation', () => {
  assert.equal(move('ArrowDown', 2, 'rtl', 1), 3);
  assert.equal(move('ArrowUp', 2, 'ltr', 1), 1);
  assert.equal(move('ArrowLeft', 0), 0);
  assert.equal(move('ArrowRight', 7), 7);
  assert.equal(move('Home', 4), 0);
  assert.equal(move('End', 0), 7);
  assert.equal(move('Escape', 0), null);
  assert.equal(move('ArrowDown', -1), null);
  assert.equal(move('ArrowDown', 0, 'ltr', 1, 0), null);
  assert.equal(move('End', 0, 'ltr', 1, 1), 0);
});

test('Library keys are scoped, guard typing/modifiers/composition and appear in bilingual help', () => {
  assert.equal(SHORTCUT_SCOPES.library, 'navLibrary');
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', 'Escape']) {
    const shortcut = shortcutForEvent({ key }, 'library');
    assert.ok(shortcut?.id.startsWith('library-'));
    assert.ok(translations.ar[shortcut.labelKey]);
    assert.ok(translations.en[shortcut.labelKey]);
    assert.equal(shortcutForEvent({ key, typing: true }, 'library'), null);
    assert.equal(shortcutForEvent({ key, isComposing: true }, 'library'), null);
    assert.equal(shortcutForEvent({ key, ctrlKey: true }, 'library'), null);
    assert.equal(shortcutForEvent({ key, target: { tagName: 'INPUT' } }, 'library'), null);
  }
  assert.equal(shortcutForEvent({ key: 'ArrowDown' }, 'notes'), null);
  assert.deepEqual(shortcutCollisions(SHORTCUTS), []);
});
