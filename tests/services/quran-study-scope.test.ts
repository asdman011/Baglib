import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quranStudyReferences } from '../../src/shared/quran-study-scope';

const words = [{ surah: 1, ayah: 7 }, { surah: 1, ayah: 7 }, { surah: 2, ayah: 1 }];
test('ayah study panels never expand to unrelated page ayahs', () => {
  const selected = { surah: 1, ayah: 7, wordText: 'العِلْم' };
  for (const tool of ['topics', 'themes', 'tafsir', 'translation', 'meanings', 'morphology']) assert.deepEqual(quranStudyReferences(tool, selected, words), [selected]);
});
test('explicit page panels deduplicate ayahs without losing surah identity', () => {
  assert.deepEqual(quranStudyReferences('topics', { surah: 1, ayah: 7, wholePage: true }, words), [{ surah: 1, ayah: 7 }, { surah: 2, ayah: 1 }]);
  const reference = { surah: 1, ayah: 7, wholePage: true };
  assert.deepEqual(quranStudyReferences('morphology', reference, words), [reference]);
  assert.equal(words.length, 3);
});
