import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commentaryStudyTarget } from '../../src/renderer/components/knowledge/PersonalCommentary';

// KEY-251: a commentary search result opens the source it was written on.
test('ayah references open in the reader, including the short form used by the ayah menu', () => {
  assert.equal(commentaryStudyTarget('quran:hafs:2:255'), 'quran:hafs:2:255');
  assert.equal(commentaryStudyTarget('quran:warsh:1:1'), 'quran:warsh:1:1');
  assert.equal(commentaryStudyTarget('quran:2:255'), 'quran:hafs:2:255');
});

test('references without a readable address stay plain text', () => {
  assert.equal(commentaryStudyTarget('hadith:12345'), null);
  assert.equal(commentaryStudyTarget('quran:999:1'), null);
  assert.equal(commentaryStudyTarget(''), null);
});
