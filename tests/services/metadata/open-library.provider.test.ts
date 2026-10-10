import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { OpenLibraryProvider } from '../../../src/main/services/metadata/providers/open-library.provider';
import { openLibraryClient } from '../../../src/main/services/metadata/http-client';

describe('OpenLibraryProvider (Task 5.3 & 5.5)', () => {
  const provider = new OpenLibraryProvider();
  let originalGetJson: typeof openLibraryClient.getJson;

  beforeEach(() => {
    originalGetJson = openLibraryClient.getJson;
  });

  afterEach(() => {
    openLibraryClient.getJson = originalGetJson;
  });

  it('has provider name "Open Library"', () => {
    assert.strictEqual(provider.name, 'Open Library');
  });

  describe('Search by Query String and Structured Query', () => {
    it('returns empty array when query is empty', async () => {
      const results = await provider.search('');
      assert.deepStrictEqual(results, []);
    });

    it('searches by query string and normalizes works and editions', async () => {
      openLibraryClient.getJson = async (url: string) => {
        assert.ok(url.includes('/search.json?q=Dune'));
        return {
          numFound: 1,
          docs: [
            {
              key: '/works/OL893415W',
              title: 'Dune',
              author_name: ['Frank Herbert'],
              first_publish_year: 1965,
              subject: ['Science Fiction', 'Space'],
              edition_key: ['OL24364628M'],
              isbn: ['9780441172719'],
              publisher: ['Chilton Books'],
              language: ['eng'],
              cover_i: 12345
            }
          ]
        };
      };

      const results = await provider.search('Dune', 5);
      assert.strictEqual(results.length, 1);
      const work = results[0];
      assert.strictEqual(work.workId, 'OL893415W');
      assert.strictEqual(work.title, 'Dune');
      assert.deepStrictEqual(work.authors, ['Frank Herbert']);
      assert.strictEqual(work.firstPublishYear, 1965);
      assert.strictEqual(work.editions.length, 1);

      const edition = work.editions[0];
      assert.strictEqual(edition.editionId, 'OL24364628M');
      assert.strictEqual(edition.isbn, '9780441172719');
      assert.strictEqual(edition.coverUrl, 'https://covers.openlibrary.org/b/id/12345-L.jpg');
      assert.strictEqual(edition.publisher, 'Chilton Books');
      assert.strictEqual(edition.sources[0]?.provider, 'Open Library');
    });

    it('searches by structured title and author SearchQuery', async () => {
      openLibraryClient.getJson = async (url: string) => {
        assert.ok(url.includes('title=Foundation'));
        assert.ok(url.includes('author=Isaac%20Asimov'));
        return {
          numFound: 1,
          docs: [
            {
              key: '/works/OL456W',
              title: 'Foundation',
              author_name: ['Isaac Asimov'],
              first_publish_year: 1951,
              edition_key: ['OL789M']
            }
          ]
        };
      };

      const results = await provider.search({ title: 'Foundation', author: 'Isaac Asimov' });
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Foundation');
      assert.deepStrictEqual(results[0].authors, ['Isaac Asimov']);
    });

    it('handles search results with missing editions by creating fallback edition', async () => {
      openLibraryClient.getJson = async () => ({
        numFound: 1,
        docs: [
          {
            key: '/works/OL999W',
            title: 'Book without editions',
            first_publish_year: 2000
          }
        ]
      });

      const results = await provider.search('test');
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].editions.length, 1);
      assert.ok(results[0].editions[0].editionId.startsWith('fallback-'));
    });

    it('recovers gracefully from network failure returning empty array', async () => {
      openLibraryClient.getJson = async () => {
        throw new Error('Connection timeout');
      };

      const results = await provider.search('Fail');
      assert.deepStrictEqual(results, []);
    });
  });

  describe('Search by ISBN', () => {
    it('successfully queries edition by ISBN and maps to Work/Edition model', async () => {
      openLibraryClient.getJson = async (url: string) => {
        assert.ok(url.includes('bibkeys=ISBN:9780441172719'));
        return {
          'ISBN:9780441172719': {
            bib_key: 'ISBN:9780441172719',
            key: '/books/OL24364628M',
            title: 'Dune',
            authors: [{ name: 'Frank Herbert', url: 'https://openlibrary.org/authors/OL262384A' }],
            publish_date: '1965',
            publishers: [{ name: 'Chilton' }],
            number_of_pages: 412,
            cover: {
              small: 'https://covers.openlibrary.org/b/id/123-S.jpg',
              large: 'https://covers.openlibrary.org/b/id/123-L.jpg'
            },
            identifiers: {
              openlibrary: ['OL24364628M']
            },
            url: 'https://openlibrary.org/books/OL24364628M'
          }
        };
      };

      const work = await provider.searchByIsbn('9780441172719');
      assert.ok(work);
      assert.strictEqual(work.title, 'Dune');
      assert.deepStrictEqual(work.authors, ['Frank Herbert']);
      assert.strictEqual(work.editions.length, 1);
      assert.strictEqual(work.editions[0].editionId, 'OL24364628M');
      assert.strictEqual(work.editions[0].isbn, '9780441172719');
      assert.strictEqual(work.editions[0].pages, 412);
      assert.strictEqual(work.editions[0].publisher, 'Chilton');
      assert.strictEqual(work.editions[0].coverUrl, 'https://covers.openlibrary.org/b/id/123-L.jpg');
    });

    it('returns null when ISBN is not found in Open Library', async () => {
      openLibraryClient.getJson = async () => ({});
      const result = await provider.searchByIsbn('0000000000');
      assert.strictEqual(result, null);
    });

    it('recovers gracefully from network failure returning null', async () => {
      openLibraryClient.getJson = async () => {
        throw new Error('HTTP 500 Service Unavailable');
      };
      const result = await provider.searchByIsbn('9780441172719');
      assert.strictEqual(result, null);
    });
  });

  describe('Get Work Details', () => {
    it('fetches full work and its multiple editions', async () => {
      openLibraryClient.getJson = async (url: string) => {
        if (url.includes('/works/OL893415W.json')) {
          return {
            title: 'Dune Work',
            description: { value: 'Epic science fiction novel.' },
            subjects: ['Science Fiction'],
            authors: [{ author: { key: '/authors/OL262384A' } }]
          };
        }
        if (url.includes('/editions.json')) {
          return {
            entries: [
              {
                key: '/books/OL1M',
                title: 'Dune (First Edition)',
                publish_date: 'August 1965',
                publishers: ['Chilton'],
                isbn_10: ['0441172717'],
                isbn_13: ['9780441172719'],
                number_of_pages: 412,
                covers: [9999]
              }
            ]
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      };

      const work = await provider.getWorkDetails('OL893415W');
      assert.ok(work);
      assert.strictEqual(work.title, 'Dune Work');
      assert.strictEqual(work.description, 'Epic science fiction novel.');
      assert.strictEqual(work.editions.length, 1);
      assert.strictEqual(work.editions[0].editionId, 'OL1M');
      assert.strictEqual(work.editions[0].isbn10, '0441172717');
      assert.strictEqual(work.editions[0].isbn13, '9780441172719');
      assert.strictEqual(work.editions[0].coverUrl, 'https://covers.openlibrary.org/b/id/9999-L.jpg');
    });

    it('returns null on failure', async () => {
      openLibraryClient.getJson = async () => {
        throw new Error('404 Not Found');
      };
      const result = await provider.getWorkDetails('nonexistent');
      assert.strictEqual(result, null);
    });
  });
});
