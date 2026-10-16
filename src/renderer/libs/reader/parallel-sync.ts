/**
 * Parallel Reading Synchronous Navigation Engine
 * Reverse-engineered from Readest (parallelViewStore.ts & useProgressSync.ts)
 * 
 * Provides proportional scroll/page locking, bi-directional loop protection,
 * and relative document length mapping for dual-pane study (e.g. Matn + Sharh).
 */

export interface ParallelPaneState {
  bookId: string;
  currentPage: number;
  totalPages: number;
  cfi?: string;
}

/**
 * Calculates normalized 0..1 reading progress fraction.
 */
export function calculateReadingFraction(currentPage: number, totalPages: number): number {
  if (totalPages <= 1 || currentPage <= 1) return 0;
  if (currentPage >= totalPages) return 1;
  return (currentPage - 1) / (totalPages - 1);
}

/**
 * Maps a page from Source Document to the proportionally equivalent page in Target Document.
 */
export function calculateProportionalPage(
  sourcePage: number,
  sourceTotalPages: number,
  targetTotalPages: number
): number {
  if (targetTotalPages <= 1) return 1;
  if (sourceTotalPages <= 1) return 1;

  const fraction = calculateReadingFraction(sourcePage, sourceTotalPages);
  const targetPage = Math.round(fraction * (targetTotalPages - 1)) + 1;

  return Math.max(1, Math.min(targetTotalPages, targetPage));
}

/**
 * Controller managing synchronous navigation locking between two reading panes.
 * Enforces mutual recursion lock prevention to eliminate infinite ping-pong triggers.
 */
export class ParallelSyncController {
  private isLocked: boolean = false;
  private isDispatching: boolean = false;
  private onSyncTarget: ((targetPane: 'A' | 'B', targetPage: number) => void) | null = null;

  constructor(
    initiallyLocked = false,
    onSyncTarget?: (targetPane: 'A' | 'B', targetPage: number) => void
  ) {
    this.isLocked = initiallyLocked;
    if (onSyncTarget) {
      this.onSyncTarget = onSyncTarget;
    }
  }

  public setLocked(locked: boolean) {
    this.isLocked = locked;
  }

  public getLocked(): boolean {
    return this.isLocked;
  }

  public toggleLocked(): boolean {
    this.isLocked = !this.isLocked;
    return this.isLocked;
  }

  /**
   * Called when Pane A navigates. If sync is locked and not currently in a dispatch cycle,
   * calculates the proportional target for Pane B and triggers sync.
   */
  public handlePaneANavigate(pageA: number, totalA: number, totalB: number): number | null {
    if (!this.isLocked || this.isDispatching) return null;

    const targetB = calculateProportionalPage(pageA, totalA, totalB);
    this.isDispatching = true;
    try {
      this.onSyncTarget?.('B', targetB);
    } finally {
      this.isDispatching = false;
    }
    return targetB;
  }

  /**
   * Called when Pane B navigates. If sync is locked and not currently in a dispatch cycle,
   * calculates the proportional target for Pane A and triggers sync.
   */
  public handlePaneBNavigate(pageB: number, totalB: number, totalA: number): number | null {
    if (!this.isLocked || this.isDispatching) return null;

    const targetA = calculateProportionalPage(pageB, totalB, totalA);
    this.isDispatching = true;
    try {
      this.onSyncTarget?.('A', targetA);
    } finally {
      this.isDispatching = false;
    }
    return targetA;
  }

  public destroy() {
    this.isLocked = false;
    this.isDispatching = false;
    this.onSyncTarget = null;
  }
}
