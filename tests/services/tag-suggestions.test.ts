import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestTags, tagSearchKey } from '../../src/shared/tag-suggestions';
import type { TagWithCount } from '../../src/shared/types/tag';

const tags: TagWithCount[] = ['العِلْم', 'علم الحديث', 'Study', 'Study skills'].map((name, index) => ({ id: String(index), name, origin: 'manual', category: null, workCount: index }));
test('Arabic search ignores vocalization without changing names or merging ambiguous letters', () => {
  assert.equal(suggestTags(tags, [], 'العلم')[0].name, 'العِلْم');
  assert.equal(tagSearchKey('إِيمَان'), 'ايمان');
  assert.notEqual(tagSearchKey('رحمة'), tagSearchKey('رحمه'));
  assert.equal(tags[0].name, 'العِلْم');
});
test('exact matches outrank prefixes and popularity ranks empty queries', () => {
  assert.equal(suggestTags(tags, [], 'study')[0].name, 'Study');
  assert.equal(suggestTags(tags, [], '')[0].name, 'Study skills');
  assert.deepEqual(suggestTags(tags, ['STUDY'], 'study').map(tag => tag.name), ['Study skills']);
  assert.equal(suggestTags(tags, [], '', 2).length, 2);
});
