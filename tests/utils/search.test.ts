import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearchString, matchesSearchQuery } from '../../src/renderer/utils/search';

describe('Search Normalizer & Query Matcher', () => {
  it('normalizes Arabic alefs, taa marbuta, and alef maqsura', () => {
    assert.strictEqual(normalizeSearchString('الإمام أحمد'), 'الامام احمد');
    assert.strictEqual(normalizeSearchString('مقدمة ابن خلدون'), 'مقدمه ابن خلدون');
    assert.strictEqual(normalizeSearchString('البخاري ومسلم'), 'البخاري ومسلم');
    assert.strictEqual(normalizeSearchString('على بن أبي طالب'), 'علي بن ابي طالب');
  });

  it('strips Arabic tashkeel / harakat and tatweel', () => {
    assert.strictEqual(normalizeSearchString('صَحِيحُ البُخَارِيّ'), 'صحيح البخاري');
    assert.strictEqual(normalizeSearchString('كِـتَـابٌ'), 'كتاب');
  });

  it('matches regardless of alef variations, tashkeel, or taa marbuta', () => {
    const bookTitle = 'المقدمة في التاريخ';
    assert.strictEqual(matchesSearchQuery(bookTitle, 'مقدمه'), true);
    assert.strictEqual(matchesSearchQuery(bookTitle, 'تاريخ'), true);
    assert.strictEqual(matchesSearchQuery(bookTitle, 'المقدمة'), true);
  });

  it('matches multi-token queries across whole target text', () => {
    const bookContent = 'المقدمة ابن خلدون دار القلم 2005 التاريخ';
    assert.strictEqual(matchesSearchQuery(bookContent, 'ابن خلدون مقدمه'), true);
    assert.strictEqual(matchesSearchQuery(bookContent, 'خلدون 2005'), true);
    assert.strictEqual(matchesSearchQuery(bookContent, 'تاريخ القلم'), true);
    assert.strictEqual(matchesSearchQuery(bookContent, 'ابن تيمية'), false);
  });

  it('safely handles null, undefined, and non-string inputs', () => {
    assert.strictEqual(normalizeSearchString(null), '');
    assert.strictEqual(normalizeSearchString(undefined), '');
    assert.strictEqual(matchesSearchQuery('', 'test'), false);
    assert.strictEqual(matchesSearchQuery('something', ''), true);
  });
});
