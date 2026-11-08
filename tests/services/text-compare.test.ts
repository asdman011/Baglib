import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareEditions } from '../../src/shared/text-compare';

test('identical editions have no differences', () => {
  const pages = [{ page: 1, text: 'بسم الله الرحمن الرحيم' }, { page: 2, text: 'الحمد لله' }];
  assert.deepEqual(compareEditions(pages, pages).hunks, []);
});

test('a changed, an added and a removed word are found with their pages and context', () => {
  const a = [{ page: 1, text: 'العلم قبل القول والعمل' }, { page: 2, text: 'وطلب العلم فريضة على كل مسلم' }];
  const b = [{ page: 1, text: 'العلم قبل القول والعمل' }, { page: 2, text: 'وطلب العلم فريضة واجبة على كل مسلم ومسلمة' }, { page: 3, text: 'خاتمة' }];
  const result = compareEditions(a, b);
  assert.deepEqual(result.hunks.map(hunk => [hunk.removed, hunk.added, hunk.aPage, hunk.bPage]), [['', 'واجبة', 2, 2], ['', 'ومسلمة خاتمة', 2, 2]]);
  assert.equal(result.hunks[0].before, 'قبل القول والعمل وطلب العلم فريضة', 'six words of context');
  assert.equal(result.addedWords, 3);
  const replaced = compareEditions([{ page: 4, text: 'قال الشيخ رحمه الله' }], [{ page: 7, text: 'قال المصنف رحمه الله' }]);
  assert.deepEqual(replaced.hunks.map(hunk => [hunk.removed, hunk.added, hunk.aPage, hunk.bPage]), [['الشيخ', 'المصنف', 4, 7]]);
});

test('differences in tashkeel alone can be ignored', () => {
  const a = [{ page: 1, text: 'الصَّبْرُ ضِيَاءٌ' }], b = [{ page: 1, text: 'الصبر ضياء' }];
  assert.equal(compareEditions(a, b).hunks.length, 1);
  assert.equal(compareEditions(a, b, { ignoreDiacritics: true }).hunks.length, 0);
});

test('unrelated books stop at the cap instead of running away', () => {
  const a = [{ page: 1, text: Array.from({ length: 300 }, (_, index) => `a${index}`).join(' ') }];
  const b = [{ page: 1, text: Array.from({ length: 300 }, (_, index) => `b${index}`).join(' ') }];
  const result = compareEditions(a, b, { maxDifferences: 100 });
  assert.equal(result.tooDifferent, true);
  assert.equal(compareEditions(a, b).tooDifferent, false);
});

test('a lone mark split off by PDF extraction stays with its word', () => {
  const a = [{ page: 1, text: 'الصَّبْر ُ ضياء' }], b = [{ page: 1, text: 'الصبر ضياء' }];
  assert.equal(compareEditions(a, b, { ignoreDiacritics: true }).hunks.length, 0);
  assert.deepEqual(compareEditions(a, b).hunks.map(hunk => [hunk.removed, hunk.added]), [['الصَّبْرُ', 'الصبر']]);
});
