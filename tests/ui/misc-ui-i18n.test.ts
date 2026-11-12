import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { translations } from '../../src/renderer/translations';

const read = (file: string) => fs.readFileSync(path.resolve('src/renderer/components', file), 'utf8');

// Hardcoded Arabic labels found by the post-KEY-309 scan now go through translations.
test('highlight note, question choices, app lock and khatmah labels carry no Arabic literals', () => {
  for (const file of ['reader/HighlightActionPopover.tsx', 'knowledge/QuestionCardEditor.tsx', 'security/AppLockModal.tsx', 'dashboard/KhatmahDashboardModule.tsx']) {
    assert.equal(/[؀-ۿ]/u.test(read(file)), false, file);
  }
  const toc = read('reader/ZenTocDrawer.tsx');
  assert.ok(toc.includes("t('readerNoBookmarks')") && toc.includes("t('readerBookmarkOnPage'"));
  const categories = read('categories/CategoriesOverviewView.tsx');
  assert.ok(categories.includes("t('categoryArabicNameRequired')") && categories.includes("t('categoryReassignTargetRequired')"));
});

test('the new keys exist in both languages and fill their values', () => {
  for (const key of ['highlightNotePlaceholder', 'readerNoBookmarks', 'readerBookmarkOnPage', 'questionChoicesPlaceholder', 'appLockOrPin', 'khatmahPagesShort', 'categoryArabicNameRequired', 'categoryReassignTargetRequired'] as const) {
    assert.ok(translations.ar[key] && translations.en[key], key);
  }
  assert.equal(translations.en.readerBookmarkOnPage.replace('{page}', '12'), 'Bookmark on page 12');
  assert.equal(translations.ar.khatmahPagesShort.replace('{count}', '٥'), '٥ ص');
  assert.equal(translations.en.questionChoicesPlaceholder.split('\n').length, 3);
});
