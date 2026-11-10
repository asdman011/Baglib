import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_DIRECTORY, searchSettings } from '../../src/renderer/components/layout/settings-directory-model';
import { translations } from '../../src/renderer/translations';

test('settings search matches every Arabic and English name and description', () => {
  for (const entry of SETTINGS_DIRECTORY) for (const language of ['ar', 'en'] as const) {
    assert.ok(searchSettings(translations[language][entry.label]).includes(entry), `${entry.id} ${language} name`);
    assert.ok(searchSettings(translations[language][entry.description]).includes(entry), `${entry.id} ${language} description`);
  }
});
test('settings search normalizes tashkeel, tatweel and hamza variants', () => {
  assert.ok(searchSettings('إلذَّكاء الاصْطِنَاعِيّ').some(entry => entry.id === 'ai'));
  assert.ok(searchSettings('الــقُرْآن').some(entry => entry.id === 'quran'));
  assert.ok(searchSettings('ادارة التخزين').some(entry => entry.id === 'storage'));
});
test('settings search accepts case-insensitive and mixed-script tokens', () => {
  assert.ok(searchSettings('API مفاتيح').some(entry => entry.id === 'ai'));
  assert.ok(searchSettings('SCHOLAR night').some(entry => entry.id === 'theme'));
  assert.ok(searchSettings('KOReader مزامنة').some(entry => entry.id === 'sync'));
});
test('new Arabic settings strings contain Arabic text', () => {
  for (const entry of SETTINGS_DIRECTORY) {
    assert.match(translations.ar[entry.label], /[\u0600-\u06ff]/);
    assert.match(translations.ar[entry.description], /[\u0600-\u06ff]/);
    assert.ok(!translations.ar[entry.description].includes('???'));
  }
});
test('empty query lists all entries and unmatched input lists none', () => {
  assert.equal(searchSettings('   ').length, SETTINGS_DIRECTORY.length);
  assert.deepEqual(searchSettings('zzzznonexistentsetting'), []);
  assert.equal(new Set(SETTINGS_DIRECTORY.map(entry => entry.id)).size, SETTINGS_DIRECTORY.length);
});
