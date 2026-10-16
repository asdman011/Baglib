import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/test-db';
import { PhysicalLibraryService } from '../../src/main/services/physical/physical-library.service';
import crypto from 'crypto';

describe('Physical Library & Lending Service (Story 8 / KEY-5)', () => {
  let db: Database.Database;
  let service: PhysicalLibraryService;

  beforeEach(() => {
    db = createTestDatabase();
    service = new PhysicalLibraryService(db);
  });

  afterEach(() => {
    db.close();
  });

  function seedPhysicalBook(options: {
    workId: string;
    title: string;
    room?: string;
    bookcase?: string;
    shelf?: string;
    shelfSection?: string;
    condition?: string;
    price?: number;
    lendingStatus?: string;
  }) {
    const editionId = `ed-${options.workId}`;
    const sourceId = `src-${options.workId}`;

    db.prepare(`
      INSERT INTO work (id, work_type_id, title, original_language, reading_status, created_at)
      VALUES (?, 'wt-book', ?, 'العربية', 'unread', datetime('now'))
    `).run(options.workId, options.title);

    db.prepare(`
      INSERT INTO edition (id, work_id, label)
      VALUES (?, ?, 'الطبعة الأولى')
    `).run(editionId, options.workId);

    db.prepare(`
      INSERT INTO source (id, edition_id, source_type, status, added_at)
      VALUES (?, ?, 'physical', ?, datetime('now'))
    `).run(sourceId, editionId, options.lendingStatus || 'available');

    db.prepare(`
      INSERT INTO physical_source_detail (source_id, room, bookcase, shelf, shelf_section, condition, price, lending_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sourceId,
      options.room || null,
      options.bookcase || null,
      options.shelf || null,
      options.shelfSection || null,
      options.condition || null,
      options.price || null,
      options.lendingStatus || 'available'
    );
  }

  describe('Subtask 8.1: Physical Copy Location Hierarchy & Inventory Service', () => {
    it('retrieves distinct rooms, bookcases, and shelves for autocomplete', () => {
      seedPhysicalBook({
        workId: 'w1',
        title: 'صحيح البخاري',
        room: 'المكتبة الرئيسية',
        bookcase: 'خزانة الحديث',
        shelf: 'الرف 1',
        shelfSection: 'أ',
      });

      seedPhysicalBook({
        workId: 'w2',
        title: 'صحيح مسلم',
        room: 'المكتبة الرئيسية',
        bookcase: 'خزانة الحديث',
        shelf: 'الرف 2',
        shelfSection: 'ب',
      });

      seedPhysicalBook({
        workId: 'w3',
        title: 'مقدمة ابن خلدون',
        room: 'غرفة القراءة',
        bookcase: 'خزانة التاريخ',
        shelf: 'الرف العلوي',
      });

      const locations = service.getLocations();
      assert.strictEqual(locations.rooms.length, 2);
      assert.ok(locations.rooms.includes('المكتبة الرئيسية'));
      assert.ok(locations.rooms.includes('غرفة القراءة'));

      assert.strictEqual(locations.bookcases.length, 2);
      assert.ok(locations.bookcases.includes('خزانة الحديث'));
      assert.ok(locations.bookcases.includes('خزانة التاريخ'));

      assert.strictEqual(locations.shelves.length, 3);
      assert.ok(locations.shelves.includes('الرف 1'));
      assert.ok(locations.shelves.includes('الرف 2'));
      assert.ok(locations.shelves.includes('الرف العلوي'));
    });

    it('builds a hierarchical tree grouped by Room -> Bookcase -> Shelf with book counts', () => {
      seedPhysicalBook({
        workId: 'w1',
        title: 'الكتاب الأول',
        room: 'غرفة 1',
        bookcase: 'خزانة أ',
        shelf: 'رف 1',
      });
      seedPhysicalBook({
        workId: 'w2',
        title: 'الكتاب الثاني',
        room: 'غرفة 1',
        bookcase: 'خزانة أ',
        shelf: 'رف 1',
      });
      seedPhysicalBook({
        workId: 'w3',
        title: 'الكتاب الثالث',
        room: 'غرفة 1',
        bookcase: 'خزانة ب',
        shelf: 'رف 2',
      });

      const tree = service.getLocationTree();
      assert.strictEqual(tree.length, 1);
      assert.strictEqual(tree[0].room, 'غرفة 1');
      assert.strictEqual(tree[0].count, 3);

      assert.strictEqual(tree[0].bookcases.length, 2);
      const bA = tree[0].bookcases.find((b) => b.bookcase === 'خزانة أ');
      assert.ok(bA);
      assert.strictEqual(bA.count, 2);
      assert.strictEqual(bA.shelves[0].shelf, 'رف 1');
      assert.strictEqual(bA.shelves[0].count, 2);
    });

    it('calculates physical inventory statistics, condition counts, and total valuation', () => {
      seedPhysicalBook({
        workId: 'w1',
        title: 'كتاب قيّم',
        room: 'المكتبة الخاصة',
        condition: 'new',
        price: 25.5,
        lendingStatus: 'available',
      });
      seedPhysicalBook({
        workId: 'w2',
        title: 'كتاب أثري',
        room: 'المكتبة الخاصة',
        condition: 'antique',
        price: 150.0,
        lendingStatus: 'loaned',
      });

      const stats = service.getPhysicalInventoryStats();
      assert.strictEqual(stats.totalPhysicalBooks, 2);
      assert.strictEqual(stats.borrowedCount, 1);
      assert.strictEqual(stats.availableCount, 1);
      assert.strictEqual(stats.conditionDistribution['new'], 1);
      assert.strictEqual(stats.conditionDistribution['antique'], 1);
      assert.strictEqual(stats.totalEstimatedValue, 175.5);
    });

    it('updates physical location and acquisition data for an existing work', () => {
      seedPhysicalBook({
        workId: 'w-update-loc',
        title: 'كتاب قابل للتعديل',
        room: 'الموقع القديم',
        shelf: 'الرف القديم',
      });

      const success = service.updatePhysicalLocation({
        workId: 'w-update-loc',
        room: 'المكتبة الجديدة',
        bookcase: 'خزانة رقم 4',
        shelf: 'الرف الأوسط',
        condition: 'good',
        price: 45,
        purchaseDate: '2026-05-10',
      });

      assert.strictEqual(success, true);

      const row = db.prepare(`
        SELECT psd.* FROM physical_source_detail psd
        JOIN source s ON s.id = psd.source_id
        JOIN edition e ON e.id = s.edition_id
        WHERE e.work_id = ?
      `).get('w-update-loc') as any;

      assert.strictEqual(row.room, 'المكتبة الجديدة');
      assert.strictEqual(row.bookcase, 'خزانة رقم 4');
      assert.strictEqual(row.shelf, 'الرف الأوسط');
      assert.strictEqual(row.condition, 'good');
      assert.strictEqual(row.price, 45);
      assert.strictEqual(row.purchase_date, '2026-05-10');
    });
  });

  describe('Subtask 8.2: Lending Lifecycle, Borrower Management & Overdue Service', () => {
    it('borrows a book, records loan details, and syncs physical copy status to loaned', () => {
      seedPhysicalBook({
        workId: 'w-loan-1',
        title: 'تاريخ بغداد',
        lendingStatus: 'available',
      });

      const loan = service.borrowBook({
        workId: 'w-loan-1',
        borrowerName: 'أحمد الفاروق',
        borrowerContact: '+9647701234567',
        borrowDate: new Date().toISOString().split('T')[0],
        expectedReturnDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
        notes: 'إعارة للأبحاث الأكاديمية',
      });

      assert.ok(loan.id);
      assert.strictEqual(loan.borrowerName, 'أحمد الفاروق');
      assert.strictEqual(loan.isReturned, false);

      // Verify physical_source_detail status updated
      const psd = db.prepare(`
        SELECT psd.lending_status FROM physical_source_detail psd
        JOIN source s ON s.id = psd.source_id
        JOIN edition e ON e.id = s.edition_id
        WHERE e.work_id = ?
      `).get('w-loan-1') as any;

      assert.strictEqual(psd.lending_status, 'loaned');
    });

    it('rejects loaning a book that is already borrowed by another user', () => {
      seedPhysicalBook({
        workId: 'w-loan-conflict',
        title: 'كتاب محجوز',
        lendingStatus: 'available',
      });

      service.borrowBook({
        workId: 'w-loan-conflict',
        borrowerName: 'المستعير الأول',
      });

      assert.throws(() => {
        service.borrowBook({
          workId: 'w-loan-conflict',
          borrowerName: 'المستعير الثاني',
        });
      }, /معار حالياً/);
    });

    it('returns a book, records return notes, and restores availability status', () => {
      seedPhysicalBook({
        workId: 'w-return-1',
        title: 'المعجم الوسيط',
        condition: 'new',
        lendingStatus: 'available',
      });

      const loan = service.borrowBook({
        workId: 'w-return-1',
        borrowerName: 'سارة العبيدي',
        conditionOut: 'new',
      });

      const returned = service.returnBook({
        loanId: loan.id,
        actualReturnDate: '2026-10-14',
        conditionOnReturn: 'good',
        notes: 'تمت إعادته بحالة جيدة جداً',
      });

      assert.strictEqual(returned.isReturned, true);
      assert.strictEqual(returned.actualReturnDate, '2026-10-14');
      assert.strictEqual(returned.conditionOnReturn, 'good');

      // Verify physical copy restored to available
      const psd = db.prepare(`
        SELECT psd.lending_status, psd.condition FROM physical_source_detail psd
        JOIN source s ON s.id = psd.source_id
        JOIN edition e ON e.id = s.edition_id
        WHERE e.work_id = ?
      `).get('w-return-1') as any;

      assert.strictEqual(psd.lending_status, 'available');
      assert.strictEqual(psd.condition, 'good');
    });

    it('detects and flags overdue loans when expected return date has passed', () => {
      seedPhysicalBook({
        workId: 'w-overdue-1',
        title: 'كتاب متأخر',
        lendingStatus: 'available',
      });

      service.borrowBook({
        workId: 'w-overdue-1',
        borrowerName: 'خالد المنصور',
        borrowDate: '2026-09-01',
        expectedReturnDate: '2026-09-15', // Passed date
      });

      const audit = service.checkAndRefreshOverdueLoans();
      assert.ok(audit.overdueCount >= 1);
      const overdueItem = audit.refreshedLoans.find((l) => l.workId === 'w-overdue-1');
      assert.ok(overdueItem);
      assert.strictEqual(overdueItem.borrowerName, 'خالد المنصور');
      assert.ok(overdueItem.daysOverdue > 0);

      // Verify database updated
      const psd = db.prepare(`
        SELECT psd.lending_status FROM physical_source_detail psd
        JOIN source s ON s.id = psd.source_id
        JOIN edition e ON e.id = s.edition_id
        WHERE e.work_id = ?
      `).get('w-overdue-1') as any;

      assert.strictEqual(psd.lending_status, 'overdue');
    });

    it('aggregates borrower statistics and borrower contact history', () => {
      seedPhysicalBook({ workId: 'b-stat-1', title: 'كتاب 1' });
      seedPhysicalBook({ workId: 'b-stat-2', title: 'كتاب 2' });

      const l1 = service.borrowBook({
        workId: 'b-stat-1',
        borrowerName: 'علي كمال',
        borrowerContact: 'ali@example.com',
      });
      service.returnBook({ loanId: l1.id });

      service.borrowBook({
        workId: 'b-stat-2',
        borrowerName: 'علي كمال',
        borrowerContact: 'ali@example.com',
      });

      const borrowers = service.getBorrowers();
      const ali = borrowers.find((b) => b.borrowerName === 'علي كمال');
      assert.ok(ali);
      assert.strictEqual(ali.totalLoans, 2);
      assert.strictEqual(ali.activeLoans, 1);
      assert.strictEqual(ali.borrowerContact, 'ali@example.com');
    });
  });
});
