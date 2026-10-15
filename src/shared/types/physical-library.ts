/**
 * Baglib — Physical Library & Lending Types
 *
 * Domain models and DTOs for physical copy location tracking,
 * inventory auditing, borrower lifecycle, and loan state machines.
 */

import type { PhysicalCondition, PhysicalLocation } from './metadata';

export interface LocationHierarchy {
  rooms: string[];
  bookcases: string[];
  shelves: string[];
  shelfSections: string[];
}

export interface ShelfNode {
  shelf: string;
  count: number;
}

export interface BookcaseNode {
  bookcase: string;
  count: number;
  shelves: ShelfNode[];
}

export interface LocationTreeNode {
  room: string;
  count: number;
  bookcases: BookcaseNode[];
}

export interface PhysicalInventoryStats {
  totalPhysicalBooks: number;
  availableCount: number;
  borrowedCount: number;
  overdueCount: number;
  conditionDistribution: Record<string, number>;
  totalEstimatedValue: number;
  currencySummary: Record<string, number>;
  topLocations: { location: string; count: number }[];
}

export interface UpdatePhysicalLocationInput {
  workId: string;
  room?: string;
  bookcase?: string;
  shelf?: string;
  shelfSection?: string;
  condition?: PhysicalCondition | string;
  purchaseDate?: string;
  price?: string | number;
}

export interface BorrowBookInput {
  workId: string;
  borrowerName: string;
  borrowerContact?: string;
  borrowDate?: string;
  expectedReturnDate?: string;
  conditionOut?: string;
  notes?: string;
}

export interface ReturnBookInput {
  loanId: string;
  actualReturnDate?: string;
  conditionOnReturn?: string;
  notes?: string;
}

export interface BorrowerSummary {
  borrowerName: string;
  borrowerContact?: string;
  totalLoans: number;
  activeLoans: number;
  overdueLoans: number;
  lastLoanDate: string;
}

export interface LendingAuditResult {
  overdueCount: number;
  refreshedLoans: {
    id: string;
    workId: string;
    workTitle: string;
    borrowerName: string;
    daysOverdue: number;
  }[];
}
