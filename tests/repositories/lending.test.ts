import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import type { BookItemInput } from '../../src/shared/types/work';

describe('Lending History Repository Tests (Task 4.4)', () => {
  let db: Database.Database;
  let repo: SqliteWorkRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteWorkRepository(db);
  });

  it('records loans, retrieves lending history, and updates availability status', () => {
    const book: BookItemInput = {
      id: 'book-lend-1',
      title: 'مقدمة ابن خلدون',
      author: 'ابن خلدون',
      bookType: 'physical',
      shelf: 'رف الفلسفة والتاريخ',
    };

    repo.addBook(book);

    // Initial state: no loans
    const initialLoans = repo.getLendingHistory('book-lend-1');
    assert.deepStrictEqual(initialLoans, []);

    // Record an active loan
    const loan1 = repo.recordLoan('book-lend-1', {
      borrowerName: 'أحمد الفاروق',
      borrowerContact: '+9647701234567',
      borrowDate: '2026-10-01',
      expectedReturnDate: '2026-10-15',
      notes: 'نسخة دار المعارف الفاخرة',
    });

    assert.ok(loan1.id);
    assert.strictEqual(loan1.borrowerName, 'أحمد الفاروق');
    assert.strictEqual(loan1.isReturned, false);

    // Verify active loans query
    const activeLoans = repo.getActiveLoans();
    assert.strictEqual(activeLoans.length, 1);
    assert.strictEqual(activeLoans[0].workTitle, 'مقدمة ابن خلدون');
    assert.strictEqual(activeLoans[0].borrowerName, 'أحمد الفاروق');

    // Verify physical source detail lending_status is 'loaned'
    const psd = db.prepare(`
      SELECT psd.lending_status FROM physical_source_detail psd
      JOIN source s ON s.id = psd.source_id
      JOIN edition e ON e.id = s.edition_id
      WHERE e.work_id = 'book-lend-1'
    `).get() as { lending_status: string };
    assert.strictEqual(psd.lending_status, 'loaned');

    // Retrieve full work via getById and check lendingHistory array
    const fetched = repo.getById('book-lend-1');
    assert.ok(fetched);
    assert.strictEqual(fetched.lendingHistory.length, 1);
    assert.strictEqual(fetched.lendingHistory[0].borrowerName, 'أحمد الفاروق');

    // Return the loan
    const returned = repo.returnLoan(loan1.id, '2026-10-10', 'حالة ممتازة دون أي ضرر');
    assert.strictEqual(returned.isReturned, true);
    assert.strictEqual(returned.actualReturnDate, '2026-10-10');
    assert.strictEqual(returned.conditionOnReturn, 'حالة ممتازة دون أي ضرر');

    // Active loans count should now be 0
    assert.strictEqual(repo.getActiveLoans().length, 0);

    // Physical source detail should be restored to 'available'
    const psdAfter = db.prepare(`
      SELECT psd.lending_status FROM physical_source_detail psd
      JOIN source s ON s.id = psd.source_id
      JOIN edition e ON e.id = s.edition_id
      WHERE e.work_id = 'book-lend-1'
    `).get() as { lending_status: string };
    assert.strictEqual(psdAfter.lending_status, 'available');
  });

  it('accurately identifies overdue loans based on expectedReturnDate', () => {
    const book: BookItemInput = {
      id: 'book-lend-2',
      title: 'تاريخ الطبري',
      author: 'الطبري',
      bookType: 'physical',
    };

    repo.addBook(book);

    // Create a loan due in the past
    repo.recordLoan('book-lend-2', {
      borrowerName: 'عمر التميمي',
      borrowDate: '2026-09-01',
      expectedReturnDate: '2026-09-15', // Past date
      isReturned: false,
    });

    const loans = repo.getLendingHistory('book-lend-2');
    assert.strictEqual(loans.length, 1);
    assert.strictEqual((loans[0] as any).status, 'overdue');

    const activeList = repo.getActiveLoans();
    assert.strictEqual(activeList[0].status, 'overdue');
  });

  it('cascades deletion of work to lending records', () => {
    const book: BookItemInput = {
      id: 'book-lend-3',
      title: 'كتاب سيبويه',
      author: 'سيبويه',
    };

    repo.addBook(book);
    repo.recordLoan('book-lend-3', { borrowerName: 'خالد النحوي' });

    assert.strictEqual(repo.getLendingHistory('book-lend-3').length, 1);

    repo.deleteBook('book-lend-3');
    assert.strictEqual(repo.getLendingHistory('book-lend-3').length, 0);
  });
});
