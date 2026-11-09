import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignWarshSurah, overlapText, assertHafsCoverage } from '../../src/main/services/quran/warsh-overlap';
const rows = (ayahs: string[][]) => ayahs.flatMap((words, i) => words.map(text => ({ ayah: i + 1, text })));
test('overlap retains both later Hafs ayahs in the earlier Warsh ayah, including joined words', () => {
  assert.deepEqual(alignWarshSurah(rows([['alpha'], ['beta', 'gamma'], ['delta']]), rows([['alpha', 'betagamma'], ['delta']])), { 1: [1, 2], 2: [3] });
});
test('ambiguous ayah boundaries fail rather than choosing a numbering', () => {
  assert.throws(() => alignWarshSurah(rows([['alpha'], ['alpha']]), rows([['alpha']])), /ambiguous-alignment/);
});
test('Al-Fatiha attaches uncounted basmala before Hafs2 and maps the split last ayah twice', () => {
  const hafs = rows([['بسم', 'الله', 'الرحمن', 'الرحيم'], ['الحمد'], ['الرحمن'], ['ملك'], ['إياك'], ['اهدنا'], ['صراط', 'غير']]);
  const warsh = rows([['الحمد'], ['الرحمن'], ['ملك'], ['إياك'], ['اهدنا'], ['صراط'], ['غير']]);
  assert.deepEqual(alignWarshSurah(hafs, warsh, true), { 1: [1, 2], 2: [3], 3: [4], 4: [5], 5: [6], 6: [7], 7: [7] });
});
test('comparison strips marks and alif variants without conflating taa marbuta and haa', () => {
  assert.equal(overlapText('۞ إِبْرَٰهِـيمَ'), 'ابرهيم');
  assert.notEqual(overlapText('رحمة'), overlapText('رحمه'));
  assert.equal(overlapText('١٢٣۞'), '');
});
test('split/join reading variants preserve the same ayah mapping', () => {
  assert.deepEqual(alignWarshSurah(rows([['حطبا'], ['وألو', 'استقموا']]), rows([['حطبا'], ['وأن', 'لو', 'استقموا']])), { 1: [1], 2: [2] });
});

test('Al-Fatiha that counts the basmala keeps its direct attachment without duplicating on the next ayah', () => {
  const counted = rows([['بسم', 'الله', 'الرحمن', 'الرحيم'], ['الحمد']]);
  assert.deepEqual(alignWarshSurah(counted, counted, true), { 1: [1], 2: [2] });
});
test('coverage reports each unattached Hafs reference even when reference counts match', () => {
  assert.throws(() => assertHafsCoverage({ 1: [2, 3], 2: [7] }, [1, 2, 3, 4], 1), /unattached-hafs-ayahs: 1:1, 1:4/);
  assert.doesNotThrow(() => assertHafsCoverage({ 1: [1, 2], 2: [3, 4] }, [1, 2, 3, 4], 1));
});
