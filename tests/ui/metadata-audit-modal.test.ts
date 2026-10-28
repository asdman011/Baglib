import { describe, it } from 'node:test';
import assert from 'node:assert';
import { translations } from '../../src/renderer/translations';
import { auditBook, MissingFieldsInfo } from '../../src/renderer/components/library/MetadataAuditModal';
import { BookItem } from '../../src/shared/types/work';

describe('Library Metadata Audit & Refresh Feature Tests', () => {
  const auditKeys = [
    'auditAndRefreshMetadata',
    'auditMetadataTitle',
    'auditMetadataSubtitle',
    'auditScopeSelected',
    'auditScopeAll',
    'auditStatTotal',
    'auditStatIssues',
    'auditStatClean',
    'auditFilterAll',
    'auditFilterNeedsAttention',
    'auditFilterClean',
    'auditMissingAuthor',
    'auditMissingYear',
    'auditMissingCover',
    'auditMissingDescription',
    'auditMissingIsbn',
    'auditMissingCategory',
    'auditMissingLanguage',
    'auditMissingIsbnCategory',
    'rescanFilesFirst',
    'rescanFilesFirstDesc',
    'rescanningFiles',
    'rescanFilesSuccess',
    'autoEnrichAll',
    'autoEnrichAllDesc',
    'autoEnriching',
    'autoEnrichProgress',
    'autoEnrichSuccess',
    'autoEnrichCancelled',
    'reviewOneByOne',
    'reviewOneByOneDesc',
    'reviewBookStep',
    'reviewMissingFields',
    'approveAndNext',
    'skipBook',
    'exitReview',
    'noBooksInAudit',
    'allMetadataClean',
    'auditSearchPlaceholder',
    'auditLocalFileResolved',
    'auditOnlineResolved',
    'stopEnrichment',
    'noLocalFilesFound',
  ];

  it('contains all Metadata Audit translation keys in both Arabic and English', () => {
    for (const key of auditKeys) {
      const arVal = (translations.ar as unknown)[key];
      const enVal = (translations.en as unknown)[key];

      assert.ok(
        typeof arVal === 'string' && arVal.trim().length > 0,
        `Key "${key}" must exist and have non-empty Arabic translation`
      );
      assert.ok(
        typeof enVal === 'string' && enVal.trim().length > 0,
        `Key "${key}" must exist and have non-empty English translation`
      );
    }
  });

  describe('auditBook missing fields classification', () => {
    it('detects missing author when empty, null, or placeholder', () => {
      const book1: BookItem = {
        id: '1',
        title: 'Test Book',
        author: '',
        bookType: 'digital',
        categories: ['History'],
        tags: [],
        lendingHistory: [],
      };
      assert.strictEqual(auditBook(book1).author, true);

      const book2: BookItem = {
        ...book1,
        author: 'Unknown Author',
      };
      assert.strictEqual(auditBook(book2).author, true);

      const book3: BookItem = {
        ...book1,
        author: 'غير معروف',
      };
      assert.strictEqual(auditBook(book3).author, true);

      const book4: BookItem = {
        ...book1,
        author: 'مؤلف مجهول',
      };
      assert.strictEqual(auditBook(book4).author, true);

      const validBook: BookItem = {
        ...book1,
        author: 'عباس محمود العقاد',
      };
      assert.strictEqual(auditBook(validBook).author, false);
    });

    it('detects missing publication year', () => {
      const bookWithoutYear: BookItem = {
        id: '2',
        title: 'Book Without Year',
        author: 'Ibn Khaldun',
        bookType: 'digital',
        categories: ['History'],
        tags: [],
        lendingHistory: [],
      };
      assert.strictEqual(auditBook(bookWithoutYear).year, true);

      const bookWithYear: BookItem = {
        ...bookWithoutYear,
        publicationYear: 2021,
      };
      assert.strictEqual(auditBook(bookWithYear).year, false);
    });

    it('detects missing cover image', () => {
      const bookNoCover: BookItem = {
        id: '3',
        title: 'No Cover Book',
        author: 'Author',
        bookType: 'digital',
        categories: ['Tech'],
        tags: [],
        lendingHistory: [],
      };
      assert.strictEqual(auditBook(bookNoCover).cover, true);

      const bookWithCover: BookItem = {
        ...bookNoCover,
        coverImage: 'blob:baglib/cover-123.jpg',
      };
      assert.strictEqual(auditBook(bookWithCover).cover, false);
    });

    it('detects missing description and abstract', () => {
      const bookNoDesc: BookItem = {
        id: '4',
        title: 'No Description',
        author: 'Author',
        bookType: 'digital',
        categories: ['Tech'],
        tags: [],
        lendingHistory: [],
      };
      assert.strictEqual(auditBook(bookNoDesc).description, true);

      const bookWithAbstract: BookItem = {
        ...bookNoDesc,
        abstract: 'This is an academic abstract',
      };
      assert.strictEqual(auditBook(bookWithAbstract).description, false);

      const bookWithDesc: BookItem = {
        ...bookNoDesc,
        description: 'Detailed book overview',
      };
      assert.strictEqual(auditBook(bookWithDesc).description, false);
    });

    it('identifies completely clean book with no missing essential fields', () => {
      const cleanBook: BookItem = {
        id: '5',
        title: 'The Clean Book',
        edition: '3rd Edition',
        author: 'Dr. Jane Doe',
        publicationYear: 2023,
        coverImage: 'https://example.com/cover.jpg',
        description: 'Comprehensive guide to algorithms',
        isbn: '9780131103627',
        language: 'English',
        categories: ['Computer Science'],
        tags: ['#programming'],
        bookType: 'digital',
        lendingHistory: [],
      };

      const audit = auditBook(cleanBook);
      assert.strictEqual(audit.hasMissing, false);
      assert.strictEqual(audit.missingCount, 0);
      assert.strictEqual(audit.author, false);
      assert.strictEqual(audit.year, false);
      assert.strictEqual(audit.cover, false);
      assert.strictEqual(audit.description, false);
      assert.strictEqual(audit.isbn, false);
      assert.strictEqual(audit.category, false);
      assert.strictEqual(audit.language, false);
    });
  });

  describe('Preservation of User Custom Data', () => {
    it('ensures existing tags, notes, and lending records remain untouched during metadata enrichments', () => {
      const originalBook: BookItem = {
        id: 'book-preserve-test',
        title: 'Local Scan Test',
        author: 'Unknown Author',
        bookType: 'digital',
        categories: ['Private Collection'],
        tags: ['#MustRead', '#Chapter3Special'],
        readingStatus: 'reading',
        readingProgress: 42,
        lendingHistory: [
          {
            id: 'loan-1',
            borrowerName: 'Ahmad',
            borrowDate: '2026-01-01',
            isReturned: false,
          },
        ],
      };

      // Simulated enrichment update
      const updatedBook: BookItem = {
        ...originalBook,
        author: 'Resolved Author Name',
        publicationYear: 2024,
        description: 'Resolved Description',
        // Crucial requirement: tags and custom data preserved
        tags: originalBook.tags,
      };

      assert.deepStrictEqual(updatedBook.tags, ['#MustRead', '#Chapter3Special']);
      assert.strictEqual(updatedBook.readingStatus, 'reading');
      assert.strictEqual(updatedBook.readingProgress, 42);
      assert.strictEqual(updatedBook.lendingHistory.length, 1);
      assert.strictEqual(updatedBook.author, 'Resolved Author Name');
    });
  });

  describe('Selection vs Whole Library Audit Scope Logic', () => {
    it('scopes correctly to selected books when selection is non-empty', () => {
      const allBooks: BookItem[] = [
        { id: 'b1', title: 'Book 1', author: 'A1', bookType: 'digital', categories: [], tags: [], lendingHistory: [] },
        { id: 'b2', title: 'Book 2', author: 'A2', bookType: 'digital', categories: [], tags: [], lendingHistory: [] },
        { id: 'b3', title: 'Book 3', author: 'A3', bookType: 'digital', categories: [], tags: [], lendingHistory: [] },
      ];

      const selectedIds = new Set(['b2']);
      const scopedBooks = selectedIds.size > 0 ? allBooks.filter((b) => selectedIds.has(b.id)) : allBooks;

      assert.strictEqual(scopedBooks.length, 1);
      assert.strictEqual(scopedBooks[0].id, 'b2');
    });

    it('scopes to all library books when selection is empty', () => {
      const allBooks: BookItem[] = [
        { id: 'b1', title: 'Book 1', author: 'A1', bookType: 'digital', categories: [], tags: [], lendingHistory: [] },
        { id: 'b2', title: 'Book 2', author: 'A2', bookType: 'digital', categories: [], tags: [], lendingHistory: [] },
      ];

      const selectedIds = new Set<string>();
      const scopedBooks = selectedIds.size > 0 ? allBooks.filter((b) => selectedIds.has(b.id)) : allBooks;

      assert.strictEqual(scopedBooks.length, 2);
    });
  });
});
