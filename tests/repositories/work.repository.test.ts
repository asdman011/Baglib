import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import type { BookItemInput } from '../../src/shared/types/work';

describe('SqliteWorkRepository', () => {
  let db: Database.Database;
  let repo: SqliteWorkRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteWorkRepository(db);
  });

  describe('Empty and Missing-data Cases', () => {
    it('returns empty array when no works exist', () => {
      const works = repo.getAllWorks();
      assert.deepStrictEqual(works, []);
    });

    it('returns null when querying non-existent work ID', () => {
      const work = repo.getById('non-existent-id-1234');
      assert.strictEqual(work, null);
    });

    it('returns false when attempting to delete non-existent work', () => {
      const deleted = repo.deleteBook('non-existent-id-1234');
      assert.strictEqual(deleted, false);
    });

    it('handles minimal input without crashing or throwing', () => {
      const minimalInput: BookItemInput = {
        title: 'كتاب مبسط',
        author: 'مؤلف غير معروف',
      };

      const result = repo.addBook(minimalInput);
      assert.ok(result.id);
      assert.strictEqual(result.title, 'كتاب مبسط');
      assert.strictEqual(result.author, 'مؤلف غير معروف');
      assert.deepStrictEqual(result.categories, []);
      assert.strictEqual(result.primaryCategory, null);
      assert.strictEqual(result.language, 'العربية');

      // Verify retrieval from DB
      const retrieved = repo.getById(result.id);
      assert.ok(retrieved);
      assert.strictEqual(retrieved.title, 'كتاب مبسط');
      assert.strictEqual(retrieved.author, 'مؤلف غير معروف');
      assert.strictEqual(retrieved.edition, undefined);
      assert.strictEqual(retrieved.publisher, undefined);
      assert.strictEqual(retrieved.publicationYear, undefined);
      assert.strictEqual(retrieved.primaryCategory, null);
    });
  });

  describe('Normal Operations and Typed Object Mapping', () => {
    it('creates and maps a comprehensive physical book item', () => {
      // First, create a category to link to
      db.prepare(`
        INSERT INTO category (id, parent_id, name_ar, name_en, display_order)
        VALUES ('cat-aqeedah', NULL, 'العقيدة', 'Creed', 1)
      `).run();

      const input: BookItemInput = {
        id: 'book-phys-1',
        title: 'شرح العقيدة الواسطية',
        author: 'ابن تيمية',
        edition: 'طبعة دار المنهاج',
        publisher: 'دار المنهاج',
        publicationYear: 2018,
        isbn: '978-9953-0-1234-5',
        shelf: 'رف أ1',
        room: 'المكتبة الرئيسية',
        language: 'العربية',
        categories: ['عقيدة', 'شروح'],
        primaryCategory: {
          id: 'cat-aqeedah',
          nameAr: 'العقيدة',
          nameEn: 'Creed',
        },
        condition: 'ممتازة',
        bookType: 'physical',
      };

      const added = repo.addBook(input);
      assert.strictEqual(added.id, 'book-phys-1');
      assert.strictEqual(added.title, 'شرح العقيدة الواسطية');

      const all = repo.getAllWorks();
      assert.strictEqual(all.length, 1);
      const book = all[0];

      assert.strictEqual(book.id, 'book-phys-1');
      assert.strictEqual(book.title, 'شرح العقيدة الواسطية');
      assert.strictEqual(book.author, 'ابن تيمية');
      assert.strictEqual(book.edition, 'طبعة دار المنهاج');
      assert.strictEqual(book.publisher, 'دار المنهاج');
      assert.strictEqual(book.publicationYear, 2018);
      assert.strictEqual(book.isbn, '978-9953-0-1234-5');
      assert.strictEqual(book.shelf, 'رف أ1');
      assert.strictEqual(book.room, 'المكتبة الرئيسية');
      assert.strictEqual(book.condition, 'ممتازة');
      assert.strictEqual(book.bookType, 'physical');
      assert.ok(book.categories.includes('عقيدة'));
      assert.ok(book.categories.includes('شروح'));
      assert.deepStrictEqual(book.primaryCategory, {
        id: 'cat-aqeedah',
        nameAr: 'العقيدة',
        nameEn: 'Creed',
      });
    });

    it('creates and maps a digital book with PDF source detail', () => {
      const input: BookItemInput = {
        id: 'book-dig-1',
        title: 'زاد المعاد',
        author: 'ابن القيم',
        bookType: 'digital',
        filePath: 'C:/Books/zad_al_maad.pdf',
        digitalFormat: 'PDF',
      };

      repo.addBook(input);

      const retrieved = repo.getById('book-dig-1');
      assert.ok(retrieved);
      assert.strictEqual(retrieved.title, 'زاد المعاد');
      assert.strictEqual(retrieved.bookType, 'digital');
      assert.strictEqual(retrieved.filePath, 'C:/Books/zad_al_maad.pdf');
      assert.strictEqual(retrieved.digitalFormat, 'PDF');
    });

    it('updates an existing book successfully', () => {
      const initial: BookItemInput = {
        id: 'book-upd-1',
        title: 'العنوان الأصلي',
        author: 'مؤلف أول',
        edition: 'طبعة 1',
      };
      repo.addBook(initial);

      const updateData: BookItemInput = {
        id: 'book-upd-1',
        title: 'العنوان المعدل',
        author: 'مؤلف ثان',
        edition: 'طبعة 2 منقحة',
        publicationYear: 2024,
      };
      repo.updateBook(updateData);

      const retrieved = repo.getById('book-upd-1');
      assert.ok(retrieved);
      assert.strictEqual(retrieved.title, 'العنوان المعدل');
      assert.strictEqual(retrieved.author, 'مؤلف ثان');
      assert.strictEqual(retrieved.edition, 'طبعة 2 منقحة');
      assert.strictEqual(retrieved.publicationYear, 2024);
    });

    it('updates when addBook is called with an existing ID (upsert behavior)', () => {
      repo.addBook({
        id: 'book-dup-1',
        title: 'نسخة أولى',
        author: 'الذهبي',
      });

      // Calling addBook again with same ID should not fail with UNIQUE constraint
      assert.doesNotThrow(() => {
        repo.addBook({
          id: 'book-dup-1',
          title: 'نسخة محدثة',
          author: 'الذهبي',
        });
      });

      const retrieved = repo.getById('book-dup-1');
      assert.ok(retrieved);
      assert.strictEqual(retrieved.title, 'نسخة محدثة');
    });

    it('reuses existing author when multiple books share the same author', () => {
      repo.addBook({ title: 'الكتاب الأول', author: 'البخاري' });
      repo.addBook({ title: 'الكتاب الثاني', author: 'البخاري' });

      const authors = db.prepare('SELECT * FROM author WHERE name = ?').all('البخاري');
      assert.strictEqual(authors.length, 1);
    });

    it('deletes a book and cascades to editions and sources', () => {
      repo.addBook({
        id: 'book-del-1',
        title: 'كتاب للحذف',
        author: 'مؤلف مؤقت',
        filePath: 'temp.pdf',
      });

      assert.ok(repo.getById('book-del-1'));

      const deleted = repo.deleteBook('book-del-1');
      assert.strictEqual(deleted, true);
      assert.strictEqual(repo.getById('book-del-1'), null);

      // Verify cascade in SQLite tables
      const works = db.prepare('SELECT id FROM work WHERE id = ?').all('book-del-1');
      const editions = db.prepare('SELECT id FROM edition WHERE work_id = ?').all('book-del-1');
      assert.strictEqual(works.length, 0);
      assert.strictEqual(editions.length, 0);
    });
  });
});
