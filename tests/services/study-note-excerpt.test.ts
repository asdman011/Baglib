import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studyNoteExcerpt } from '../../src/shared/study-notes';

// The notes list shows readable text: link labels, no paragraph anchors, no Markdown or callout marks.
test('excerpts replace links with their labels and drop anchors and marks', () => {
  const content = [
    '## الصبر والشكر',
    'الصبر حبس النفس عن الجزع. ^xa0oo8',
    '> [!ayah] آية الكرسي',
    '[[note:source-note#^thanks|الشكر قيد النعم]] و ![[note:source-note#^p1|embed]]',
    'قول **مهم**[^1] و [[supports::note:claim|الصبر واجب]]',
    '[^1]: المصدر',
    '[[book:b@src#p=3|رياض الصالحين (3)]] — Patience is light.',
  ].join('\n');
  const text = studyNoteExcerpt(content);
  assert.equal(text, 'الصبر والشكر الصبر حبس النفس عن الجزع. آية الكرسي الشكر قيد النعم و embed قول مهم و الصبر واجب المصدر رياض الصالحين (3) — Patience is light.');
  assert.ok(!/\^|\[\[|\]\]|\*\*|\[!/u.test(text));
});

test('long notes are cut with an ellipsis, and code-like text is kept readable', () => {
  const long = 'أ'.repeat(300);
  const text = studyNoteExcerpt(long, 50);
  assert.equal(text.length, 50);
  assert.ok(text.endsWith('…'));
  assert.equal(studyNoteExcerpt(''), '');
  assert.equal(studyNoteExcerpt('use `code` here'), 'use code here');
});
