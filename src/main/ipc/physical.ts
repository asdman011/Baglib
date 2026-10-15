/**
 * Baglib — Physical Library & Lending IPC Handlers
 *
 * Exposes physical location tracking, shelf/room trees, inventory statistics,
 * borrower lifecycle, and loan state transitions to the renderer.
 */

import { ipcMain } from 'electron';
import { getDatabase } from '../database/connection';
import { getPhysicalLibraryService } from '../services/physical/physical-library.service';
import type {
  UpdatePhysicalLocationInput,
  BorrowBookInput,
  ReturnBookInput,
} from '../../shared/types/physical-library';

export function setupPhysicalIPC() {
  /**
   * Retrieves unique rooms, bookcases, shelves, and sections for autocomplete.
   */
  ipcMain.handle('physical:get-locations', () => {
    try {
      const db = getDatabase();
      const service = getPhysicalLibraryService(db);
      return service.getLocations();
    } catch (err: any) {
      console.error('[baglib/physical-ipc] Failed to fetch physical locations:', err);
      return {
        rooms: [],
        bookcases: [],
        shelves: [],
        shelfSections: [],
      };
    }
  });

  /**
   * Retrieves hierarchical location tree with book counts (Room -> Bookcase -> Shelf).
   */
  ipcMain.handle('physical:get-location-tree', () => {
    try {
      const db = getDatabase();
      const service = getPhysicalLibraryService(db);
      return service.getLocationTree();
    } catch (err: any) {
      console.error('[baglib/physical-ipc] Failed to fetch location tree:', err);
      return [];
    }
  });

  /**
   * Computes physical inventory metrics, condition counts, and total collection value.
   */
  ipcMain.handle('physical:get-inventory-stats', () => {
    try {
      const db = getDatabase();
      const service = getPhysicalLibraryService(db);
      return service.getPhysicalInventoryStats();
    } catch (err: any) {
      console.error('[baglib/physical-ipc] Failed to fetch physical inventory stats:', err);
      return {
        totalPhysicalBooks: 0,
        availableCount: 0,
        borrowedCount: 0,
        overdueCount: 0,
        conditionDistribution: {},
        totalEstimatedValue: 0,
        currencySummary: {},
        topLocations: [],
      };
    }
  });

  /**
   * Updates or assigns the physical location and acquisition data of a work.
   */
  ipcMain.handle('physical:update-location', (_, input: UpdatePhysicalLocationInput) => {
    try {
      const db = getDatabase();
      const service = getPhysicalLibraryService(db);
      return service.updatePhysicalLocation(input);
    } catch (err: any) {
      console.error('[baglib/physical-ipc] Failed to update physical location:', err);
      throw err;
    }
  });

  /**
   * Records a new borrower loan for a work.
   */
  ipcMain.handle('lending:borrow-book', (_, input: BorrowBookInput) => {
    try {
      const db = getDatabase();
      const service = getPhysicalLibraryService(db);
      return service.borrowBook(input);
    } catch (err: any) {
      console.error('[baglib/physical-ipc] Failed to borrow book:', err);
      throw err;
    }
  });

  /**
   * Marks a book loan as returned and audits condition changes.
   */
  ipcMain.handle('lending:return-book', (_, input: ReturnBookInput) => {
    try {
      const db = getDatabase();
      const service = getPhysicalLibraryService(db);
      return service.returnBook(input);
    } catch (err: any) {
      console.error('[baglib/physical-ipc] Failed to return book:', err);
      throw err;
    }
  });

  /**
   * Audits active loans and refreshes overdue flags.
   */
  ipcMain.handle('lending:check-overdue', () => {
    try {
      const db = getDatabase();
      const service = getPhysicalLibraryService(db);
      return service.checkAndRefreshOverdueLoans();
    } catch (err: any) {
      console.error('[baglib/physical-ipc] Failed to check overdue loans:', err);
      return { overdueCount: 0, refreshedLoans: [] };
    }
  });

  /**
   * Retrieves full chronological loan history for a specific work.
   */
  ipcMain.handle('lending:get-history', (_, workId: string) => {
    try {
      const db = getDatabase();
      const service = getPhysicalLibraryService(db);
      return service.getLendingHistory(workId);
    } catch (err: any) {
      console.error('[baglib/physical-ipc] Failed to get lending history:', err);
      return [];
    }
  });

  /**
   * Retrieves all loans across the library (optional filter: 'all' | 'active' | 'overdue' | 'returned').
   */
  ipcMain.handle('lending:get-all-loans', (_, filter?: 'all' | 'active' | 'overdue' | 'returned') => {
    try {
      const db = getDatabase();
      const service = getPhysicalLibraryService(db);
      return service.getAllLoans(filter);
    } catch (err: any) {
      console.error('[baglib/physical-ipc] Failed to get all loans:', err);
      return [];
    }
  });

  /**
   * Aggregates borrowers with past loan statistics and contact information.
   */
  ipcMain.handle('lending:get-borrowers', () => {
    try {
      const db = getDatabase();
      const service = getPhysicalLibraryService(db);
      return service.getBorrowers();
    } catch (err: any) {
      console.error('[baglib/physical-ipc] Failed to get borrowers:', err);
      return [];
    }
  });
}
