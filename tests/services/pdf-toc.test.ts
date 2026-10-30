import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  flatToNestedBookmarks,
  nestedToFlatBookmarks,
  type TocTreeNode,
} from '../../src/renderer/components/reader/PdfTocEditor';

test('flatToNestedBookmarks correctly structures hierarchical children based on level', () => {
  const flatNodes: TocTreeNode[] = [
    { id: '1', title: 'Chapter 1', pageNumber: 1, level: 0 },
    { id: '2', title: 'Section 1.1', pageNumber: 3, level: 1 },
    { id: '3', title: 'Section 1.2', pageNumber: 5, level: 1 },
    { id: '4', title: 'Subsection 1.2.1', pageNumber: 7, level: 2 },
    { id: '5', title: 'Chapter 2', pageNumber: 12, level: 0 },
  ];

  const nested = flatToNestedBookmarks(flatNodes);

  assert.equal(nested.length, 2, 'Should have 2 top-level chapters');
  assert.equal(nested[0].title, 'Chapter 1');
  assert.equal(nested[0].pageNumber, 1);
  assert.ok(nested[0].children, 'Chapter 1 should have children');
  assert.equal(nested[0].children!.length, 2, 'Chapter 1 should have 2 sections');
  assert.equal(nested[0].children![0].title, 'Section 1.1');
  assert.equal(nested[0].children![1].title, 'Section 1.2');
  assert.equal(nested[0].children![1].children!.length, 1);
  assert.equal(nested[0].children![1].children![0].title, 'Subsection 1.2.1');
  assert.equal(nested[1].title, 'Chapter 2');
  assert.equal(nested[1].pageNumber, 12);
  assert.equal(nested[1].children, undefined);
});

test('nestedToFlatBookmarks and flatToNestedBookmarks roundtrip structure', () => {
  const originalNested = [
    {
      title: 'Introduction',
      pageNumber: 1,
      children: [
        { title: 'Background', pageNumber: 2 },
        { title: 'Methodology', pageNumber: 5 },
      ],
    },
    {
      title: 'Conclusion',
      pageNumber: 10,
    },
  ];

  const flat = nestedToFlatBookmarks(originalNested);
  assert.equal(flat.length, 4);
  assert.equal(flat[0].level, 0);
  assert.equal(flat[1].level, 1);
  assert.equal(flat[2].level, 1);
  assert.equal(flat[3].level, 0);

  const reNested = flatToNestedBookmarks(flat);
  assert.equal(reNested.length, 2);
  assert.equal(reNested[0].title, 'Introduction');
  assert.equal(reNested[0].children?.length, 2);
  assert.equal(reNested[1].title, 'Conclusion');
});
test('TOC JSON import rejects malformed and oversized trees', () => {
  for (const input of [[null], [{ title: 1, pageNumber: 1 }], [{ title: 'Heading', pageNumber: 0 }], [{ title: 'Heading', pageNumber: 1, children: 'invalid' }]]) assert.throws(() => nestedToFlatBookmarks(input));
  assert.throws(() => nestedToFlatBookmarks(Array.from({ length: 2001 }, () => ({ title: 'Heading', pageNumber: 1 }))));
  let node: unknown = { title: 'Deep', pageNumber: 1 };
  for (let depth = 0; depth < 34; depth++) node = { title: 'Parent', pageNumber: 1, children: [node] };
  assert.throws(() => nestedToFlatBookmarks([node]));
});
