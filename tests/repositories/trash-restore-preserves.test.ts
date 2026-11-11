import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';

// KEY-45 acceptance: restoring from the trash keeps the book's metadata and reading progress,
// for a single restore and for a bulk restore.
describe('Trash restore keeps metadata and progress (KEY-45)', () => {
  const sample = (title: string, readingProgress: number) => ({
    title,
    author: 'ابن خلدون Ibn Khaldun',
    language: 'ar',
    categories: ['تاريخ'],
    description: 'مقدمة في العمران — An introduction to history',
    readingStatus: 'reading' as const,
    readingProgress,
  });

  const snapshot = (book: ReturnType<SqliteWorkRepository['getById']>) => {
    assert.ok(book);
    return { title: book.title, author: book.author, language: book.language, description: book.description, readingStatus: book.readingStatus, readingProgress: book.readingProgress, categories: book.categories };
  };

  it('single soft delete and restore leaves every field unchanged', () => {
    const repo = new SqliteWorkRepository(createTestDatabase());
    const book = repo.addBook(sample('المقدمة', 42));
    const before = snapshot(repo.getById(book.id));
    assert.equal(before.readingProgress, 42);

    assert.equal(repo.softDeleteBook(book.id), true);
    assert.equal(repo.restoreBook(book.id), true);

    const after = repo.getById(book.id);
    assert.equal(after?.deletedAt, undefined);
    assert.deepEqual(snapshot(after), before);
  });

  it('bulk soft delete and restore leaves every field unchanged', () => {
    const repo = new SqliteWorkRepository(createTestDatabase());
    const books = [repo.addBook(sample('تاريخ الرسل والملوك', 10)), repo.addBook(sample('Why lyrics last', 75))];
    const before = books.map(book => snapshot(repo.getById(book.id)));

    repo.bulkSoftDelete(books.map(book => book.id));
    assert.equal(repo.getTrashCount(), 2);
    repo.bulkRestore(books.map(book => book.id));
    assert.equal(repo.getTrashCount(), 0);

    assert.deepEqual(books.map(book => snapshot(repo.getById(book.id))), before);
  });
});
