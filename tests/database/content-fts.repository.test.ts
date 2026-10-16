import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/test-db';
import { ContentFtsRepository } from '../../src/main/database/repositories/content-fts.repository';
import type { IndexedBookPage } from '../../src/shared/types/full-text-search';

describe('KEY-140 SQLite FTS5 Full-Text Search Repository', () => {
  let db: Database.Database;
  let repo: ContentFtsRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new ContentFtsRepository(db);

    // Seed dummy work rows for JOIN testing
    db.exec(`
      INSERT OR IGNORE INTO work_type (id, name, icon) VALUES ('wt-book', 'كتاب', 'book');
      INSERT INTO work (id, work_type_id, title) VALUES
        ('work-muqaddimah', 'wt-book', 'مقدمة ابن خلدون'),
        ('work-milestones', 'wt-book', 'معالم في الطريق'),
        ('work-clean-code', 'wt-book', 'Clean Code: A Handbook of Agile Software Craftsmanship');
    `);
  });

  const muqaddimahPages: IndexedBookPage[] = [
    {
      pageNumber: 1,
      locationCfiOrPage: '1',
      chapterTitle: 'المقدمة: في فضل علم التاريخ',
      content: 'اعلم أن فن التاريخ فن عزيز المذهب، جم الفوائد، شريف الغاية، إذ هو يوقفنا على أحوال الماضين من الأمم في أخلاقهم.',
    },
    {
      pageNumber: 42,
      locationCfiOrPage: '42',
      chapterTitle: 'الباب الأول: في العمران البشري',
      content: 'إن التاريخ في ظاهره لا يزيد على الإخبار عن الأيام والدول، وفي باطنه نظر وتحقيق، وتعليل للكائنات ومباديها دقيق، وعلم بكيفيات الوقائع وأسبابها عميق، فهو لذلك أصيل في الحكمة عريق، وجدير بأن يعد في علومها وخليق.',
    },
    {
      pageNumber: 105,
      locationCfiOrPage: '105',
      chapterTitle: 'الباب الثاني: في العمران البدوي والأمم الوحشية',
      content: 'فصل في أن أهل البدو أقرب إلى الخير من أهل الحضر، وسبب ذلك أن النفس إذا كانت على الفطرة الأولى كانت متهيئة لقبول ما يرد عليها.',
    },
  ];

  const milestonesPages: IndexedBookPage[] = [
    {
      pageNumber: 10,
      locationCfiOrPage: '10',
      chapterTitle: 'جيل قرآني فريد',
      content: 'إن هذا القرآن لا يمنح كنوزه إلا لمن يقبل عليه بهذه الروح: روح التلقي للتنفيذ والعمل.',
    },
  ];

  const cleanCodePages: IndexedBookPage[] = [
    {
      pageNumber: 15,
      locationCfiOrPage: '15',
      chapterTitle: 'Chapter 2: Meaningful Names',
      content: 'You should name a variable, function, or class using intention-revealing names that tell you why it exists and what it does.',
    },
  ];

  describe('1. Indexing & Lifecycle', () => {
    it('indexes pages of books into FTS5 table', () => {
      repo.indexBook('work-muqaddimah', muqaddimahPages);
      assert.equal(repo.isBookIndexed('work-muqaddimah'), true);
      assert.equal(repo.isBookIndexed('non-existent'), false);
      assert.equal(repo.getIndexedPagesCount('work-muqaddimah'), 3);
      assert.equal(repo.getIndexedBooksCount(), 1);
    });

    it('re-indexing a book updates pages without duplication', () => {
      repo.indexBook('work-muqaddimah', muqaddimahPages);
      repo.indexBook('work-muqaddimah', muqaddimahPages); // index again
      assert.equal(repo.getIndexedPagesCount('work-muqaddimah'), 3);
    });

    it('deletes indexed book content properly', () => {
      repo.indexBook('work-muqaddimah', muqaddimahPages);
      assert.equal(repo.isBookIndexed('work-muqaddimah'), true);

      repo.deleteBookIndex('work-muqaddimah');
      assert.equal(repo.isBookIndexed('work-muqaddimah'), false);
      assert.equal(repo.getIndexedPagesCount('work-muqaddimah'), 0);
    });
  });

  describe('2. Morphology-Aware Arabic & English Full-Text Search', () => {
    beforeEach(() => {
      repo.indexBook('work-muqaddimah', muqaddimahPages);
      repo.indexBook('work-milestones', milestonesPages);
      repo.indexBook('work-clean-code', cleanCodePages);
    });

    it('finds Arabic text ignoring Harakat and letter variants', () => {
      // Query without Harakat, matching vowelled or unvowelled content
      const results = repo.searchLibrary('التاريخ');
      assert.ok(results.length >= 2);
      assert.equal(results[0].bookId, 'work-muqaddimah');
      assert.equal(results[0].bookTitle, 'مقدمة ابن خلدون');
      assert.ok(results[0].snippet.includes('<mark>'));
    });

    it('supports Boolean AND operator across words', () => {
      const results = repo.searchLibrary('التاريخ AND الحكمة');
      assert.equal(results.length, 1);
      assert.equal(results[0].pageNumber, 42);
      assert.ok(results[0].chapterTitle?.includes('العمران البشري'));
    });

    it('supports Boolean OR operator', () => {
      const results = repo.searchLibrary('الحضر OR كنوزه');
      assert.equal(results.length, 2);
      const bookIds = results.map((r) => r.bookId);
      assert.ok(bookIds.includes('work-muqaddimah'));
      assert.ok(bookIds.includes('work-milestones'));
    });

    it('supports Boolean NOT operator', () => {
      const results = repo.searchLibrary('العمران NOT البدو');
      assert.equal(results.length, 1);
      assert.equal(results[0].pageNumber, 42);
    });

    it('supports prefix wildcard search (*)', () => {
      const results = repo.searchLibrary('فن*');
      assert.ok(results.length >= 1);
      assert.equal(results[0].pageNumber, 1);
    });

    it('supports English search in clean code book', () => {
      const results = repo.searchLibrary('intention-revealing');
      assert.equal(results.length, 1);
      assert.equal(results[0].bookId, 'work-clean-code');
      assert.ok(results[0].snippet.includes('intention-revealing'));
    });

    it('scopes search to a single book when bookId is specified', () => {
      const allResults = repo.searchLibrary('الروح OR الحكمة');
      assert.equal(allResults.length, 2);

      const scopedResults = repo.searchLibrary('الروح OR الحكمة', {
        query: 'الروح OR الحكمة',
        bookId: 'work-milestones',
      });
      assert.equal(scopedResults.length, 1);
      assert.equal(scopedResults[0].bookId, 'work-milestones');
    });
  });
});
