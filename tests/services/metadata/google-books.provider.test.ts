import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleBooksProvider } from '../../../src/main/services/metadata/providers/google-books.provider';
import { googleBooksClient } from '../../../src/main/services/metadata/http-client';

describe('GoogleBooksProvider (Task 5.4 & 5.5)', () => {
  const provider = new GoogleBooksProvider();
  let originalGetJson: typeof googleBooksClient.getJson;

  beforeEach(() => {
    originalGetJson = googleBooksClient.getJson;
  });

  afterEach(() => {
    googleBooksClient.getJson = originalGetJson;
  });

  it('has provider name "Google Books"', () => {
    assert.strictEqual(provider.name, 'Google Books');
  });

  describe('Search by Query', () => {
    it('returns empty array when query is empty', async () => {
      const results = await provider.search('');
      assert.deepStrictEqual(results, []);
    });

    it('searches by query string and normalizes Volume into Work/Edition', async () => {
      googleBooksClient.getJson = async (url: string) => {
        assert.ok(url.includes('/volumes?q=Clean%20Code'));
        return {
          totalItems: 1,
          items: [
            {
              id: 'kacTBQAAQBAJ',
              volumeInfo: {
                title: 'Clean Code',
                authors: ['Robert C. Martin'],
                publisher: 'Pearson Education',
                publishedDate: '2008-08-01',
                description: '<p>Even bad code can function. <b>Clean Code</b> describes principles.</p>',
                pageCount: 464,
                categories: ['Computers'],
                industryIdentifiers: [
                  { type: 'ISBN_10', identifier: '0132350882' },
                  { type: 'ISBN_13', identifier: '9780132350884' }
                ],
                imageLinks: {
                  smallThumbnail: 'http://books.google.com/books/content?id=kacTBQAAQBAJ&printsec=frontcover&img=1&zoom=5',
                  thumbnail: 'http://books.google.com/books/content?id=kacTBQAAQBAJ&printsec=frontcover&img=1&zoom=1'
                },
                language: 'en',
                infoLink: 'https://books.google.com/books?id=kacTBQAAQBAJ'
              }
            }
          ]
        };
      };

      const results = await provider.search('Clean Code', 5);
      assert.strictEqual(results.length, 1);
      const work = results[0];
      assert.strictEqual(work.workId, 'gb-kacTBQAAQBAJ');
      assert.strictEqual(work.title, 'Clean Code');
      assert.deepStrictEqual(work.authors, ['Robert C. Martin']);
      assert.strictEqual(work.firstPublishYear, 2008);
      assert.deepStrictEqual(work.subjects, ['Computers']);

      // Verifies HTML sanitization in description (KEY-74)
      assert.strictEqual(
        work.description,
        'Even bad code can function. Clean Code describes principles.'
      );

      const edition = work.editions[0];
      assert.strictEqual(edition.editionId, 'kacTBQAAQBAJ');
      assert.strictEqual(edition.isbn10, '0132350882');
      assert.strictEqual(edition.isbn13, '9780132350884');
      assert.strictEqual(edition.isbn, '9780132350884');
      assert.strictEqual(edition.pages, 464);
      assert.strictEqual(edition.language, 'en');
      assert.strictEqual(edition.publisher, 'Pearson Education');
      // HTTPS upgrade on cover thumbnail
      assert.strictEqual(
        edition.coverUrl,
        'https://books.google.com/books/content?id=kacTBQAAQBAJ&printsec=frontcover&img=1&zoom=1'
      );
      assert.strictEqual(edition.sources[0]?.provider, 'Google Books');
    });

    it('searches by structured title and author SearchQuery', async () => {
      googleBooksClient.getJson = async (url: string) => {
        const decoded = decodeURIComponent(url);
        assert.ok(decoded.includes('intitle:Clean Code'));
        assert.ok(decoded.includes('inauthor:Robert C. Martin'));
        return {
          totalItems: 1,
          items: [
            {
              id: 'vol-1',
              volumeInfo: {
                title: 'Clean Code',
                authors: ['Robert C. Martin']
              }
            }
          ]
        };
      };

      const results = await provider.search({ title: 'Clean Code', author: 'Robert C. Martin' });
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Clean Code');
    });

    it('recovers gracefully from network failure returning empty array', async () => {
      googleBooksClient.getJson = async () => {
        throw new Error('Google API Quota Exceeded (429)');
      };
      const results = await provider.search('test');
      assert.deepStrictEqual(results, []);
    });
  });

  describe('Search by ISBN', () => {
    it('queries Google Books with isbn: parameter', async () => {
      googleBooksClient.getJson = async (url: string) => {
        assert.ok(url.includes('q=isbn:9780132350884'));
        return {
          totalItems: 1,
          items: [
            {
              id: 'kacTBQAAQBAJ',
              volumeInfo: {
                title: 'Clean Code',
                authors: ['Robert C. Martin'],
                industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780132350884' }]
              }
            }
          ]
        };
      };

      const result = await provider.searchByIsbn('9780132350884');
      assert.ok(result);
      assert.strictEqual(result.title, 'Clean Code');
      assert.strictEqual(result.editions[0].isbn, '9780132350884');
    });

    it('returns null when no items are returned', async () => {
      googleBooksClient.getJson = async () => ({ totalItems: 0, items: [] });
      const result = await provider.searchByIsbn('0000000000');
      assert.strictEqual(result, null);
    });

    it('returns null on network error', async () => {
      googleBooksClient.getJson = async () => {
        throw new Error('Connection reset');
      };
      const result = await provider.searchByIsbn('9780132350884');
      assert.strictEqual(result, null);
    });
  });

  describe('Get Work Details', () => {
    it('retrieves volume details by stripping gb- prefix', async () => {
      googleBooksClient.getJson = async (url: string) => {
        assert.strictEqual(url, '/volumes/kacTBQAAQBAJ');
        return {
          id: 'kacTBQAAQBAJ',
          volumeInfo: {
            title: 'Clean Code',
            description: 'A handbook of agile software craftsmanship.'
          }
        };
      };

      const result = await provider.getWorkDetails('gb-kacTBQAAQBAJ');
      assert.ok(result);
      assert.strictEqual(result.workId, 'gb-kacTBQAAQBAJ');
      assert.strictEqual(result.title, 'Clean Code');
    });
  });
});
