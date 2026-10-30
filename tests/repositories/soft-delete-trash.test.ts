import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import type { BookItemInput } from '../../src/shared/types/work';

describe('SqliteWorkRepository - Soft Delete & Trash Bin (KEY-45 & KEY-44)', () => {
  let db: Database.Database;
  let repo: SqliteWorkRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteWorkRepository(db);
  });

  const createSampleBook = (title: string, author: string = 'مؤلف تجريبي'): BookItemInput => ({
    title,
    author,
    language: 'ar',
    categories: ['أدب'],
  });

  describe('Single Book Soft Delete & Restore', () => {
    it('soft deletes a book and excludes it from active queries', () => {
      const book1 = repo.addBook(createSampleBook('كتاب أول'));
      const book2 = repo.addBook(createSampleBook('كتاب ثان'));

      assert.strictEqual(repo.getAllWorks().length, 2);
      assert.strictEqual(repo.getTrashCount(), 0);

      // Soft delete book1
      const softDeleted = repo.softDeleteBook(book1.id);
      assert.strictEqual(softDeleted, true);

      // Active list should only contain book2
      const activeWorks = repo.getAllWorks();
      assert.strictEqual(activeWorks.length, 1);
      assert.strictEqual(activeWorks[0].id, book2.id);

      // getById still retrieves the record with deletedAt timestamp
      const fetchedBook1 = repo.getById(book1.id);
      assert.ok(fetchedBook1);
      assert.ok(fetchedBook1.deletedAt);

      // Trash queries
      assert.strictEqual(repo.getTrashCount(), 1);
      const trashWorks = repo.getTrashWorks();
      assert.strictEqual(trashWorks.length, 1);
      assert.strictEqual(trashWorks[0].id, book1.id);
    });

    it('restores a soft-deleted book back to active queries', () => {
      const book = repo.addBook(createSampleBook('كتاب قابل للاسترجاع'));
      repo.softDeleteBook(book.id);

      assert.strictEqual(repo.getAllWorks().length, 0);
      assert.strictEqual(repo.getTrashCount(), 1);

      // Restore book
      const restored = repo.restoreBook(book.id);
      assert.strictEqual(restored, true);

      // Active list should have the book back
      const activeWorks = repo.getAllWorks();
      assert.strictEqual(activeWorks.length, 1);
      assert.strictEqual(activeWorks[0].id, book.id);
      assert.strictEqual(activeWorks[0].deletedAt, undefined);

      assert.strictEqual(repo.getTrashCount(), 0);
      assert.strictEqual(repo.getTrashWorks().length, 0);
    });

    it('permanently deletes a soft-deleted book', () => {
      const book = repo.addBook(createSampleBook('كتاب للحذف النهائي'));
      repo.softDeleteBook(book.id);
      assert.strictEqual(repo.getTrashCount(), 1);

      const permanentlyDeleted = repo.permanentlyDeleteBook(book.id);
      assert.strictEqual(permanentlyDeleted, true);

      assert.strictEqual(repo.getById(book.id), null);
      assert.strictEqual(repo.getTrashCount(), 0);
      assert.strictEqual(repo.getAllWorks().length, 0);
    });
  });

  describe('Bulk Operations (KEY-44 & KEY-45)', () => {
    it('bulk soft-deletes and bulk restores multiple books atomically', () => {
      const b1 = repo.addBook(createSampleBook('كتاب 1'));
      const b2 = repo.addBook(createSampleBook('كتاب 2'));
      const b3 = repo.addBook(createSampleBook('كتاب 3'));

      assert.strictEqual(repo.getAllWorks().length, 3);

      // Bulk soft delete b1 and b2
      const deletedCount = repo.bulkSoftDelete([b1.id, b2.id]);
      assert.strictEqual(deletedCount, 2);

      // Active should only have b3
      const active = repo.getAllWorks();
      assert.strictEqual(active.length, 1);
      assert.strictEqual(active[0].id, b3.id);

      // Trash count should be 2
      assert.strictEqual(repo.getTrashCount(), 2);

      // Bulk restore b1 and b2
      const restoredCount = repo.bulkRestore([b1.id, b2.id]);
      assert.strictEqual(restoredCount, 2);

      assert.strictEqual(repo.getAllWorks().length, 3);
      assert.strictEqual(repo.getTrashCount(), 0);
    });

    it('bulk permanent delete removes specified items completely', () => {
      const b1 = repo.addBook(createSampleBook('كتاب 1'));
      const b2 = repo.addBook(createSampleBook('كتاب 2'));
      const b3 = repo.addBook(createSampleBook('كتاب 3'));

      repo.bulkSoftDelete([b1.id, b2.id, b3.id]);
      assert.strictEqual(repo.getTrashCount(), 3);

      const deletedCount = repo.bulkPermanentDelete([b1.id, b2.id]);
      assert.strictEqual(deletedCount, 2);

      assert.strictEqual(repo.getTrashCount(), 1);
      assert.strictEqual(repo.getTrashWorks()[0].id, b3.id);
      assert.strictEqual(repo.getById(b1.id), null);
      assert.strictEqual(repo.getById(b2.id), null);
    });

    it('emptyTrash deletes all soft-deleted books in one call', () => {
      const b1 = repo.addBook(createSampleBook('كتاب 1'));
      const b2 = repo.addBook(createSampleBook('كتاب 2'));
      const activeBook = repo.addBook(createSampleBook('كتاب نشط'));

      repo.bulkSoftDelete([b1.id, b2.id]);
      assert.strictEqual(repo.getTrashCount(), 2);

      const emptiedCount = repo.emptyTrash();
      assert.strictEqual(emptiedCount, 2);

      assert.strictEqual(repo.getTrashCount(), 0);
      assert.strictEqual(repo.getTrashWorks().length, 0);

      // Active book remains untouched
      const activeWorks = repo.getAllWorks();
      assert.strictEqual(activeWorks.length, 1);
      assert.strictEqual(activeWorks[0].id, activeBook.id);
    });
  });

  describe('Pagination Filtering with Trash Bin', () => {
    it('paginates active books excluding trash, and queries trash with storageFilter: TRASH', () => {
      const b1 = repo.addBook(createSampleBook('نشط 1'));
      const b2 = repo.addBook(createSampleBook('محذوف 1'));
      const b3 = repo.addBook(createSampleBook('نشط 2'));
      const b4 = repo.addBook(createSampleBook('محذوف 2'));

      repo.bulkSoftDelete([b2.id, b4.id]);

      // Active pagination
      const activePage = repo.getPaginatedWorks({ page: 1, pageSize: 10 });
      assert.strictEqual(activePage.totalCount, 2);
      assert.deepStrictEqual(activePage.items.map(b => b.id).sort(), [b1.id, b3.id].sort());

      // Trash pagination
      const trashPage = repo.getPaginatedWorks({ page: 1, pageSize: 10, storageFilter: 'TRASH' });
      assert.strictEqual(trashPage.totalCount, 2);
      assert.deepStrictEqual(trashPage.items.map(b => b.id).sort(), [b2.id, b4.id].sort());
    });
  });
});
