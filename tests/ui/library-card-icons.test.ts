import test from 'node:test';
import assert from 'node:assert/strict';
import { getCardActions } from '../../src/renderer/components/library/library-card-actions';
import type { BookItem } from '../../src/types/library';
import type { TranslationKey } from '../../src/renderer/translations';

// KEY-308: the card's right-click and ⋯ menus showed one placeholder ⓘ icon for every action.
const book: BookItem = {
  id: 'book-1', title: 'مقدمة ابن خلدون', author: 'ابن خلدون', bookType: 'digital', filePath: 'C:/books/a.pdf',
  categories: [], readingStatus: 'unread', lendingHistory: [], tags: [],
};
const t = (key: TranslationKey) => key;
const noop = () => {};

test('every library card action has its own icon, and only Book details uses Info', () => {
  const actions = getCardActions(book, {
    onRead: noop, onOpenDetails: noop, onUpdateReadingStatus: noop, onLend: noop, onDelete: noop, onAction: noop,
  }, t);
  assert.equal(actions.length, 14);
  const icons = actions.map(action => action.icon);
  assert.equal(new Set(icons).size, icons.length, 'icons repeat: ' + icons.join(', '));
  assert.deepEqual(actions.filter(action => action.icon === 'Info').map(action => action.id), ['details']);
});

test('the extra actions keep their order and their icons', () => {
  const actions = getCardActions(book, { onRead: noop, onOpenDetails: noop, onAction: noop }, t);
  assert.deepEqual(actions.map(action => [action.id, action.icon]), [
    ['read', 'BookOpen'], ['details', 'Info'],
    ['last', 'History'], ['metadata', 'FilePenLine'], ['category', 'FolderTree'], ['tags', 'Tags'],
    ['physical', 'BookMarked'], ['wishlist', 'Heart'], ['duplicates', 'CopyCheck'], ['folder', 'FolderOpen'], ['export', 'Download'],
  ]);
});
