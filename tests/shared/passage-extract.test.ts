import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractPassages } from '../../src/shared/passage-extract';
describe('whole passage extraction', () => {
  it('keeps a whole English paragraph and exact source offsets', () => {
    const text = 'Before.\n\n  A paragraph about learning. It has another sentence!  \n\nAfter.';
    const [hit] = extractPassages(text, 'learning');
    assert.equal(hit.text, 'A paragraph about learning. It has another sentence!');
    assert.equal(text.slice(hit.start, hit.end), hit.text);
  });
  it('uses complete sentences beyond the paragraph preference, never clipped snippets', () => {
    const [hit] = extractPassages('Before. The searchable sentence keeps all of its ending! After.', 'searchable', { maxLength: 10 });
    assert.equal(hit.text, 'The searchable sentence keeps all of its ending!');
  });
  it('matches Arabic diacritics and alef variants while preserving canonical text', () => {
    const text = 'هذا عِلْم نافع.\n\nأحكام اللغة.';
    assert.equal(extractPassages(text, 'علم')[0].text, text.split('\n')[0]);
    assert.equal(extractPassages(text, 'احكام')[0].text, 'أحكام اللغة.');
  });
  it('does not conflate taa marbuta/haa and obeys limits', () => {
    assert.deepEqual(extractPassages('مدرسة', 'مدرسه'), []);
    assert.equal(extractPassages('Learning.\n\nLearning again.', 'learning', { limit: 1 }).length, 1);
    assert.deepEqual(extractPassages('Text.', ''), []);
  });
});
