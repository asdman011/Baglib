import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { translations } from '../../src/renderer/translations';

// KEY-309: the reader's selection note/quote/question boxes used hardcoded Arabic labels and an English "p.".
test('reader selection menu has no hardcoded Arabic text and its keys exist in both languages', () => {
  const source = fs.readFileSync(path.resolve('src/renderer/components/reader/ZenSelectionMenu.tsx'), 'utf8');
  assert.equal(/[؀-ۿ]/u.test(source), false, 'no Arabic literals in ZenSelectionMenu');
  assert.equal(source.includes('(p. '), false, 'page reference goes through translations');
  for (const key of ['zenNotePlaceholder', 'zenQuotePlaceholder', 'zenQuestionPlaceholder', 'zenSaveNote', 'zenSaveQuote', 'zenSaveQuestion', 'zenPageRef', 'zenCitation', 'zenCitationUnknownAuthor', 'zenCitationPrivateEdition'] as const) {
    assert.ok(source.includes(`t('${key}'`), `${key} is used`);
    assert.ok(translations.ar[key] && translations.en[key], `${key} exists in ar and en`);
  }
  assert.equal(translations.en.zenCitation.replace('{title}', 'T').replace('{author}', 'A').replace('{publisher}', 'P').replace('{page}', '3'), '[T - A, P, p. 3]');
  assert.equal(translations.ar.zenPageRef.replace('{page}', '٣'), 'ص ٣');
});
