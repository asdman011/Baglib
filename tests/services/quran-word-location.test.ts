import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateQuranWordLocation, quranWordCompatibility } from '../../src/shared/quran-word-location';
const index = new Map([['1:1', new Set([1,2])], ['37:130', new Set([1,2,3])]]);
test('word locations require three canonical positive integer positions and reject markers', () => {
  assert.deepEqual(validateQuranWordLocation('1:1:2', index), {surah:1,ayah:1,word:2,location:'1:1:2'});
  for (const value of [null, 1, '', '1:1', '1:1:1:2', '1:1:1junk', '01:1:1', '1:1:1.0', '1:1:-1', '0:1:1', '115:1:1', '1:287:1', '1:2:1', '1:1:3', '37:130:4', ' 1:1:1']) assert.equal(validateQuranWordLocation(value, index), null, String(value));
});
test('37:130 compatibility is explicit, Hafs-only and never changes positions', () => {
 assert.equal(quranWordCompatibility('hafs',37,130),'qul-37-130');
 assert.equal(quranWordCompatibility('warsh',37,130),undefined);
 assert.equal(quranWordCompatibility('hafs',37,129),undefined);
 assert.ok(validateQuranWordLocation('37:130:3',index));
 assert.equal(validateQuranWordLocation('37:130:4',index),null);
});
