import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readerAssetUrl } from '../../src/shared/utils/reader-asset-url';
import { normalizePdfUrl, extractDiskPathFromUrl } from '../../src/renderer/components/reader/PdfNativeViewer';

it('preserves Windows paths containing Arabic, fragments, queries and percent signs', () => {
  const filePath = 'D:\\كتب\\Research #1? 100%.pdf';
  const url = readerAssetUrl(filePath);
  assert.equal(url.includes('#'), false);
  assert.equal(url.includes('?'), false);
  assert.equal(url.startsWith('baglib-asset:///D:/'), true);
  assert.equal(url.includes('D%3A'), false);
  assert.equal(decodeURIComponent(url.replace('baglib-asset:///', '')), filePath.replace(/\\/g, '/'));
});

it('preserves Unix absolute paths and literal encoded characters', () => {
  assert.equal(readerAssetUrl('/books/a%20b.epub'), 'baglib-asset:///books/a%2520b.epub');
});

it('handles Windows drive letters with various path styles', () => {
  const path1 = 'F:\\كتب\\Books\\Books\\How Europe Underdeveloped Africa - Walter Rodney.pdf';
  const url1 = readerAssetUrl(path1);
  assert.equal(url1.startsWith('baglib-asset:///F:/'), true);
  assert.equal(url1.includes('F%3A'), false);
  assert.equal(decodeURIComponent(url1.replace('baglib-asset:///', '')), path1.replace(/\\/g, '/'));

  const path2 = 'C:/Users/user/doc.pdf';
  const url2 = readerAssetUrl(path2);
  assert.equal(url2, 'baglib-asset:///C:/Users/user/doc.pdf');
});

it('normalizePdfUrl repairs %3A in drive letters of incoming URLs', () => {
  const badUrl = 'baglib-asset:///F%3A/%D9%83%D8%AA%D8%A8/Books/test.pdf?revision=0';
  const fixed = normalizePdfUrl(badUrl);
  assert.equal(fixed, 'baglib-asset:///F:/%D9%83%D8%AA%D8%A8/Books/test.pdf?revision=0');

  const rawPath = 'F:\\كتب\\book.pdf';
  const fromPath = normalizePdfUrl(rawPath);
  assert.equal(fromPath?.startsWith('baglib-asset:///F:/'), true);
});

it('extractDiskPathFromUrl correctly resolves local filesystem paths', () => {
  const url1 = 'baglib-asset:///F:/%D9%83%D8%AA%D8%A8/Books/test.pdf?revision=0';
  assert.equal(extractDiskPathFromUrl(url1), 'F:/كتب/Books/test.pdf');

  const url2 = 'baglib-asset://f/%D9%83%D8%AA%D8%A8/test.pdf';
  assert.equal(extractDiskPathFromUrl(url2), 'f:/كتب/test.pdf');

  const url3 = 'baglib-asset:///F%3A/test.pdf';
  assert.equal(extractDiskPathFromUrl(url3), 'F:/test.pdf');
});
