import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annotationsToNote } from '../../src/shared/annotation-note';
import { studyLinks } from '../../src/shared/study-notes';

test('a note from annotations lists quotes in page order with page links, skipping generated text and ink', () => {
  const at = (id: string, page: number | string, extra: object) => ({ id, bookId: 'b1', locationCfiOrPage: typeof page === 'number' ? JSON.stringify({ page, rects: [] }) : page, createdAt: id, ...extra });
  const content = annotationsToNote([
    at('3', 12, { type: 'highlight', selectedText: 'العلم قبل القول والعمل', noteContent: 'Highlight on Page 12' }),
    at('1', '3', { type: 'note', selectedText: 'first line\nsecond line', noteContent: 'My thought — فكرتي' }),
    at('2', 5, { type: 'highlight', selectedText: 'quoted', noteContent: 'Selected Quote: "quoted"' }),
    at('4', 7, { type: 'ink', selectedText: null, noteContent: null }),
    at('5', 9, { type: 'bookmark', selectedText: null, noteContent: null }),
  ], { id: 'b1', title: 'رياض الصالحين' });
  assert.equal(content, [
    '## رياض الصالحين',
    '> first line\n> second line [[book:b1#p=3|رياض الصالحين (3)]]\n\nMy thought — فكرتي',
    '> quoted [[book:b1#p=5|رياض الصالحين (5)]]',
    '[[book:b1#p=9|رياض الصالحين (9)]]',
    '> العلم قبل القول والعمل [[book:b1#p=12|رياض الصالحين (12)]]',
  ].join('\n\n'));
  assert.deepEqual(studyLinks(content).map(link => link.target), ['book:b1#p=3', 'book:b1#p=5', 'book:b1#p=9', 'book:b1#p=12']);
});
