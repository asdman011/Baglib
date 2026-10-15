import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import type { BookItemInput } from '../../src/shared/types/work';

describe('SqliteWorkRepository — Pagination, Sorting & Bulk Operations (Story 9 / KEY-105)', () => {
  let db: Database.Database;
  let repo: SqliteWorkRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteWorkRepository(db);

    // Seed test works
    const seedBooks: BookItemInput[] = [
      {
        title: 'مقدمة ابن خلدون',
        author: 'ابن خلدون',
        publicationYear: 1377,
        readingStatus: 'completed',
        readingProgress: 100,
        bookType: 'physical',
        shelf: 'رف الفلسفة والتاريخ',
        room: 'القاعة الرئيسية',
      },
      {
        title: 'صحيح البخاري',
        author: 'الإمام البخاري',
        publicationYear: 846,
        readingStatus: 'reading',
        readingProgress: 45,
        bookType: 'physical',
        shelf: 'رف الحديث',
        room: 'القاعة الرئيسية',
      },
      {
        title: 'رياض الصالحين',
        author: 'الإمام النووي',
        publicationYear: 1270,
        readingStatus: 'unread',
        readingProgress: 0,
        bookType: 'digital',
        filePath: 'C:/books/riyad.pdf',
        digitalFormat: 'PDF',
      },
      {
        title: 'Clean Code',
        author: 'Robert C. Martin',
        publicationYear: 2008,
        readingStatus: 'completed',
        readingProgress: 100,
        bookType: 'digital',
        filePath: 'C:/books/cleancode.pdf',
        digitalFormat: 'PDF',
      },
      {
        title: 'Design Patterns',
        author: 'Erich Gamma',
        publicationYear: 1994,
        readingStatus: 'unread',
        readingProgress: 0,
        bookType: 'digital',
        filePath: 'C:/books/designpatterns.epub',
        digitalFormat: 'EPUB',
      },
    ];

    for (const b of seedBooks) {
      repo.addBook(b);
    }
  });

  describe('Pagination & Page Calculations', () => {
    it('returns first page with default pageSize 24', () => {
      const res = repo.getPaginatedWorks();
      assert.strictEqual(res.totalCount, 5);
      assert.strictEqual(res.page, 1);
      assert.strictEqual(res.pageSize, 24);
      assert.strictEqual(res.totalPages, 1);
      assert.strictEqual(res.items.length, 5);
    });

    it('handles custom page and pageSize correctly', () => {
      const resPage1 = repo.getPaginatedWorks({ page: 1, pageSize: 2 });
      assert.strictEqual(resPage1.totalCount, 5);
      assert.strictEqual(resPage1.page, 1);
      assert.strictEqual(resPage1.pageSize, 2);
      assert.strictEqual(resPage1.totalPages, 3);
      assert.strictEqual(resPage1.items.length, 2);

      const resPage2 = repo.getPaginatedWorks({ page: 2, pageSize: 2 });
      assert.strictEqual(resPage2.page, 2);
      assert.strictEqual(resPage2.items.length, 2);
      assert.notStrictEqual(resPage1.items[0].id, resPage2.items[0].id);

      const resPage3 = repo.getPaginatedWorks({ page: 3, pageSize: 2 });
      assert.strictEqual(resPage3.page, 3);
      assert.strictEqual(resPage3.items.length, 1);
    });
  });

  describe('Multi-criteria Sorting', () => {
    it('sorts by title ascending and descending', () => {
      const asc = repo.getPaginatedWorks({ sortBy: 'title', sortDirection: 'asc' });
      assert.ok(asc.items.length > 0);
      
      const desc = repo.getPaginatedWorks({ sortBy: 'title', sortDirection: 'desc' });
      assert.ok(desc.items.length > 0);
      assert.notStrictEqual(asc.items[0].id, desc.items[0].id);
    });

    it('sorts by publication year ascending and descending', () => {
      const ascYear = repo.getPaginatedWorks({ sortBy: 'year', sortDirection: 'asc' });
      assert.strictEqual(ascYear.items[0].publicationYear, 846); // البخاري

      const descYear = repo.getPaginatedWorks({ sortBy: 'year', sortDirection: 'desc' });
      assert.strictEqual(descYear.items[0].publicationYear, 2008); // Clean Code
    });

    it('sorts by reading progress', () => {
      const descProgress = repo.getPaginatedWorks({ sortBy: 'progress', sortDirection: 'desc' });
      assert.strictEqual(descProgress.items[0].readingProgress, 100);

      const ascProgress = repo.getPaginatedWorks({ sortBy: 'progress', sortDirection: 'asc' });
      assert.strictEqual(ascProgress.items[0].readingProgress, 0);
    });
  });

  describe('Multi-column SQL Filtering', () => {
    it('filters by search term in title or author', () => {
      const res1 = repo.getPaginatedWorks({ search: 'خلدون' });
      assert.strictEqual(res1.totalCount, 1);
      assert.strictEqual(res1.items[0].title, 'مقدمة ابن خلدون');

      const res2 = repo.getPaginatedWorks({ search: 'Martin' });
      assert.strictEqual(res2.totalCount, 1);
      assert.strictEqual(res2.items[0].author, 'Robert C. Martin');
    });

    it('filters by bookType (physical vs digital)', () => {
      const physical = repo.getPaginatedWorks({ bookType: 'physical' });
      assert.strictEqual(physical.totalCount, 2);

      const digital = repo.getPaginatedWorks({ bookType: 'digital' });
      assert.strictEqual(digital.totalCount, 3);
    });

    it('filters by readingStatus', () => {
      const completed = repo.getPaginatedWorks({ readingStatus: 'completed' });
      assert.strictEqual(completed.totalCount, 2);

      const reading = repo.getPaginatedWorks({ readingStatus: 'reading' });
      assert.strictEqual(reading.totalCount, 1);
      assert.strictEqual(reading.items[0].title, 'صحيح البخاري');
    });

    it('filters by location', () => {
      const inRoom = repo.getPaginatedWorks({ location: 'القاعة الرئيسية' });
      assert.strictEqual(inRoom.totalCount, 2);

      const onShelf = repo.getPaginatedWorks({ location: 'رف الحديث' });
      assert.strictEqual(onShelf.totalCount, 1);
      assert.strictEqual(onShelf.items[0].title, 'صحيح البخاري');
    });

    it('filters by digitalFormat', () => {
      const epubs = repo.getPaginatedWorks({ digitalFormat: 'EPUB' });
      assert.strictEqual(epubs.totalCount, 1);
      assert.strictEqual(epubs.items[0].title, 'Design Patterns');

      const pdfs = repo.getPaginatedWorks({ digitalFormat: 'PDF' });
      assert.strictEqual(pdfs.totalCount, 2);
    });
  });

  describe('Bulk Operations (KEY-110)', () => {
    it('bulk updates reading status and progress', () => {
      const all = repo.getAllWorks();
      const ids = [all[0].id, all[1].id];

      const affected = repo.bulkUpdateReadingStatus(ids, 'completed', 100);
      assert.strictEqual(affected, 2);

      const b0 = repo.getById(ids[0])!;
      const b1 = repo.getById(ids[1])!;
      assert.strictEqual(b0.readingStatus, 'completed');
      assert.strictEqual(b0.readingProgress, 100);
      assert.strictEqual(b1.readingStatus, 'completed');
      assert.strictEqual(b1.readingProgress, 100);
    });

    it('bulk adds tags to multiple works', () => {
      const all = repo.getAllWorks();
      const ids = [all[0].id, all[1].id];

      const affected = repo.bulkAddTags(ids, ['تاريخ', 'تراث']);
      assert.ok(affected >= 2);

      const b0 = repo.getById(ids[0])!;
      assert.ok(b0.tags?.includes('تاريخ'));
    });

    it('bulk deletes works atomically', () => {
      const all = repo.getAllWorks();
      const idsToDelete = [all[0].id, all[1].id];

      const deleted = repo.bulkDelete(idsToDelete);
      assert.strictEqual(deleted, 2);

      const after = repo.getAllWorks();
      assert.strictEqual(after.length, 3);
      assert.strictEqual(repo.getById(idsToDelete[0]), null);
      assert.strictEqual(repo.getById(idsToDelete[1]), null);
    });
  });
});
