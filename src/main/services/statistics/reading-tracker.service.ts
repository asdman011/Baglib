/**
 * Baglib — Reading Tracker Service (KEY-149)
 *
 * Implements KOReader / Readest reading session tracking:
 * - Active page dwell tracking with idle detection
 * - Hard dwell cap (MAX_PAGE_SECONDS = 180s) to prevent inflated read times
 * - Automatic session flush on page turns, book close, or reader blur
 */

import {
  readingStatisticsRepository,
  IReadingStatisticsRepository,
  MAX_PAGE_SECONDS,
} from '../../database/repositories/reading-statistics.repository';
import type {
  ReadingBookStat,
  DailyReadingHeatmapEntry,
  ReadingStreakStats,
  RecordReadingProgressPayload,
} from '../../../shared/types/reading-statistics';

export interface ActiveReadingSession {
  bookId: string;
  title: string;
  authors?: string;
  md5?: string;
  currentPage: number;
  totalPages?: number;
  subject?: string;
  pageStartTime: number; // in seconds
  lastHeartbeatTime: number; // in seconds
}

export class ReadingTrackerService {
  private activeSession: ActiveReadingSession | null = null;

  constructor(
    private readonly statsRepo: IReadingStatisticsRepository = readingStatisticsRepository
  ) {}

  /**
   * Starts or resumes a reading session for a given book.
   */
  startSession(payload: {
    bookId: string;
    title: string;
    authors?: string;
    md5?: string;
    page: number;
    totalPages?: number;
    subject?: string;
  }): void {
    const now = Math.floor(Date.now() / 1000);

    // If there is an existing session for a different book or page, flush it first
    if (this.activeSession) {
      this.flushCurrentPage(now);
    }

    this.activeSession = {
      bookId: payload.bookId,
      title: payload.title || 'Untitled Book',
      authors: payload.authors,
      md5: payload.md5,
      currentPage: payload.page,
      totalPages: payload.totalPages,
      subject: payload.subject || 'General',
      pageStartTime: now,
      lastHeartbeatTime: now,
    };

    // Ensure book is registered in repository on session start
    this.statsRepo.initBook({
      bookId: payload.bookId,
      title: payload.title,
      authors: payload.authors,
      md5: payload.md5,
      totalPages: payload.totalPages,
      subject: payload.subject,
    });
  }

  /**
   * Heartbeat called periodically while the user is actively viewing/scrolling the reader.
   * Updates last heartbeat time.
   */
  heartbeat(): void {
    if (!this.activeSession) return;
    const now = Math.floor(Date.now() / 1000);
    this.activeSession.lastHeartbeatTime = now;
  }

  /**
   * Called when reader turns page. Flushes time spent on previous page and begins new page timer.
   */
  turnPage(newPage: number, totalPages?: number): void {
    if (!this.activeSession) return;
    const now = Math.floor(Date.now() / 1000);
    this.flushCurrentPage(now);

    this.activeSession.currentPage = newPage;
    if (totalPages !== undefined) {
      this.activeSession.totalPages = totalPages;
    }
    this.activeSession.pageStartTime = now;
    this.activeSession.lastHeartbeatTime = now;
  }

  /**
   * Flushes current page time and terminates active session (e.g. closing book or leaving reader).
   */
  endSession(): void {
    if (!this.activeSession) return;
    const now = Math.floor(Date.now() / 1000);
    this.flushCurrentPage(now);
    this.activeSession = null;
  }

  /**
   * Flushes time spent on current page into repository with dwell capping.
   */
  private flushCurrentPage(now: number): void {
    if (!this.activeSession) return;

    // Elapsed time since page started, but capped if user became idle without heartbeats
    const rawElapsed = now - this.activeSession.pageStartTime;
    // Cap at idle gap: if user walked away 20 minutes ago, heartbeat stopped earlier
    const heartbeatElapsed = (this.activeSession.lastHeartbeatTime - this.activeSession.pageStartTime) + 5;
    const duration = Math.min(rawElapsed, heartbeatElapsed, MAX_PAGE_SECONDS);

    if (duration >= 1) {
      // Record only meaningful visits >= 2 seconds (filters accidental rapid flips)
      this.statsRepo.recordPageReading({
        bookId: this.activeSession.bookId,
        title: this.activeSession.title,
        authors: this.activeSession.authors,
        md5: this.activeSession.md5,
        page: this.activeSession.currentPage,
        durationSeconds: duration,
        totalPages: this.activeSession.totalPages,
        subject: this.activeSession.subject,
      });
    }
  }

  /** Directly records reading progress from renderer or external sources */
  recordReadingProgress(payload: RecordReadingProgressPayload): void {
    this.statsRepo.recordPageReading(payload);
  }

  getBookStats(bookId: string): ReadingBookStat | null {
    return this.statsRepo.getBookStats(bookId);
  }

  getAllBookStats(): ReadingBookStat[] {
    return this.statsRepo.getAllBookStats();
  }

  getMedianPageDuration(bookId: string): number | null {
    return this.statsRepo.getMedianPageDurationSecs(bookId);
  }

  getDailyHeatmap(days?: number): DailyReadingHeatmapEntry[] {
    return this.statsRepo.getDailyHeatmap(days);
  }

  getReadingStreakStats(): ReadingStreakStats {
    return this.statsRepo.getReadingStreakStats();
  }
}

export const readingTrackerService = new ReadingTrackerService();
