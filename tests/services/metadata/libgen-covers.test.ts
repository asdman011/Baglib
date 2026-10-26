import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LibgenProvider } from '../../../src/main/services/metadata/libgen.provider';

const html = `<table id="tablelibgen" class="table table-striped"><thead><tr><td></td><th></th><th>ID Title Series</th><th>Author(s)</th><th>Publisher</th><th>Year</th><th>Pages</th><th>Language</th></tr></thead><tbody><tr><td></td><td><a href="edition.php?id=101"><img data-src='//libgen.li/fictioncovers/12000/real-cover_small.jpg'></a></td><td><b>Series name</b><br><a title="metadata<br>note" href="edition.php?id=101">كتاب &amp; Research</a></td><td>Jane Austen</td><td>Publisher</td><td>2020</td><td>123</td><td>English</td></tr><tr><td></td><td><img src='javascript:alert(1)'></td><td><a href="edition.php?id=102">Another title</a></td><td>Author</td><td></td><td>2018</td><td>70</td><td>Arabic</td></tr></tbody></table>`;

test('LibGen cover-enabled header parsing handles rating, image and shifted title cells', () => {
  const result = new LibgenProvider().parseHtml(html, 'https://libgen.li');
  assert.equal(result.length, 2);
  assert.equal(result[0].editionId, '101');
  assert.equal(result[0].title, 'كتاب & Research');
  assert.equal(result[0].coverUrl, 'https://libgen.li/fictioncovers/12000/real-cover_small.jpg');
  assert.equal(result[0].author, 'Jane Austen');
  assert.equal(result[0].pages, '123');
  assert.equal(result[0].language, 'English');
  assert.equal(result[1].coverUrl, undefined);
});

test('LibGen requests covers explicitly and correlates them with hydrated edition IDs', async () => {
  const provider = new LibgenProvider();
  provider.getActiveMirror = async () => 'https://libgen.li';
  provider.fetchJson = async <Value>() => ({ '102': { title: 'Second hydrated', cover_url: '//libgen.li/correct.jpg' }, '101': { title: 'First hydrated', cover_exists: 1, files: { first: { md5: 'a'.repeat(32), extension: 'epub' } } } }) as Value;
  const original = globalThis.fetch;
  let requested = '';
  globalThis.fetch = async request => { requested = String(request); return new Response(html); };
  try {
    const results = await provider.searchFreeTextHydrated('كتاب', 10);
    assert.equal(new URL(requested).searchParams.get('covers'), 'on');
    assert.equal(new URL(requested).searchParams.get('req'), 'كتاب');
    assert.equal(results.find(result => result.editionId === '101')?.coverUrl, 'https://libgen.li/fictioncovers/12000/real-cover_small.jpg');
    assert.equal(results.find(result => result.editionId === '102')?.coverUrl, 'https://libgen.li/correct.jpg');
  } finally { globalThis.fetch = original; }
});

test('LibGen preserves usable row cover results when its JSON service is unavailable', async () => {
  const provider = new LibgenProvider();
  provider.getActiveMirror = async () => 'https://libgen.li';
  provider.fetchJson = async () => null;
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(html);
  try {
    const results = await provider.searchFreeTextHydrated('book', 1);
    assert.equal(results.length, 1);
    assert.equal(results[0].coverUrl, 'https://libgen.li/fictioncovers/12000/real-cover_small.jpg');
    assert.equal(results[0].detailUrl, 'https://libgen.li/edition.php?id=101');
  } finally { globalThis.fetch = original; }
});

test('LibGen normalizes API cover references and rejects executable URLs', () => {
  const provider = new LibgenProvider();
  assert.equal(provider.mapEditionToSearchResults('123', { title: 'Book', cover_url: '//cdn.example.org/cover.jpg' }, [], 'https://libgen.li')[0].coverUrl, 'https://cdn.example.org/cover.jpg');
  assert.equal(provider.mapEditionToSearchResults('123', { title: 'Book', cover_url: 'covers/book.jpg' }, [], 'https://libgen.li')[0].coverUrl, 'https://libgen.li/covers/book.jpg');
  assert.equal(provider.mapEditionToSearchResults('123', { title: 'Book', cover_url: 'file:///private/file.png' }, [], 'https://libgen.li')[0].coverUrl, undefined);
});

test('recorded public LibGen cover table preserves actual fiction-cover paths and column mappings', () => {
  const source = readFileSync('tests/fixtures/libgen-cover-search.html', 'utf8');
  const results = new LibgenProvider().parseHtml(source, 'https://libgen.li');
  assert.equal(results.length, 2);
  assert.equal(results[0].editionId, '208308940');
  assert.equal(results[0].coverUrl, 'https://libgen.li/fictioncovers/10090000/3396318c97ba9cda5cce7792ccb1ccf4_small.jpg');
  assert.equal(results[0].author, 'Nora Jane Crawford & AR Thorne');
  assert.equal(results[1].pages, '300');
  assert.equal(results[1].language, 'English');
});
