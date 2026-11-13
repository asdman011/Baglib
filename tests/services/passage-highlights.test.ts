import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareWords, parseQuranHighlight, quranRangeLocation, wordInRange } from '../../src/shared/passage-highlights';
import { locateText } from '../../src/renderer/libs/reader/text-highlights';

// KEY-340: colour highlights on Quran word ranges (across ayahs), whole ayahs, hadith text and verses.
test('a dragged word range is stored start-first whichever way it was dragged', () => {
  assert.equal(quranRangeLocation('hafs', { surah: 2, ayah: 256, word: 3 }, { surah: 2, ayah: 255, word: 7 }), 'quran:hafs:2:255:7-2:256:3');
  const range = parseQuranHighlight('quran:hafs:2:255:7-2:256:3')!;
  assert.equal(range.wholeAyahs, false);
  assert.ok(wordInRange({ surah: 2, ayah: 255, word: 9 }, range), 'the rest of the first ayah');
  assert.ok(wordInRange({ surah: 2, ayah: 256, word: 1 }, range), 'the start of the next ayah');
  assert.ok(!wordInRange({ surah: 2, ayah: 256, word: 4 }, range));
  assert.ok(!wordInRange({ surah: 2, ayah: 255, word: 6 }, range));
});

test('a whole-ayah highlight covers every word of the ayah, in either reading', () => {
  const range = parseQuranHighlight('quran:warsh:1:1')!;
  assert.equal(range.profile, 'warsh');
  assert.ok(range.wholeAyahs);
  assert.ok(wordInRange({ surah: 1, ayah: 1, word: 4 }, range));
  assert.ok(!wordInRange({ surah: 1, ayah: 2, word: 1 }, range));
  assert.equal(parseQuranHighlight('sunnah:Bukhari:1:1'), null);
  assert.ok(compareWords({ surah: 1, ayah: 7, word: 9 }, { surah: 2, ayah: 1, word: 1 }) < 0);
});

test('highlighted hadith words are found across inline elements of the rendered text', () => {
  const pieces = ['حدثنا ', 'عبد الله', ' قال: إنما الأعمال بالنيات'];
  assert.deepEqual(locateText(pieces, 'الله قال: إنما'), { start: [1, 4], end: [2, 10] });
  assert.equal(locateText(pieces, 'غير موجود'), null);
  assert.equal(locateText(pieces, '   '), null);
});
