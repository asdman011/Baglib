import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readerAssetUrl } from '../../src/shared/utils/reader-asset-url';

it('preserves Windows paths containing Arabic, fragments, queries and percent signs', () => {
  const filePath = 'D:\\كتب\\Research #1? 100%.pdf';
  const url = readerAssetUrl(filePath);
  assert.equal(url.includes('#'), false);
  assert.equal(url.includes('?'), false);
  assert.equal(decodeURIComponent(url.replace('baglib-asset:///', '')), filePath.replace(/\\/g, '/'));
});

it('preserves Unix absolute paths and literal encoded characters', () => {
  assert.equal(readerAssetUrl('/books/a%20b.epub'), 'baglib-asset:///books/a%2520b.epub');
});
