import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterMarks, markKind, markPage, parseShapeMark, shapeFromDrag, shapeLocation, textStyleOf, type ListedMark } from '../../src/shared/pdf-markup';
import { normalizeArabicText } from '../../src/shared/utils/text-normalizer';

test('a drag makes the shape of the armed tool, in page percent', () => {
  assert.deepEqual(shapeFromDrag('rect', 3, { x: 40, y: 50 }, { x: 10, y: 20 }, 'rose'), { page: 3, shape: 'rect', color: 'rose', box: { x: 10, y: 20, width: 30, height: 30 } });
  assert.equal(shapeFromDrag('oval', 1, { x: 10, y: 10 }, { x: 10.5, y: 10.5 }, 'amber'), null, 'a click is not an empty shape');
  const arrow = shapeFromDrag('arrow', 1, { x: 10, y: 10 }, { x: 30, y: 5 }, 'sky')!;
  assert.deepEqual([arrow.from, arrow.to], [{ x: 10, y: 10 }, { x: 30, y: 5 }]);
  assert.deepEqual(shapeFromDrag('comment', 2, { x: 12, y: 34 }, { x: 12, y: 34 }, 'violet'), { page: 2, shape: 'pin', color: 'violet', box: { x: 12, y: 34, width: 0, height: 0 } });
  assert.equal(shapeFromDrag('text', 1, { x: 90, y: 97 }, { x: 90, y: 97 }, 'amber')!.box.width, 10, 'a clicked text box stays on the page');
  assert.equal(shapeFromDrag('rect', 1, { x: -20, y: 5 }, { x: 140, y: 30 }, 'nope')!.box.width, 100, 'points are kept on the page; unknown colours fall back');
  assert.equal(shapeFromDrag('highlight', 1, { x: 1, y: 1 }, { x: 50, y: 50 }, 'amber'), null);
});

test('a stored mark is read back and checked', () => {
  const mark = shapeFromDrag('arrow', 4, { x: 5, y: 5 }, { x: 25, y: 45 }, 'emerald')!;
  assert.deepEqual(parseShapeMark(shapeLocation(mark)), mark);
  assert.equal(parseShapeMark('{"page":1,"rects":[]}'), null, 'a highlight location is not a shape');
  assert.equal(parseShapeMark('{"page":0,"shape":"rect","box":{"x":1,"y":1,"width":5,"height":5}}'), null);
  assert.equal(parseShapeMark('{"page":1,"shape":"arrow","box":{"x":1,"y":1,"width":5,"height":5}}'), null, 'an arrow needs its points');
  assert.equal(parseShapeMark('{bad json'), null);
  assert.equal(parseShapeMark('12'), null);
});

test('text styles, kinds and pages', () => {
  assert.equal(textStyleOf('{"page":1,"rects":[],"style":"strike"}'), 'strike');
  assert.equal(textStyleOf('{"page":1,"rects":[]}'), 'highlight');
  assert.equal(textStyleOf('7'), 'highlight');
  assert.equal(markKind({ knowledgeType: 'highlight', location: '{"page":1,"style":"underline"}' }), 'underline');
  assert.equal(markKind({ knowledgeType: 'note', location: shapeLocation(shapeFromDrag('comment', 1, { x: 1, y: 1 }, { x: 1, y: 1 }, 'amber')!) }), 'pin');
  assert.equal(markKind({ knowledgeType: 'note', location: '3' }), 'note');
  assert.equal(markKind({ knowledgeType: 'question', location: '3' }), 'question');
  assert.equal(markPage('12'), 12);
  assert.equal(markPage('{"page":5,"rects":[]}'), 5);
  assert.equal(markPage('epubcfi(/6/2)'), null);
});

test('the annotations list filters both layers and sorts by page or date', () => {
  const marks: ListedMark[] = [
    { id: 'a', layer: 'study', kind: 'highlight', page: 9, color: 'amber', text: 'الصَّبْرُ ضياء', createdAt: '2026-11-05T09:00:00Z' },
    { id: 'b', layer: 'study', kind: 'pin', page: 2, color: 'rose', text: 'check this', createdAt: '2026-10-01T09:00:00Z', status: 'open' },
    { id: 'c', layer: 'review', kind: 'review', page: 4, text: 'Reviewer: typo', createdAt: '2026-11-04T09:00:00Z', status: 'resolved' },
    { id: 'd', layer: 'study', kind: 'underline', page: null, color: 'sky', text: 'x', createdAt: '2026-11-03T09:00:00Z' },
  ];
  const normalize = (text: string) => normalizeArabicText(text, { normalizeTaaMarbuta: false }).toLowerCase();
  const ids = (filter: Parameters<typeof filterMarks>[1]) => filterMarks(marks, filter, normalize, new Date('2026-11-05T12:00:00Z')).map(mark => mark.id);
  assert.deepEqual(ids({}), ['b', 'c', 'a', 'd'], 'by page, marks without a page last');
  assert.deepEqual(ids({ sort: 'newest' }), ['a', 'c', 'd', 'b']);
  assert.deepEqual(ids({ layer: 'review' }), ['c']);
  assert.deepEqual(ids({ query: 'الصبر' }), ['a'], 'search ignores tashkeel');
  assert.deepEqual(ids({ since: 'today' }), ['a']);
  assert.deepEqual(ids({ since: 'week' }), ['c', 'a', 'd']);
  assert.deepEqual(ids({ status: 'open' }), ['b']);
  assert.deepEqual(ids({ kind: 'underline' }), ['d']);
  assert.deepEqual(ids({ color: 'rose' }), ['b']);
});
