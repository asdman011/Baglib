import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupThemeLabels } from '../../src/renderer/components/quran/quran-theme-labels';
import type { QuranAyahTheme } from '../../src/shared/types/quran';

const row = (theme: string, extra: Partial<QuranAyahTheme> = {}): QuranAyahTheme => ({
  theme, surahNumber: 1, ayahFrom: 5, ayahTo: 7, keywords: [], totalAyahs: 3, ...extra,
});

for (const label of ['Supplication to Allah for guidance taught by Allah Himself', 'دُعَاءُ الهداية — Guidance']) {
  test(`margin shows a repeated theme only once: ${label}`, () => {
    const input = [row(label), row(`  ${label.replaceAll(' ', '  ')}\n`), row(label)];
    const snapshot = structuredClone(input);
    assert.deepEqual(groupThemeLabels(input), [row(label)]);
    assert.deepEqual(input, snapshot, 'canonical source objects are unchanged');
  });
}

test('preserves distinct labels, Arabic diacritics, surahs and verse ranges', () => {
  const result = groupThemeLabels([
    row('الهداية'), row('الهداية'), row('الْهِدَايَة'), row('Guidance'), row('Guidance'),
    row('الهداية', { surahNumber: 2 }), row('الهداية', { ayahFrom: 6 }), row('   '),
  ]);
  assert.equal(result.length, 3);
  assert.equal(result[0].theme, 'الهداية\nالْهِدَايَة\nGuidance');
  assert.equal(result[1].surahNumber, 2);
  assert.equal(result[2].ayahFrom, 6);
  assert.deepEqual(groupThemeLabels([row('  ')]), []);
});
