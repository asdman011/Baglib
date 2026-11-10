import test from 'node:test';
import assert from 'node:assert/strict';
import { translations, type TranslationKey } from '../../src/renderer/translations';
import { taskCountLabel } from '../../src/renderer/utils/task-count';

const tr = (lang: 'ar' | 'en') => (key: TranslationKey, params?: Record<string, string | number>) =>
  String((translations[lang] as Record<string, string>)[key]).replace('{count}', String(params?.count ?? ''));

// KEY-308: "1 tasks", and one Arabic form for every count.
test('Arabic task counts use the one, two, few and many forms', () => {
  const t = tr('ar');
  assert.equal(taskCountLabel(1, 'ar', t), 'مهمة واحدة');
  assert.equal(taskCountLabel(2, 'ar', t), 'مهمتان');
  assert.equal(taskCountLabel(3, 'ar', t), '3 مهام');
  assert.equal(taskCountLabel(10, 'ar', t), '10 مهام');
  assert.equal(taskCountLabel(11, 'ar', t), '11 مهمة');
  assert.equal(taskCountLabel(100, 'ar', t), '100 مهمة');
});

test('English task counts are singular only for one', () => {
  const t = tr('en');
  assert.equal(taskCountLabel(1, 'en', t), '1 task');
  assert.equal(taskCountLabel(2, 'en', t), '2 tasks');
  assert.equal(taskCountLabel(11, 'en', t), '11 tasks');
});
