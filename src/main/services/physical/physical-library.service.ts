/**
 * Baglib — Physical Library & Lending Service
 *
 * Backend engine managing physical copy locations, shelf/room trees,
 * inventory valuation, borrower loans, and lending lifecycle transitions.
 */

import type { Database } from 'better-sqlite3';
import crypto from 'crypto';
import type {
  LocationHierarchy,
  LocationTreeNode,
  PhysicalInventoryStats,
  UpdatePhysicalLocationInput,
  BorrowBookInput,
  ReturnBookInput,
  BorrowerSummary,
  LendingAuditResult,
} from '../../../shared/types/physical-library';
import type { LendingRecord, LoanStatus } from '../../../shared/types/metadata';

export class PhysicalLibraryService {
  constructor(private db: Database) {}

  /**
   * Retrieves unique location strings for comboboxes and autocomplete suggestions.
   */
  public getLocations(): LocationHierarchy {
    const rooms = this.db.prepare(`
      SELECT DISTINCT room FROM physical_source_detail 
      WHERE room IS NOT NULL AND TRIM(room) != ''
      ORDER BY room ASC
    `).all().map((r: any) => r.room as string);

    const bookcases = this.db.prepare(`
      SELECT DISTINCT bookcase FROM physical_source_detail 
      WHERE bookcase IS NOT NULL AND TRIM(bookcase) != ''
      ORDER BY bookcase ASC
    `).all().map((r: any) => r.bookcase as string);

    const shelves = this.db.prepare(`
      SELECT DISTINCT shelf FROM physical_source_detail 
      WHERE shelf IS NOT NULL AND TRIM(shelf) != ''
      ORDER BY shelf ASC
    `).all().map((r: any) => r.shelf as string);

    const shelfSections = this.db.prepare(`
      SELECT DISTINCT shelf_section FROM physical_source_detail 
      WHERE shelf_section IS NOT NULL AND TRIM(shelf_section) != ''
      ORDER BY shelf_section ASC
    `).all().map((r: any) => r.shelf_section as string);

    return {
      rooms,
      bookcases,
      shelves,
      shelfSections,
    };
  }

  /**
   * Builds a structured hierarchical tree of physical locations:
   * Room -> Bookcase -> Shelf, including book counts per location.
   */
  public getLocationTree(): LocationTreeNode[] {
    const rows = this.db.prepare(`
      SELECT 
        COALESCE(NULLIF(TRIM(psd.room), ''), 'موقع غير محدد / Unspecified Room') as room,
        COALESCE(NULLIF(TRIM(psd.bookcase), ''), 'خزانة عامة / General Bookcase') as bookcase,
        COALESCE(NULLIF(TRIM(psd.shelf), ''), 'رف عام / General Shelf') as shelf,
        COUNT(DISTINCT w.id) as count
      FROM physical_source_detail psd
      JOIN source s ON s.id = psd.source_id
      JOIN edition e ON e.id = s.edition_id
      JOIN work w ON w.id = e.work_id
      GROUP BY room, bookcase, shelf
      ORDER BY room ASC, bookcase ASC, shelf ASC
    `).all() as { room: string; bookcase: string; shelf: string; count: number }[];

    const roomMap = new Map<string, {
      count: number;
      bookcaseMap: Map<string, { count: number; shelves: { shelf: string; count: number }[] }>;
    }>();

    for (const r of rows) {
      if (!roomMap.has(r.room)) {
        roomMap.set(r.room, { count: 0, bookcaseMap: new Map() });
      }
      const roomEntry = roomMap.get(r.room)!;
      roomEntry.count += r.count;

      if (!roomEntry.bookcaseMap.has(r.bookcase)) {
        roomEntry.bookcaseMap.set(r.bookcase, { count: 0, shelves: [] });
      }
      const bookcaseEntry = roomEntry.bookcaseMap.get(r.bookcase)!;
      bookcaseEntry.count += r.count;
      bookcaseEntry.shelves.push({
        shelf: r.shelf,
        count: r.count,
      });
    }

    const tree: LocationTreeNode[] = [];
    for (const [room, rData] of roomMap.entries()) {
      const bookcases = [];
      for (const [bookcase, bData] of rData.bookcaseMap.entries()) {
        bookcases.push({
          bookcase,
          count: bData.count,
          shelves: bData.shelves,
        });
      }
      tree.push({
        room,
        count: rData.count,
        bookcases,
      });
    }

    return tree;
  }

  /**
   * Computes comprehensive physical inventory statistics, condition counts, and estimated collection value.
   */
  public getPhysicalInventoryStats(): PhysicalInventoryStats {
    // 1. Refresh overdue loans first for fresh counts
    this.checkAndRefreshOverdueLoans();

    // 2. Count total physical books and status breakdown
    const totalRow = this.db.prepare(`
      SELECT 
        COUNT(DISTINCT w.id) as total,
        SUM(CASE WHEN psd.lending_status = 'loaned' THEN 1 ELSE 0 END) as loaned,
        SUM(CASE WHEN psd.lending_status = 'overdue' THEN 1 ELSE 0 END) as overdue,
        SUM(CASE WHEN psd.price IS NOT NULL AND psd.price > 0 THEN psd.price ELSE 0 END) as totalValue
      FROM physical_source_detail psd
      JOIN source s ON s.id = psd.source_id
      JOIN edition e ON e.id = s.edition_id
      JOIN work w ON w.id = e.work_id
    `).get() as any;

    const totalPhysicalBooks = totalRow?.total || 0;
    const borrowedCount = totalRow?.loaned || 0;
    const overdueCount = totalRow?.overdue || 0;
    const availableCount = Math.max(0, totalPhysicalBooks - borrowedCount - overdueCount);
    const totalEstimatedValue = Math.round((totalRow?.totalValue || 0) * 100) / 100;

    // 3. Condition distribution
    const conditionRows = this.db.prepare(`
      SELECT 
        COALESCE(NULLIF(TRIM(condition), ''), 'unspecified') as cond,
        COUNT(*) as count
      FROM physical_source_detail
      GROUP BY cond
    `).all() as { cond: string; count: number }[];

    const conditionDistribution: Record<string, number> = {};
    for (const row of conditionRows) {
      conditionDistribution[row.cond] = row.count;
    }

    // 4. Top physical rooms / locations
    const topLocations = this.db.prepare(`
      SELECT 
        COALESCE(NULLIF(TRIM(room), ''), 'Unspecified') as location,
        COUNT(*) as count
      FROM physical_source_detail
      GROUP BY location
      ORDER BY count DESC
      LIMIT 5
    `).all() as { location: string; count: number }[];

    return {
      totalPhysicalBooks,
      availableCount,
      borrowedCount,
      overdueCount,
      conditionDistribution,
      totalEstimatedValue,
      currencySummary: { default: totalEstimatedValue },
      topLocations,
    };
  }

  /**
   * Updates or assigns the physical location and acquisition data of a work.
   */
  public updatePhysicalLocation(input: UpdatePhysicalLocationInput): boolean {
    const { workId, room, bookcase, shelf, shelfSection, condition, purchaseDate, price } = input;

    const priceNum = price !== undefined && price !== null && price !== '' 
      ? parseFloat(String(price)) || null 
      : null;

    // Find the primary edition and source for this work
    let sourceRow = this.db.prepare(`
      SELECT s.id as sourceId, e.id as editionId
      FROM work w
      JOIN edition e ON e.work_id = w.id
      JOIN source s ON s.edition_id = e.id
      WHERE w.id = ?
      ORDER BY s.added_at ASC
      LIMIT 1
    `).get(workId) as { sourceId: string; editionId: string } | undefined;

    // If no source exists, ensure edition & physical source exist
    if (!sourceRow) {
      let editionRow = this.db.prepare(`SELECT id FROM edition WHERE work_id = ? LIMIT 1`).get(workId) as { id: string } | undefined;
      let editionId = editionRow?.id;
      if (!editionId) {
        editionId = crypto.randomUUID();
        this.db.prepare(`INSERT INTO edition (id, work_id, label) VALUES (?, ?, 'الطبعة الأولى')`).run(editionId, workId);
      }
      const sourceId = crypto.randomUUID();
      this.db.prepare(`
        INSERT INTO source (id, edition_id, source_type, status, added_at)
        VALUES (?, ?, 'physical', 'available', datetime('now'))
      `).run(sourceId, editionId);

      sourceRow = { sourceId, editionId };
    }

    // Upsert into physical_source_detail
    const existingPsd = this.db.prepare(`
      SELECT source_id FROM physical_source_detail WHERE source_id = ?
    `).get(sourceRow.sourceId);

    if (existingPsd) {
      this.db.prepare(`
        UPDATE physical_source_detail
        SET room = COALESCE(?, room),
            bookcase = COALESCE(?, bookcase),
            shelf = COALESCE(?, shelf),
            shelf_section = COALESCE(?, shelf_section),
            condition = COALESCE(?, condition),
            purchase_date = COALESCE(?, purchase_date),
            price = COALESCE(?, price)
        WHERE source_id = ?
      `).run(
        room !== undefined ? room : null,
        bookcase !== undefined ? bookcase : null,
        shelf !== undefined ? shelf : null,
        shelfSection !== undefined ? shelfSection : null,
        condition !== undefined ? condition : null,
        purchaseDate !== undefined ? purchaseDate : null,
        priceNum,
        sourceRow.sourceId
      );
    } else {
      this.db.prepare(`
        INSERT INTO physical_source_detail (
          source_id, room, bookcase, shelf, shelf_section, condition, purchase_date, price, lending_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available')
      `).run(
        sourceRow.sourceId,
        room || null,
        bookcase || null,
        shelf || null,
        shelfSection || null,
        condition || null,
        purchaseDate || null,
        priceNum
      );
    }

    // Also sync the location properties in metadata_json on work table
    try {
      const workMetaRow = this.db.prepare(`SELECT metadata_json FROM work WHERE id = ?`).get(workId) as any;
      let meta: Record<string, any> = {};
      if (workMetaRow?.metadata_json) {
        meta = JSON.parse(workMetaRow.metadata_json);
      }
      meta.physicalLocation = {
        room: room || meta.physicalLocation?.room,
        bookcase: bookcase || meta.physicalLocation?.bookcase,
        shelf: shelf || meta.physicalLocation?.shelf,
        shelfSection: shelfSection || meta.physicalLocation?.shelfSection,
      };
      if (condition) meta.condition = condition;
      if (purchaseDate || priceNum !== null) {
        meta.acquisition = {
          ...meta.acquisition,
          purchaseDate: purchaseDate || meta.acquisition?.purchaseDate,
          price: priceNum !== null ? priceNum : meta.acquisition?.price,
        };
      }
      this.db.prepare(`UPDATE work SET metadata_json = ? WHERE id = ?`).run(JSON.stringify(meta), workId);
    } catch (err) {
      console.warn('[PhysicalLibraryService] metadata_json sync error:', err);
    }

    return true;
  }

  // ============================================================================
  // LENDING LIFECYCLE MANAGEMENT
  // ============================================================================

  /**
   * Registers a new loan for a book.
   */
  public borrowBook(input: BorrowBookInput): LendingRecord {
    const { workId, borrowerName, borrowerContact, borrowDate, expectedReturnDate, conditionOut, notes } = input;

    if (!workId || !borrowerName || !borrowerName.trim()) {
      throw new Error('Work ID and Borrower Name are required / معرّف العمل واسم المستعير مطلوبان');
    }

    // Check if there is already an active unreturned loan for this work
    const existingLoan = this.db.prepare(`
      SELECT id, borrower_name as borrowerName FROM lending_record
      WHERE work_id = ? AND is_returned = 0
      LIMIT 1
    `).get(workId) as any;

    if (existingLoan) {
      throw new Error(`الكتاب معار حالياً إلى "${existingLoan.borrowerName}" / Book is currently already loaned to "${existingLoan.borrowerName}"`);
    }

    const loanId = crypto.randomUUID();
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const bDate = borrowDate || today;

    // Auto-calculate overdue if expectedReturnDate is already in the past
    const status: LoanStatus = expectedReturnDate && expectedReturnDate < today ? 'overdue' : 'active';

    const insertStmt = this.db.prepare(`
      INSERT INTO lending_record (
        id, work_id, borrower_name, borrower_contact, borrow_date, expected_return_date,
        actual_return_date, is_returned, status, condition_out, condition_return, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, NULL, ?, ?)
    `);

    const updatePsdStmt = this.db.prepare(`
      UPDATE physical_source_detail
      SET lending_status = ?
      WHERE source_id IN (
        SELECT s.id FROM source s
        JOIN edition e ON e.id = s.edition_id
        WHERE e.work_id = ?
      )
    `);

    const updateSourceStmt = this.db.prepare(`
      UPDATE source
      SET status = ?
      WHERE edition_id IN (
        SELECT id FROM edition WHERE work_id = ?
      )
    `);

    const tx = this.db.transaction(() => {
      insertStmt.run(
        loanId,
        workId,
        borrowerName.trim(),
        borrowerContact?.trim() || null,
        bDate,
        expectedReturnDate || null,
        status,
        conditionOut || null,
        notes || null,
        now
      );

      const targetStatus = status === 'overdue' ? 'overdue' : 'loaned';
      updatePsdStmt.run(targetStatus, workId);
      updateSourceStmt.run(targetStatus, workId);
    });

    tx();

    return {
      id: loanId,
      borrowerName: borrowerName.trim(),
      borrowerContact: borrowerContact?.trim(),
      borrowDate: bDate,
      expectedReturnDate: expectedReturnDate || '',
      isReturned: false,
      notes,
    };
  }

  /**
   * Completes a loan return, auditing condition changes and restoring availability.
   */
  public returnBook(input: ReturnBookInput): LendingRecord {
    const { loanId, actualReturnDate, conditionOnReturn, notes } = input;

    const loan = this.db.prepare(`
      SELECT * FROM lending_record WHERE id = ?
    `).get(loanId) as any;

    if (!loan) {
      throw new Error('لم يتم العثور على سجل الإعارة / Lending record not found');
    }

    if (loan.is_returned) {
      throw new Error('تم إرجاع هذا الكتاب مسبقاً / This book has already been returned');
    }

    const today = new Date().toISOString().split('T')[0];
    const retDate = actualReturnDate || today;

    const tx = this.db.transaction(() => {
      // 1. Mark lending record as returned
      this.db.prepare(`
        UPDATE lending_record
        SET is_returned = 1,
            status = 'returned',
            actual_return_date = ?,
            condition_return = COALESCE(?, condition_return),
            notes = COALESCE(?, notes)
        WHERE id = ?
      `).run(retDate, conditionOnReturn || null, notes || null, loanId);

      // 2. If returned condition changed, update physical_source_detail condition
      if (conditionOnReturn) {
        this.db.prepare(`
          UPDATE physical_source_detail
          SET condition = ?
          WHERE source_id IN (
            SELECT s.id FROM source s
            JOIN edition e ON e.id = s.edition_id
            WHERE e.work_id = ?
          )
        `).run(conditionOnReturn, loan.work_id);
      }

      // 3. Restore lending_status to 'available'
      this.db.prepare(`
        UPDATE physical_source_detail
        SET lending_status = 'available'
        WHERE source_id IN (
          SELECT s.id FROM source s
          JOIN edition e ON e.id = s.edition_id
          WHERE e.work_id = ?
        )
      `).run(loan.work_id);

      this.db.prepare(`
        UPDATE source
        SET status = 'available'
        WHERE edition_id IN (
          SELECT id FROM edition WHERE work_id = ?
        )
      `).run(loan.work_id);
    });

    tx();

    return {
      id: loan.id,
      borrowerName: loan.borrower_name,
      borrowerContact: loan.borrower_contact || undefined,
      borrowDate: loan.borrow_date,
      expectedReturnDate: loan.expected_return_date || '',
      actualReturnDate: retDate,
      isReturned: true,
      conditionOnReturn,
      notes: notes || loan.notes || undefined,
    };
  }

  /**
   * Audits all active loans and flags overdue records against current calendar date.
   */
  public checkAndRefreshOverdueLoans(): LendingAuditResult {
    const today = new Date().toISOString().split('T')[0];

    const overdueLoans = this.db.prepare(`
      SELECT 
        lr.id,
        lr.work_id as workId,
        w.title as workTitle,
        lr.borrower_name as borrowerName,
        lr.expected_return_date as expectedReturnDate
      FROM lending_record lr
      JOIN work w ON w.id = lr.work_id
      WHERE lr.is_returned = 0
        AND lr.expected_return_date IS NOT NULL
        AND lr.expected_return_date < ?
    `).all(today) as { id: string; workId: string; workTitle: string; borrowerName: string; expectedReturnDate: string }[];

    const todayDate = new Date(today);
    const refreshed: {
      id: string;
      workId: string;
      workTitle: string;
      borrowerName: string;
      daysOverdue: number;
    }[] = [];

    const updateLoanStmt = this.db.prepare(`UPDATE lending_record SET status = 'overdue' WHERE id = ?`);
    const updatePsdStmt = this.db.prepare(`
      UPDATE physical_source_detail 
      SET lending_status = 'overdue' 
      WHERE source_id IN (
        SELECT s.id FROM source s JOIN edition e ON e.id = s.edition_id WHERE e.work_id = ?
      )
    `);

    const tx = this.db.transaction(() => {
      for (const item of overdueLoans) {
        updateLoanStmt.run(item.id);
        updatePsdStmt.run(item.workId);

        const expDate = new Date(item.expectedReturnDate);
        const diffDays = Math.max(1, Math.round((todayDate.getTime() - expDate.getTime()) / (1000 * 3600 * 24)));

        refreshed.push({
          id: item.id,
          workId: item.workId,
          workTitle: item.workTitle,
          borrowerName: item.borrowerName,
          daysOverdue: diffDays,
        });
      }
    });

    tx();

    return {
      overdueCount: refreshed.length,
      refreshedLoans: refreshed,
    };
  }

  /**
   * Retrieves full chronological loan history for a specific work.
   */
  public getLendingHistory(workId: string): LendingRecord[] {
    const today = new Date().toISOString().split('T')[0];

    const rows = this.db.prepare(`
      SELECT 
        id,
        borrower_name as borrowerName,
        borrower_contact as borrowerContact,
        borrow_date as borrowDate,
        expected_return_date as expectedReturnDate,
        actual_return_date as actualReturnDate,
        is_returned as isReturned,
        status,
        condition_out as conditionOut,
        condition_return as conditionOnReturn,
        notes
      FROM lending_record
      WHERE work_id = ?
      ORDER BY borrow_date DESC, created_at DESC
    `).all(workId) as any[];

    return rows.map((r) => ({
      id: r.id,
      borrowerName: r.borrowerName,
      borrowerContact: r.borrowerContact || undefined,
      borrowDate: r.borrowDate,
      expectedReturnDate: r.expectedReturnDate || '',
      actualReturnDate: r.actualReturnDate || undefined,
      isReturned: Boolean(r.isReturned),
      conditionOnReturn: r.conditionOnReturn || undefined,
      notes: r.notes || undefined,
    }));
  }

  /**
   * Retrieves all loans across the library with optional status filter.
   */
  public getAllLoans(filter: 'all' | 'active' | 'overdue' | 'returned' = 'all') {
    this.checkAndRefreshOverdueLoans();

    let query = `
      SELECT 
        lr.id,
        lr.work_id as workId,
        w.title as workTitle,
        GROUP_CONCAT(DISTINCT a.name) as author,
        lr.borrower_name as borrowerName,
        lr.borrower_contact as borrowerContact,
        lr.borrow_date as borrowDate,
        lr.expected_return_date as expectedReturnDate,
        lr.actual_return_date as actualReturnDate,
        lr.is_returned as isReturned,
        lr.status,
        lr.condition_out as conditionOut,
        lr.condition_return as conditionOnReturn,
        lr.notes,
        psd.room,
        psd.shelf
      FROM lending_record lr
      JOIN work w ON w.id = lr.work_id
      LEFT JOIN work_author wa ON wa.work_id = w.id
      LEFT JOIN author a ON a.id = wa.author_id
      LEFT JOIN edition e ON e.work_id = w.id
      LEFT JOIN source s ON s.edition_id = e.id
      LEFT JOIN physical_source_detail psd ON psd.source_id = s.id
    `;

    if (filter === 'active') {
      query += ` WHERE lr.is_returned = 0`;
    } else if (filter === 'overdue') {
      query += ` WHERE lr.is_returned = 0 AND lr.status = 'overdue'`;
    } else if (filter === 'returned') {
      query += ` WHERE lr.is_returned = 1`;
    }

    query += ` GROUP BY lr.id ORDER BY lr.borrow_date DESC, lr.created_at DESC`;

    return this.db.prepare(query).all().map((r: any) => ({
      ...r,
      isReturned: Boolean(r.isReturned),
    }));
  }

  /**
   * Aggregates borrower contacts with past and active loan statistics.
   */
  public getBorrowers(): BorrowerSummary[] {
    const today = new Date().toISOString().split('T')[0];

    const rows = this.db.prepare(`
      SELECT 
        borrower_name as borrowerName,
        MAX(borrower_contact) as borrowerContact,
        COUNT(*) as totalLoans,
        SUM(CASE WHEN is_returned = 0 THEN 1 ELSE 0 END) as activeLoans,
        SUM(CASE WHEN is_returned = 0 AND expected_return_date < ? THEN 1 ELSE 0 END) as overdueLoans,
        MAX(borrow_date) as lastLoanDate
      FROM lending_record
      GROUP BY borrower_name
      ORDER BY activeLoans DESC, lastLoanDate DESC
    `).all(today) as any[];

    return rows.map((r) => ({
      borrowerName: r.borrowerName,
      borrowerContact: r.borrowerContact || undefined,
      totalLoans: r.totalLoans || 0,
      activeLoans: r.activeLoans || 0,
      overdueLoans: r.overdueLoans || 0,
      lastLoanDate: r.lastLoanDate || today,
    }));
  }
}

// Singleton provider instance
let serviceInstance: PhysicalLibraryService | null = null;

export function getPhysicalLibraryService(db: Database): PhysicalLibraryService {
  if (!serviceInstance) {
    serviceInstance = new PhysicalLibraryService(db);
  }
  return serviceInstance;
}
