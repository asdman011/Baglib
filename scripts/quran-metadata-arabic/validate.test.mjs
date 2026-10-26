import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRow, latinText, reviewScope, reviewValue } from './validate.mjs';

const definition = { fields: ['name', 'description'] };
test('Arabic source values, keys, IDs and embedded Arabic remain unchanged', () => {
  const source = { _rowid: 1, name: 'Mercy', description: '<b>Mercy</b> <span class="ar">الرحمة</span>', arabic_name: 'الرحمة' };
  const translated = { ...source, name: 'الرحمة', description: '<b>الرحمة</b> <span class="ar">الرحمة</span>' };
  assert.deepEqual(validateRow(source, translated, definition, '', {}), []);
  assert.ok(validateRow(source, { ...translated, _rowid: 2 }, definition, '', {}).some(issue => issue.issue === 'immutable-value-changed'));
  assert.ok(validateRow(source, { ...translated, description: '<b>الرحمة</b> <span class="ar">رأفة</span>' }, definition, '', {}).some(issue => issue.issue.startsWith('existing-arabic')));
});
test('HTML attributes and technical links are not translated or silently normalized', () => {
  const source = { _rowid: 2, name: 'Faith', description: '<topic data-id="12">Faith</topic>' };
  assert.deepEqual(validateRow(source, { ...source, name: 'الإيمان', description: '<topic data-id="12">الإيمان</topic>' }, definition, '', {}), []);
  assert.ok(validateRow(source, { ...source, name: 'الإيمان', description: '<topic data-id="13">الإيمان</topic>' }, definition, '', {}).some(issue => issue.issue === 'html-markup-changed'));
  assert.equal(latinText('<span class="ar">العلم</span>'), false);
});
test('untranslated text, empty values and fabricated Quranic text cannot pass validation', () => {
  const source = { _rowid: 3, name: 'Praise', description: 'Praise' };
  const canonical = 'ٱلۡحَمۡدُ لِلَّهِ رَبِّ ٱلۡعَٰلَمِينَ';
  assert.ok(validateRow(source, { ...source, description: 'Praise' }, definition, canonical, {}).some(issue => issue.issue === 'untranslated-latin-text'));
  assert.ok(validateRow(source, { ...source, name: '', description: 'ثناء' }, definition, canonical, {}).some(issue => issue.issue === 'missing-translation'));
  assert.ok(validateRow(source, { ...source, name: 'الحمد', description: '﴿الحمد لله رب العالمين﴾' }, definition, canonical, {}).some(issue => issue.issue === 'unverified-quran-quotation'));
  assert.deepEqual(validateRow(source, { ...source, name: 'الحمد', description: `﴿${canonical}﴾` }, definition, canonical, {}), []);
});

test('a known corrupt source regex is preserved as technical data only in its original field', () => {
  const artifact = 'v?v?\\.?\\s*[0-9]+\\s*-\\s*[0-9]+';
  const source = { _rowid: 19, text: `Narrative ${artifact}` };
  const translated = { _rowid: 19, text: `السرد ${artifact}` };
  const definition = { group: 'surahs', fields: ['text'] };
  assert.deepEqual(validateRow(source, translated, definition, '', {}), []);
  assert.ok(validateRow({ ...source, _rowid: 20 }, { ...translated, _rowid: 20 }, definition, '', {}).some(issue => issue.issue === 'untranslated-latin-text'));
});

test('review coverage binds array, multi-field and batch-wide reports to the exact translated values', () => {
  const translations = new Map([[1, { text: 'نص', short_text: 'ملخص' }], [2, { text: 'نص آخر', short_text: 'ملخص آخر' }]]);
  const scope = reviewScope({ rowid: [2, 1], field: 'text; short_text' }, [1, 2], {}, ['text', 'short_text']);
  assert.deepEqual(scope, { rows: [1, 2], fields: ['text', 'short_text'] });
  const original = reviewValue(scope, translations);
  translations.get(2).short_text = 'تعديل';
  assert.notEqual(reviewValue(scope, translations), original);
  assert.deepEqual(reviewScope({ file: '001.json', field: 'text' }, [1, 2], { '001.json': [2] }, ['text']), { rows: [2], fields: ['text'] });
  assert.deepEqual(reviewScope({ rowids: [2], fields: ['text'] }, [1, 2], {}, ['text', 'short_text']), { rows: [2], fields: ['text'] });
});
