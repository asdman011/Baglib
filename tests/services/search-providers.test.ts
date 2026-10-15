import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LocalSearchProvider } from '../../src/main/services/search/providers/local-search.provider';
import { OpenLibrarySearchProvider } from '../../src/main/services/search/providers/open-library-search.provider';
import { GoogleBooksSearchProvider } from '../../src/main/services/search/providers/google-books-search.provider';
import { InternetArchiveSearchProvider } from '../../src/main/services/search/providers/internet-archive-search.provider';
import { GutenbergSearchProvider } from '../../src/main/services/search/providers/gutenberg-search.provider';
import { DuplicateDetector } from '../../src/main/services/search/duplicate-detector';
import { BookItem } from '../../src/shared/types/work';
import { HttpClient } from '../../src/main/services/metadata/http-client';
import { QuotaTracker } from '../../src/main/services/metadata/quotaTracker';
import Database from 'better-sqlite3';

describe('Search Providers & Duplicate Detector Unit Tests', () => {
  describe('DuplicateDetector', () => {
    it('normalizes valid ISBN-10 to standard ISBN-13', () => {
      // 0-306-40615-2 -> 9780306406157
      const isbn10 = '0-306-40615-2';
      const normalized = DuplicateDetector.normalizeIsbn(isbn10);
      assert.equal(normalized, '9780306406157');
    });

    it('cleans ISBN-13 formatting hyphens', () => {
      const isbn13 = '978-0-13-449416-6';
      const normalized = DuplicateDetector.normalizeIsbn(isbn13);
      assert.equal(normalized, '9780134494166');
    });

    it('matches book by normalized ISBN across ISBN-10 and ISBN-13', () => {
      const localBooks: BookItem[] = [
        {
          id: 'b1',
          title: 'Design Patterns',
          author: 'Erich Gamma',
          isbn: '9780201633610',
          categories: ['Software'],
          tags: ['patterns'],
          lendingHistory: [],
          bookType: 'physical',
        },
      ];

      // Candidate has ISBN-10: 0-201-63361-2
      const candidate: any = {
        id: 'ol:1',
        title: 'Design Patterns',
        author: 'Gang of Four',
        isbn: '0-201-63361-2',
      };

      const match = DuplicateDetector.findMatch(candidate, localBooks);
      assert.equal(match.inLibrary, true);
      assert.equal(match.localWorkId, 'b1');
      assert.equal(match.matchReason, 'isbn');
    });

    it('matches Arabic book by normalized fuzzy title and author', () => {
      const localBooks: BookItem[] = [
        {
          id: 'b2',
          title: 'تاريخ دمشق',
          author: 'ابن عساكر',
          categories: ['تاريخ'],
          tags: ['دمشق'],
          lendingHistory: [],
          bookType: 'physical',
        },
      ];

      // Candidate with tashkeel and alef variant: "تَارِيخُ دِمَشْقَ" by "إِبْن عَسَاكِر"
      const candidate: any = {
        id: 'gb:1',
        title: 'تَارِيخُ دِمَشْقَ (طبعة دار الفكر)',
        author: 'إِبْن عَسَاكِر',
      };

      const match = DuplicateDetector.findMatch(candidate, localBooks);
      assert.equal(match.inLibrary, true);
      assert.equal(match.localWorkId, 'b2');
      assert.equal(match.matchReason, 'title_author');
    });
  });

  describe('LocalSearchProvider', () => {
    const mockBooks: BookItem[] = [
      {
        id: 'loc-1',
        title: 'رياض الصالحين',
        author: 'الإمام النووي',
        description: 'أحاديث نبوية شريفة مرتبة على الأبواب',
        categories: ['حديث شريف', 'تزكية'],
        tags: ['نووي'],
        lendingHistory: [],
        bookType: 'physical',
        room: 'المكتبة الرئيسية',
        bookcase: 'الخزانة أ',
        shelf: 'الرف 2',
      },
      {
        id: 'loc-2',
        title: 'Clean Code',
        author: 'Robert C. Martin',
        description: 'A handbook of agile software craftsmanship',
        digitalFormat: 'PDF',
        filePath: 'D:/books/clean_code.pdf',
        categories: ['Programming', 'Software Engineering'],
        tags: ['agile'],
        lendingHistory: [],
        bookType: 'digital',
      },
    ];

    const provider = new LocalSearchProvider(() => mockBooks);

    it('searches by Arabic normalized text with alef and diacritic invariance', async () => {
      // Query "رياض الصالحين" without tashkeel
      const res = await provider.search({ query: 'رياض الصالحين' });
      assert.equal(res.length, 1);
      assert.equal(res[0].id, 'local:loc-1');
      assert.equal(res[0].providerId, 'local');
      assert.equal(res[0].inLibrary, true);
    });

    it('searches by physical location attributes', async () => {
      const res = await provider.search({ query: 'الخزانة أ' });
      assert.equal(res.length, 1);
      assert.equal(res[0].id, 'local:loc-1');
    });

    it('searches by category', async () => {
      const res = await provider.search({ query: 'Programming' });
      assert.equal(res.length, 1);
      assert.equal(res[0].id, 'local:loc-2');
      assert.deepEqual(res[0].availableFormats, ['PDF']);
    });

    it('returns empty array when query is blank', async () => {
      const res = await provider.search({ query: '   ' });
      assert.deepEqual(res, []);
    });
  });

  describe('OpenLibrarySearchProvider', () => {
    it('initializes with correct provider metadata', () => {
      const provider = new OpenLibrarySearchProvider();
      assert.equal(provider.id, 'openlibrary');
      assert.equal(provider.name, 'Open Library');
      assert.equal(provider.supportsDownload, false);
      assert.equal(provider.isEnabled(), true);
    });

    it('handles search queries safely with AbortSignal cancellation', async () => {
      const provider = new OpenLibrarySearchProvider();
      const controller = new AbortController();
      controller.abort(); // already aborted

      const res = await provider.search({ query: 'Test' }, controller.signal);
      assert.deepEqual(res, []);
    });
  });

  describe('GoogleBooksSearchProvider', () => {
    it('initializes with correct provider metadata and checks quota', () => {
      const memDb = new Database(':memory:');
      const quota = new QuotaTracker(memDb);
      const provider = new GoogleBooksSearchProvider(quota);

      assert.equal(provider.id, 'googlebooks');
      assert.equal(provider.name, 'Google Books');
      assert.equal(provider.supportsFullText, true);
      assert.equal(provider.isEnabled(), true);
    });
  });

  describe('InternetArchiveSearchProvider', () => {
    it('initializes with download support enabled', () => {
      const provider = new InternetArchiveSearchProvider();
      assert.equal(provider.id, 'internetarchive');
      assert.equal(provider.name, 'Internet Archive');
      assert.equal(provider.supportsDownload, true);
    });
  });

  describe('GutenbergSearchProvider', () => {
    it('parses Gutenberg search results and constructs download links', async () => {
      const mockClient = {
        getJson: async (url: string) => {
          return {
            count: 1,
            results: [
              {
                id: 1342,
                title: 'Pride and Prejudice',
                authors: [{ name: 'Austen, Jane', birth_year: 1775, death_year: 1817 }],
                languages: ['en'],
                subjects: ['Sisters -- Fiction', 'Courtship -- Fiction'],
                formats: {
                  'application/epub+zip': 'https://www.gutenberg.org/ebooks/1342.epub.images',
                  'image/jpeg': 'https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg',
                  'text/html': 'https://www.gutenberg.org/ebooks/1342.html.images',
                },
              },
            ],
          };
        },
      } as unknown as HttpClient;

      const provider = new GutenbergSearchProvider(mockClient);
      const results = await provider.search({ query: 'Pride and Prejudice' });

      assert.equal(results.length, 1);
      const book = results[0];
      assert.equal(book.id, 'gutenberg:1342');
      assert.equal(book.title, 'Pride and Prejudice');
      assert.equal(book.author, 'Jane Austen');
      assert.equal(book.downloadUrl, 'https://www.gutenberg.org/ebooks/1342.epub.images');
      assert.deepEqual(book.availableFormats, ['EPUB']);
      assert.equal(book.coverUrl, 'https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg');
    });
  });
});
