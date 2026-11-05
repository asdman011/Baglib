import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardsFromLine } from '../../src/shared/note-cards';

test('cards from a note line: cloze, question :: answer, question then answer line', () => {
  assert.deepEqual(cardsFromLine('- أركان الإسلام {{c1::خمسة}} أولها {{c2::الشهادتان::أول ركن}} #card'), [
    { front: 'أركان الإسلام […] أولها الشهادتان', back: 'أركان الإسلام **خمسة** أولها الشهادتان' },
    { front: 'أركان الإسلام خمسة أولها [أول ركن]', back: 'أركان الإسلام خمسة أولها **الشهادتان**' },
  ]);
  assert.deepEqual(cardsFromLine('Capital of Egypt :: Cairo'), [{ front: 'Capital of Egypt', back: 'Cairo' }]);
  assert.deepEqual(cardsFromLine('> ما معنى الصبر؟', 'حبس النفس على ما تكره'), [{ front: 'ما معنى الصبر؟', back: 'حبس النفس على ما تكره' }]);
  assert.deepEqual(cardsFromLine('A plain sentence.'), []);
  assert.deepEqual(cardsFromLine('Why?', ''), []);
  assert.deepEqual(cardsFromLine('   '), []);
});
